// =====================================================================
// ScholarService.cs - admin work on scholars (Admin > Scholars page).
// Called by ScholarsController (/api/admin/scholars).
// List / view / create / edit / activate-deactivate.
// =====================================================================
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class ScholarService(IskolarDbContext db, PasswordService passwords, ActivityLogService log, IEmailSender email,
    IOptions<SmtpOptions> smtp)
{
    // All the statuses a scholar can have (shown in drop-downs).
    public static readonly string[] Statuses =
        ["Active", "Inactive", "Probation", "Suspended", "Graduated", "Terminated", "Withdrawn", "Expelled", "Completed", "Dropped"];

    // Courses offered by the college (shown in drop-downs).
    public static readonly string[] Courses =
    [
        "Bachelor of Science in Business Administration (Major in Financial Management)",
        "Bachelor of Science in Business Administration (Major in Marketing Management)",
        "Bachelor of Science in Business Administration (Major in Human Resource Management)",
        "Bachelor of Science in Criminology",
        "Bachelor of Elementary Education (Generalist)",
        "Bachelor of Secondary Education (Major in English)",
        "Bachelor of Secondary Education (Major in Social Studies)",
        "Bachelor of Secondary Education (Major in Values Education)",
        "Bachelor of Science in Information Technology",
        "Bachelor of Science in Tourism Management"
    ];

    // Choices for the filter bar on the Scholars page.
    public async Task<ScholarFiltersDto> FiltersAsync()
    {
        var types = await db.ScholarshipTypes.Where(t => t.IsActive).OrderBy(t => t.Name).Select(t => new OptionDto(t.Id, t.Name)).ToListAsync();
        return new ScholarFiltersDto(Statuses, types, Courses);
    }

    // One page of the scholar table. Filters: status, scholarship type, search text.
    // Search matches first name, last name, scholar number, student id or email.
    public async Task<PagedResult<ScholarListItemDto>> ListAsync(string? search, string? status, int? scholarshipTypeId, int page, int pageSize)
    {
        var q = db.Scholars.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && status != "All") q = q.Where(s => s.Status == status);
        if (scholarshipTypeId is > 0) q = q.Where(s => s.ScholarshipTypeId == scholarshipTypeId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            q = q.Where(s => s.FirstName.Contains(term) || s.LastName.Contains(term) || s.ScholarNumber.Contains(term) ||
                             (s.StudentId != null && s.StudentId.Contains(term)) || (s.Email != null && s.Email.Contains(term)));
        }
        // Count all matches first (for the pager), then fetch only this page, newest first.
        var total = await q.CountAsync();
        var rows = await q.OrderByDescending(s => s.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(s => new { s.Id, s.ScholarNumber, s.StudentId, s.FirstName, s.MiddleName, s.LastName, s.Course, s.YearLevel,
                Scholarship = s.ScholarshipType != null ? s.ScholarshipType.Name : null, s.Status }).ToListAsync();
        var items = rows.Select(s => new ScholarListItemDto(s.Id, s.ScholarNumber, s.StudentId,
            ScholarRules.FullName(s.FirstName, s.MiddleName, s.LastName), s.Course, s.YearLevel, s.Scholarship, s.Status)).ToList();
        return new PagedResult<ScholarListItemDto>(items, total, page, pageSize);
    }

    // Everything shown on the scholar details view: profile, payment totals,
    // compliance counts, and the five default documents with their files.
    public async Task<ScholarDetailDto> GetAsync(int id)
    {
        var s = await db.Scholars.AsNoTracking().Include(x => x.ScholarshipType).FirstOrDefaultAsync(x => x.Id == id)
                ?? throw AppException.NotFound("Scholar");
        var pays = await db.Payments.Where(p => p.ScholarId == id).Select(p => new { p.Amount, p.Status }).ToListAsync();
        var comp = await db.ComplianceRecords.Where(c => c.ScholarId == id).OrderBy(c => c.Id).ToListAsync();
        var fileMap = (await db.FileAttachments.Where(f => f.ScholarId == id).Select(f => new { f.ComplianceId, f.FileName }).ToListAsync())
            .GroupBy(f => f.ComplianceId).ToDictionary(g => g.Key, g => g.First().FileName);

        // Friendly labels for the five default documents (same order as ComplianceRules.DefaultTypes).
        var labels = new[] { "PSA Birth Certificate", "COE (Current Sem)", "COR", "Latest Grades", "Scholarship Contract" };
        var docs = new List<ScholarDocumentDto>();
        for (var i = 0; i < ComplianceRules.DefaultTypes.Length; i++)
        {
            var rec = comp.FirstOrDefault(c => c.RequirementType == ComplianceRules.DefaultTypes[i]);
            if (rec is null) continue;
            var fn = fileMap.GetValueOrDefault(rec.Id);
            docs.Add(new ScholarDocumentDto(ComplianceRules.DocKeys[i], labels[i], rec.Id, rec.Status, fn, fn != null));
        }

        return new ScholarDetailDto(s.Id, s.UserId, s.ScholarNumber, s.StudentId, s.FirstName, s.MiddleName, s.LastName, s.Email,
            s.ContactNumber, s.DateOfBirth, s.Gender, s.Address, s.Course, s.YearLevel, s.ScholarshipTypeId, s.ScholarshipType?.Name,
            s.StipendAmount ?? s.ScholarshipType?.StipendAmount ?? 0, s.StipendFrequency, s.ScholarshipFundSource, s.RenewalConditions,
            s.BankName, s.BankAccountNumber, s.EnrollmentDate, s.ExpectedGraduation, s.Status, s.CreatedAt,
            pays.Count, pays.Where(p => p.Status == "Released").Sum(p => p.Amount),
            comp.Count(c => c.Status is "Pending" or "Overdue"), comp.Count(c => c.Status == "Approved"), comp.Count, docs);
    }

    // Add a new scholar (admin form). Steps:
    // 1. Make the next scholar number (SCH-2026-001) and a student id if none was given.
    // 2. Make sure the student id is not taken.
    // 3. Create the login account (username = student id) as "Pending": nobody can log in
    //    until the scholar signs up and chooses a password (AuthService.SignUpAsync).
    // 4. Create the scholar row and the five default compliance requirements.
    // 5. Write an activity log, then email the scholar how to sign up.
    public async Task<ScholarCreatedDto> CreateAsync(ScholarSaveDto dto)
    {
        var type = await ResolveTypeAsync(dto);
        var year = DateTime.Now.Year;
        var fullName = ScholarRules.FullName(dto.FirstName, dto.MiddleName, dto.LastName, dto.Suffix);

        // Transaction: either everything below is saved, or nothing is.
        await using var tx = await db.Database.BeginTransactionAsync();
        var existing = await db.Scholars.Where(s => s.ScholarNumber.StartsWith($"SCH-{year}-")).Select(s => s.ScholarNumber).ToListAsync();
        var number = ScholarRules.NextScholarNumber(year, existing);
        var studentId = string.IsNullOrWhiteSpace(dto.StudentId)
            ? ScholarRules.GeneratedStudentId(year, ScholarRules.SequenceOf(number)) : dto.StudentId.Trim();

        if (await db.Users.AnyAsync(u => u.Username == studentId))
            throw AppException.Conflict("An account with this Student ID already exists.");
        if (await db.Scholars.AnyAsync(s => s.StudentId == studentId))
            throw AppException.Conflict("A scholar with this Student ID already exists.");

        // The random password is never shown to anyone; it only fills the column until the scholar signs up.
        var user = new User { Username = studentId, Password = passwords.Hash(ScholarRules.GeneratePassword()), Role = Roles.Scholar, Name = fullName, AccountStatus = AccountStatuses.Pending };
        var scholar = new Scholar
        {
            User = user, StudentId = studentId, ScholarNumber = number, FirstName = dto.FirstName.Trim(), MiddleName = dto.MiddleName?.Trim(),
            LastName = ScholarRules.LastNameWithSuffix(dto.LastName, dto.Suffix), Email = dto.Email.Trim(), ContactNumber = dto.ContactNumber?.Trim(),
            DateOfBirth = dto.DateOfBirth, Gender = dto.Gender ?? "Male", Address = dto.Address?.Trim(), Program = "Undergraduate",
            Hei = "Legacy College of Compostela", DegreeProgram = dto.Course, Course = dto.Course, YearLevel = dto.YearLevel,
            ScholarshipTypeId = type.Id, StipendAmount = dto.StipendAmount, StipendFrequency = dto.StipendFrequency ?? type.PaymentFrequency,
            ScholarshipFundSource = dto.ScholarshipFundSource, RenewalConditions = dto.RenewalConditions, BankName = dto.BankName?.Trim(),
            BankAccountNumber = dto.BankAccountNumber?.Trim(), EnrollmentDate = dto.EnrollmentDate, ExpectedGraduation = dto.ExpectedGraduation,
            Status = "Active"
        };
        db.Scholars.Add(scholar);
        await db.SaveChangesAsync();
        for (var i = 0; i < ComplianceRules.DefaultTypes.Length; i++)
            db.ComplianceRecords.Add(ComplianceService.NewDefault(scholar.Id, i, "Pending"));
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        await log.LogCreate("scholars", scholar.Id, $"Created new scholar: {fullName}");

        // Sending happens after saving. If the email fails the scholar is still created;
        // the admin sees the Scholar ID on screen and can pass it on.
        var (subject, body) = MessageTemplates.SignUpInvite(fullName, number, studentId, smtp.Value.SignUpUrl);
        var emailSent = await email.SendAsync(scholar.Email!, fullName, subject, body);
        if (emailSent) await log.LogCreate("notifications", 0, $"Sign-up email sent to {fullName} ({scholar.Email})");

        return new ScholarCreatedDto(scholar.Id, number, studentId, fullName, scholar.Email!, studentId, emailSent);
    }

    // Save changes from the admin edit form.
    public async Task UpdateAsync(int id, ScholarSaveDto dto)
    {
        var s = await db.Scholars.FindAsync(id) ?? throw AppException.NotFound("Scholar");
        var studentId = dto.StudentId?.Trim();
        if (!string.IsNullOrEmpty(studentId) && await db.Scholars.AnyAsync(x => x.StudentId == studentId && x.Id != id))
            throw AppException.Conflict("Another scholar already uses this Student ID.");
        if (dto.Status is { Length: > 0 } st && !Statuses.Contains(st)) throw new AppException("Invalid status.");
        var type = await ResolveTypeAsync(dto);

        s.StudentId = studentId; s.FirstName = dto.FirstName.Trim(); s.MiddleName = dto.MiddleName?.Trim();
        s.LastName = dto.LastName.Trim(); s.Email = dto.Email.Trim(); s.ContactNumber = dto.ContactNumber?.Trim();
        s.DateOfBirth = dto.DateOfBirth; s.Gender = dto.Gender ?? "Male"; s.Address = dto.Address?.Trim();
        s.Course = dto.Course; s.DegreeProgram = dto.Course; s.YearLevel = dto.YearLevel;
        s.ScholarshipTypeId = type.Id; s.StipendAmount = dto.StipendAmount;
        s.StipendFrequency = dto.StipendFrequency ?? "Monthly"; s.ScholarshipFundSource = dto.ScholarshipFundSource;
        s.RenewalConditions = dto.RenewalConditions; s.BankName = dto.BankName?.Trim(); s.BankAccountNumber = dto.BankAccountNumber?.Trim();
        s.EnrollmentDate = dto.EnrollmentDate; s.ExpectedGraduation = dto.ExpectedGraduation; s.Status = dto.Status ?? "Active";
        await db.SaveChangesAsync();
        await log.LogUpdate("scholars", id, $"Updated scholar: {s.FirstName} {s.LastName}");
    }

    // The admin form lets you pick a scholarship type from the list OR type its name.
    // A typed name that matches a type (ignoring upper/lower case) uses that type;
    // a new name creates a new type, using the stipend amount and frequency from the form.
    private async Task<ScholarshipType> ResolveTypeAsync(ScholarSaveDto dto)
    {
        if (dto.ScholarshipTypeId is > 0)
            return await db.ScholarshipTypes.FindAsync(dto.ScholarshipTypeId.Value)
                   ?? throw new AppException("Please select a valid scholarship type.");

        var name = dto.ScholarshipTypeName?.Trim();
        if (string.IsNullOrEmpty(name)) throw new AppException("Please type or select a scholarship type.");
        var lower = name.ToLower();
        var found = await db.ScholarshipTypes.FirstOrDefaultAsync(t => t.Name.ToLower() == lower);
        if (found is not null) return found;

        if (dto.StipendAmount <= 0) throw new AppException($"'{name}' is a new scholarship type. Please enter its stipend amount.");
        var type = new ScholarshipType
        {
            Name = name, StipendAmount = dto.StipendAmount,
            PaymentFrequency = ScholarshipCatalog.Frequencies.Contains(dto.StipendFrequency) ? dto.StipendFrequency! : "Monthly",
            FundSource = dto.ScholarshipFundSource, RenewalConditions = dto.RenewalConditions, IsActive = true
        };
        db.ScholarshipTypes.Add(type);
        await db.SaveChangesAsync();
        await log.LogCreate("scholarship_types", type.Id, $"Added scholarship type: {type.Name}");
        return type;
    }

    // Active -> Inactive, anything else -> Active. Returns the new status.
    public async Task<string> ToggleStatusAsync(int id)
    {
        var s = await db.Scholars.FindAsync(id) ?? throw AppException.NotFound("Scholar");
        var wasActive = s.Status == "Active";
        s.Status = wasActive ? "Inactive" : "Active";
        await db.SaveChangesAsync();
        await log.LogUpdate("scholars", id, $"{(wasActive ? "Deactivated" : "Reactivated")} scholar");
        return s.Status;
    }
}
