using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class ScholarService(IskolarDbContext db, PasswordService passwords, ActivityLogService log, IEmailSender email,
    ISmsSender sms, IOptions<SmtpOptions> smtp)
{
    public static readonly string[] Statuses =
        ["Active", "Inactive", "Probation", "Suspended", "Graduated", "Terminated", "Withdrawn", "Expelled", "Completed", "Dropped"];

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

    public async Task<ScholarFiltersDto> FiltersAsync()
    {
        var types = await db.ScholarshipTypes.Where(t => t.IsActive).OrderBy(t => t.Name).Select(t => new OptionDto(t.Id, t.Name)).ToListAsync();
        return new ScholarFiltersDto(Statuses, types, Courses);
    }

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
        var total = await q.CountAsync();
        var rows = await q.OrderByDescending(s => s.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(s => new { s.Id, s.ScholarNumber, s.StudentId, s.FirstName, s.MiddleName, s.LastName, s.Course, s.YearLevel,
                Scholarship = s.ScholarshipType != null ? s.ScholarshipType.Name : null, s.Status }).ToListAsync();
        var items = rows.Select(s => new ScholarListItemDto(s.Id, s.ScholarNumber, s.StudentId,
            ScholarRules.FullName(s.FirstName, s.MiddleName, s.LastName), s.Course, s.YearLevel, s.Scholarship, s.Status)).ToList();
        return new PagedResult<ScholarListItemDto>(items, total, page, pageSize);
    }

    public async Task<ScholarDetailDto> GetAsync(int id)
    {
        var s = await db.Scholars.AsNoTracking().Include(x => x.ScholarshipType).FirstOrDefaultAsync(x => x.Id == id)
                ?? throw AppException.NotFound("Scholar");
        var pays = await db.Payments.Where(p => p.ScholarId == id).Select(p => new { p.Amount, p.Status }).ToListAsync();
        var comp = await db.ComplianceRecords.Where(c => c.ScholarId == id).OrderBy(c => c.Id).ToListAsync();
        var fileMap = (await db.FileAttachments.Where(f => f.ScholarId == id).Select(f => new { f.ComplianceId, f.FileName }).ToListAsync())
            .GroupBy(f => f.ComplianceId).ToDictionary(g => g.Key, g => g.First().FileName);

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

    public async Task<ScholarCreatedDto> CreateAsync(ScholarSaveDto dto)
    {
        var type = await db.ScholarshipTypes.FindAsync(dto.ScholarshipTypeId)
                   ?? throw new AppException("Please select a valid scholarship type.");
        var year = DateTime.Now.Year;
        var fullName = ScholarRules.FullName(dto.FirstName, dto.MiddleName, dto.LastName, dto.Suffix);

        await using var tx = await db.Database.BeginTransactionAsync();
        var existing = await db.Scholars.Where(s => s.ScholarNumber.StartsWith($"SCH-{year}-")).Select(s => s.ScholarNumber).ToListAsync();
        var number = ScholarRules.NextScholarNumber(year, existing);
        var studentId = string.IsNullOrWhiteSpace(dto.StudentId)
            ? ScholarRules.GeneratedStudentId(year, ScholarRules.SequenceOf(number)) : dto.StudentId.Trim();

        if (await db.Users.AnyAsync(u => u.Username == studentId))
            throw AppException.Conflict("An account with this Student ID already exists.");
        if (await db.Scholars.AnyAsync(s => s.StudentId == studentId))
            throw AppException.Conflict("A scholar with this Student ID already exists.");

        var password = ScholarRules.GeneratePassword();
        var user = new User { Username = studentId, Password = passwords.Hash(password), Role = Roles.Scholar, Name = fullName, AccountStatus = "Active" };
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

        var (subject, body) = MessageTemplates.Welcome(fullName, number, studentId, password, smtp.Value.LoginUrl);
        var emailSent = await email.SendAsync(scholar.Email!, fullName, subject, body);
        var smsSent = !string.IsNullOrWhiteSpace(scholar.ContactNumber) && await sms.SendAsync(scholar.ContactNumber,
            $"IskolarAid: Welcome {dto.FirstName}! Account created. Login: {studentId} | Password: {password} -LCC");
        if (emailSent) await log.LogCreate("notifications", 0, $"Welcome email sent to {fullName} ({scholar.Email})");

        return new ScholarCreatedDto(scholar.Id, number, studentId, fullName, scholar.Email!, studentId, password, emailSent, smsSent);
    }

    public async Task UpdateAsync(int id, ScholarSaveDto dto)
    {
        var s = await db.Scholars.FindAsync(id) ?? throw AppException.NotFound("Scholar");
        var studentId = dto.StudentId?.Trim();
        if (!string.IsNullOrEmpty(studentId) && await db.Scholars.AnyAsync(x => x.StudentId == studentId && x.Id != id))
            throw AppException.Conflict("Another scholar already uses this Student ID.");
        if (dto.Status is { Length: > 0 } st && !Statuses.Contains(st)) throw new AppException("Invalid status.");

        s.StudentId = studentId; s.FirstName = dto.FirstName.Trim(); s.MiddleName = dto.MiddleName?.Trim();
        s.LastName = dto.LastName.Trim(); s.Email = dto.Email.Trim(); s.ContactNumber = dto.ContactNumber?.Trim();
        s.DateOfBirth = dto.DateOfBirth; s.Gender = dto.Gender ?? "Male"; s.Address = dto.Address?.Trim();
        s.Course = dto.Course; s.DegreeProgram = dto.Course; s.YearLevel = dto.YearLevel;
        s.ScholarshipTypeId = dto.ScholarshipTypeId; s.StipendAmount = dto.StipendAmount;
        s.StipendFrequency = dto.StipendFrequency ?? "Monthly"; s.ScholarshipFundSource = dto.ScholarshipFundSource;
        s.RenewalConditions = dto.RenewalConditions; s.BankName = dto.BankName?.Trim(); s.BankAccountNumber = dto.BankAccountNumber?.Trim();
        s.EnrollmentDate = dto.EnrollmentDate; s.ExpectedGraduation = dto.ExpectedGraduation; s.Status = dto.Status ?? "Active";
        await db.SaveChangesAsync();
        await log.LogUpdate("scholars", id, $"Updated scholar: {s.FirstName} {s.LastName}");
    }

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
