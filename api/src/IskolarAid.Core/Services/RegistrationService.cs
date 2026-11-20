using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class RegistrationService(IskolarDbContext db, IFileStore files, PasswordService passwords, ActivityLogService log,
    IEmailSender email, IOptions<SmtpOptions> smtp, IOptions<UploadOptions> upload)
{
    public static readonly string[] RequiredFiles = ["PSA", "COE", "COR"];
    public static readonly string[] AllFiles = ["PSA", "COE", "COR", "Grades", "Contract"];

    public async Task<int> SubmitAsync(RegistrationSubmitDto dto, IReadOnlyList<RegistrationFile> uploads)
    {
        foreach (var key in RequiredFiles)
            if (uploads.All(u => u.Key != key))
                throw new AppException(key switch
                {
                    "PSA" => "Please upload your PSA Birth Certificate.",
                    "COE" => "Please upload your Certificate of Enrollment.",
                    _ => "Please upload your Certificate of Registration."
                });

        var type = await db.ScholarshipTypes.FirstOrDefaultAsync(t => t.Id == dto.ScholarshipTypeId && t.IsActive)
                   ?? throw new AppException("Please select a Scholarship Type.");

        var studentId = dto.StudentId.Trim();
        if (await db.Users.AnyAsync(u => u.Username == studentId) || await db.Scholars.AnyAsync(s => s.StudentId == studentId) ||
            await db.ScholarRegistrations.AnyAsync(r => r.StudentId == studentId && r.Status == "Pending"))
            throw AppException.Conflict("This Student ID or Email is already registered.");

        var saved = new Dictionary<string, string>();
        foreach (var u in uploads.Where(x => AllFiles.Contains(x.Key)))
        {
            var len = u.Content.CanSeek ? u.Content.Length : 1;
            UploadRules.Validate(u.FileName, len, upload.Value.MaxBytes);
            saved[u.Key] = await files.SaveAsync(u.Key, u.FileName, u.Content);
        }

        var reg = new ScholarRegistration
        {
            StudentId = studentId, FirstName = dto.FirstName.Trim(), MiddleName = dto.MiddleName?.Trim(),
            LastName = ScholarRules.LastNameWithSuffix(dto.LastName, dto.Suffix), Suffix = dto.Suffix?.Trim(),
            Email = dto.Email.Trim(), ContactNumber = dto.ContactNumber.Trim(), DateOfBirth = dto.DateOfBirth, Gender = dto.Gender,
            Address = dto.Address?.Trim(), Program = dto.Program ?? "Undergraduate", Hei = dto.Hei?.Trim(),
            DegreeProgram = dto.DegreeProgram, Course = dto.DegreeProgram, YearLevel = dto.YearLevel, ScholarshipTypeId = type.Id,
            // stipend info is copied from the selected scholarship type at registration time
            StipendAmount = type.StipendAmount, StipendFrequency = type.PaymentFrequency,
            ScholarshipFundSource = type.FundSource ?? "Government", RenewalConditions = type.RenewalConditions ?? "",
            EnrollmentDate = dto.EnrollmentDate, ExpectedGraduation = dto.ExpectedGraduation, BankName = dto.BankName?.Trim(),
            BankAccountNumber = dto.BankAccountNumber?.Trim(), Notes = dto.Notes?.Trim(), Status = "Pending",
            FilePsa = saved.GetValueOrDefault("PSA"), FileCoe = saved.GetValueOrDefault("COE"), FileCor = saved.GetValueOrDefault("COR"),
            FileGrades = saved.GetValueOrDefault("Grades"), FileContract = saved.GetValueOrDefault("Contract")
        };
        db.ScholarRegistrations.Add(reg);
        await db.SaveChangesAsync();
        await log.LogAsync("REGISTER", $"New scholar registration submitted: {ScholarRules.FullName(dto.FirstName, dto.MiddleName, dto.LastName, dto.Suffix)} (Student ID: {studentId})",
            "scholar_registrations", reg.Id, null, "System");
        return reg.Id;
    }

    public async Task<List<RegistrationListItemDto>> ListAsync()
    {
        var rows = await db.ScholarRegistrations.AsNoTracking().ToListAsync();
        int Order(string s) => s switch { "Pending" => 1, "Approved" => 2, _ => 3 };
        return rows.OrderBy(r => Order(r.Status)).ThenByDescending(r => r.CreatedAt)
            .Select(r => new RegistrationListItemDto(r.Id, ScholarRules.FullName(r.FirstName, r.MiddleName, r.LastName), r.Email,
                r.ContactNumber, r.Course, r.YearLevel, r.Status, r.RejectionReason, r.CreatedAt)).ToList();
    }

    public async Task<RegistrationDetailDto> GetAsync(int id)
    {
        var r = await db.ScholarRegistrations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw AppException.NotFound("Registration");
        var typeName = r.ScholarshipTypeId is { } tid ? (await db.ScholarshipTypes.FindAsync(tid))?.Name : null;
        var fileKeys = new List<string>();
        if (!string.IsNullOrEmpty(r.FilePsa)) fileKeys.Add("PSA");
        if (!string.IsNullOrEmpty(r.FileCoe)) fileKeys.Add("COE");
        if (!string.IsNullOrEmpty(r.FileCor)) fileKeys.Add("COR");
        if (!string.IsNullOrEmpty(r.FileGrades)) fileKeys.Add("Grades");
        if (!string.IsNullOrEmpty(r.FileContract)) fileKeys.Add("Contract");
        return new RegistrationDetailDto(r.Id, r.StudentId, r.FirstName, r.MiddleName, r.LastName, r.Suffix, r.Email, r.ContactNumber,
            r.DateOfBirth, r.Gender, r.Address, r.Program, r.Hei, r.DegreeProgram, r.YearLevel, r.ScholarshipTypeId, typeName,
            r.StipendAmount, r.StipendFrequency, r.ScholarshipFundSource, r.RenewalConditions, r.EnrollmentDate, r.ExpectedGraduation,
            r.BankName, r.BankAccountNumber, fileKeys, r.Notes, r.Status, r.RejectionReason, r.CreatedAt);
    }

    public async Task<(string Name, string ContentType, byte[] Data)> GetFileAsync(int id, string key)
    {
        var r = await db.ScholarRegistrations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id) ?? throw AppException.NotFound("Registration");
        var path = FileOf(r, key) ?? throw AppException.NotFound("File");
        var data = await files.ReadAsync(path) ?? throw AppException.NotFound("File");
        return (Path.GetFileName(path), UploadRules.ContentType(path), data);
    }

    private static string? FileOf(ScholarRegistration r, string key) => key switch
    {
        "PSA" => r.FilePsa, "COE" => r.FileCoe, "COR" => r.FileCor, "Grades" => r.FileGrades, "Contract" => r.FileContract, _ => null
    };

    /// <summary>Creates scholar + user (+ the 5 compliance records, with the applicant's documents attached), marks the registration Approved.</summary>
    public async Task<RegistrationApprovedDto> ApproveAsync(int id)
    {
        var r = await db.ScholarRegistrations.FirstOrDefaultAsync(x => x.Id == id) ?? throw AppException.NotFound("Registration");
        if (r.Status != "Pending") throw AppException.Conflict($"This registration was already {r.Status.ToLowerInvariant()}.");

        var year = DateTime.Now.Year;
        await using var tx = await db.Database.BeginTransactionAsync();
        var existing = await db.Scholars.Where(s => s.ScholarNumber.StartsWith($"SCH-{year}-")).Select(s => s.ScholarNumber).ToListAsync();
        var number = ScholarRules.NextScholarNumber(year, existing);
        var studentId = string.IsNullOrWhiteSpace(r.StudentId) ? ScholarRules.GeneratedStudentId(year, ScholarRules.SequenceOf(number)) : r.StudentId.Trim();
        if (await db.Users.AnyAsync(u => u.Username == studentId))
            throw AppException.Conflict("An account with this Student ID already exists.");

        var fullName = ScholarRules.FullName(r.FirstName, r.MiddleName, r.LastName);
        var password = ScholarRules.GeneratePassword();
        var user = new User { Username = studentId, Password = passwords.Hash(password), Role = Roles.Scholar, Name = fullName, AccountStatus = "Active" };
        var scholar = new Scholar
        {
            User = user, StudentId = studentId, ScholarNumber = number, FirstName = r.FirstName, MiddleName = r.MiddleName, LastName = r.LastName,
            Email = r.Email, ContactNumber = r.ContactNumber, DateOfBirth = r.DateOfBirth ?? DateTime.Now.AddYears(-18), Gender = r.Gender ?? "Male",
            Address = r.Address ?? "", Program = r.Program ?? "Undergraduate", Hei = r.Hei ?? "Legacy College of Compostela",
            DegreeProgram = r.DegreeProgram ?? r.Course, Course = r.Course, YearLevel = r.YearLevel, ScholarshipTypeId = r.ScholarshipTypeId,
            StipendAmount = r.StipendAmount, StipendFrequency = r.StipendFrequency, ScholarshipFundSource = r.ScholarshipFundSource ?? "Government",
            RenewalConditions = r.RenewalConditions ?? "Minimum GPA of 2.5, No failing grades", BankName = r.BankName, BankAccountNumber = r.BankAccountNumber,
            EnrollmentDate = r.EnrollmentDate ?? DateTime.Now, ExpectedGraduation = r.ExpectedGraduation ?? DateTime.Now.AddYears(4), Status = "Active"
        };
        db.Scholars.Add(scholar);
        await db.SaveChangesAsync();

        // Improvement over the desktop app: carry the applicant's uploaded documents over as submitted compliance records.
        var paths = new[] { r.FilePsa, r.FileCoe, r.FileCor, r.FileGrades, r.FileContract };
        for (var i = 0; i < ComplianceRules.DefaultTypes.Length; i++)
        {
            byte[]? data = string.IsNullOrEmpty(paths[i]) ? null : await files.ReadAsync(paths[i]!);
            var rec = ComplianceService.NewDefault(scholar.Id, i, data is null ? "Pending" : "Submitted");
            if (data is not null) { rec.DateSubmitted = DateTime.Today; rec.FilePath = Path.GetFileName(paths[i]!); }
            db.ComplianceRecords.Add(rec);
            await db.SaveChangesAsync();
            if (data is not null)
                db.FileAttachments.Add(new FileAttachment
                {
                    ScholarId = scholar.Id, ComplianceId = rec.Id, FileName = Path.GetFileName(paths[i]!), OriginalName = Path.GetFileName(paths[i]!),
                    FileType = Path.GetExtension(paths[i]!).ToLowerInvariant(), FileSize = data.Length, FileData = data
                });
        }
        r.Status = "Approved";
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        await log.LogCreate("scholars", scholar.Id, $"Approved registration #{r.Id}: {fullName} ({number})");
        var (subject, body) = MessageTemplates.Welcome(fullName, number, studentId, password, smtp.Value.LoginUrl);
        var sent = await email.SendAsync(r.Email, fullName, subject, body);
        return new RegistrationApprovedDto(scholar.Id, number, studentId, fullName, sent);
    }

    public async Task<bool> RejectAsync(int id, string reason, bool sendEmail)
    {
        var r = await db.ScholarRegistrations.FirstOrDefaultAsync(x => x.Id == id) ?? throw AppException.NotFound("Registration");
        if (r.Status != "Pending") throw AppException.Conflict($"This registration was already {r.Status.ToLowerInvariant()}.");
        r.Status = "Rejected";
        r.RejectionReason = reason.Trim();
        await db.SaveChangesAsync();
        await log.LogUpdate("scholar_registrations", id, $"Rejected registration for {r.FirstName} {r.LastName}");
        if (!sendEmail) return false;
        var (subject, body) = MessageTemplates.Rejection($"{r.FirstName} {r.LastName}", reason);
        return await email.SendAsync(r.Email, $"{r.FirstName} {r.LastName}", subject, body);
    }
}
