using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class ComplianceService(IskolarDbContext db, ActivityLogService log, ICurrentUser current, IOptions<UploadOptions> upload)
{
    private long MaxBytes => upload.Value.MaxBytes;

    public async Task<List<ComplianceScholarOptionDto>> ScholarOptionsAsync()
    {
        var rows = await db.Scholars.Where(s => s.Status == "Active").OrderBy(s => s.LastName)
            .Select(s => new { s.Id, s.FirstName, s.LastName, s.ScholarNumber }).ToListAsync();
        return rows.Select(s => new ComplianceScholarOptionDto(s.Id, $"{s.FirstName} {s.LastName} ({s.ScholarNumber})")).ToList();
    }

    /// <summary>The 5 default requirements are created the first time a scholar's compliance is opened (legacy behaviour).</summary>
    public async Task EnsureDefaultsAsync(int scholarId)
    {
        if (await db.ComplianceRecords.AnyAsync(c => c.ScholarId == scholarId)) return;
        for (var i = 0; i < ComplianceRules.DefaultTypes.Length; i++)
            db.ComplianceRecords.Add(NewDefault(scholarId, i, "Pending"));
        await db.SaveChangesAsync();
    }

    public static ComplianceRecord NewDefault(int scholarId, int i, string status) => new()
    {
        ScholarId = scholarId,
        RequirementType = ComplianceRules.DefaultTypes[i],
        Description = ComplianceRules.DefaultDescriptions[i],
        DueDate = DateTime.Now.AddMonths(1).Date,
        Status = status
    };

    public async Task<ComplianceScholarInfoDto> GetForScholarAsync(int scholarId)
    {
        var s = await db.Scholars.Include(x => x.ScholarshipType).FirstOrDefaultAsync(x => x.Id == scholarId)
                ?? throw AppException.NotFound("Scholar");
        await EnsureDefaultsAsync(scholarId);
        var items = await ListItemsAsync(scholarId);
        var statuses = items.Select(i => i.Status).ToList();
        var approved = statuses.Count(x => x == "Approved");
        var overall = items.Count == 0 ? "No requirements" : $"{approved}/{items.Count} approved ({ComplianceRules.ComplianceRate(items.Count, approved)}%)";
        return new ComplianceScholarInfoDto(s.Id, s.FullName, s.ScholarNumber, s.Course, s.YearLevel, s.ScholarshipType?.Name, items, overall);
    }

    public async Task<List<ComplianceItemDto>> ListItemsAsync(int scholarId)
    {
        var records = await db.ComplianceRecords.Include(c => c.Checker).Where(c => c.ScholarId == scholarId)
            .OrderBy(c => c.Id).ToListAsync();
        var ids = records.Select(r => r.Id).ToList();
        var files = await db.FileAttachments.Where(f => ids.Contains(f.ComplianceId))
            .Select(f => new { f.ComplianceId, f.FileName }).ToListAsync();
        return records.Select(r =>
        {
            var f = files.Where(x => x.ComplianceId == r.Id).ToList();
            return new ComplianceItemDto(r.Id, r.RequirementType, r.Description, r.DueDate, r.DateSubmitted, r.Status, r.Remarks,
                r.Checker?.Name, f.Count, f.FirstOrDefault()?.FileName ?? r.FilePath);
        }).ToList();
    }

    public async Task UpdateStatusAsync(int id, string status, string? remarks)
    {
        var c = await db.ComplianceRecords.FindAsync(id) ?? throw AppException.NotFound("Compliance record");
        c.Status = status;
        c.Remarks = remarks;
        c.CheckedBy = current.UserId;
        if (status is "Submitted" or "Approved") c.DateSubmitted = DateTime.Today;
        await db.SaveChangesAsync();
        await log.LogUpdate("compliance_records", id, $"Status updated to {status}");
    }

    public Task MarkMissingAsync(int id) => UpdateStatusAsync(id, "Overdue", "Marked as missing by admin");

    public async Task<ComplianceItemDto> AddRequirementAsync(int scholarId, AddRequirementDto dto)
    {
        if (!await db.Scholars.AnyAsync(s => s.Id == scholarId)) throw AppException.NotFound("Scholar");
        var c = new ComplianceRecord
        {
            ScholarId = scholarId, RequirementType = dto.RequirementType.Trim(), Description = dto.Description?.Trim(),
            DueDate = dto.DueDate.Date, Status = "Pending"
        };
        db.ComplianceRecords.Add(c);
        await db.SaveChangesAsync();
        await log.LogCreate("compliance_records", scholarId, $"Added requirement '{c.RequirementType}'");
        return new ComplianceItemDto(c.Id, c.RequirementType, c.Description, c.DueDate, null, c.Status, null, null, 0, null);
    }

    public async Task DeleteRequirementAsync(int id)
    {
        var c = await db.ComplianceRecords.FindAsync(id) ?? throw AppException.NotFound("Compliance record");
        db.FileAttachments.RemoveRange(db.FileAttachments.Where(f => f.ComplianceId == id));
        db.ComplianceRecords.Remove(c);
        await db.SaveChangesAsync();
        await log.LogDelete("compliance_records", id, $"Deleted requirement '{c.RequirementType}'");
    }

    /// <summary>Stores the file (replacing any existing one), marks the record Submitted. Used by admin and scholar uploads.</summary>
    public async Task AttachFileAsync(ComplianceRecord c, string fileName, byte[] data)
    {
        var name = UploadRules.Validate(fileName, data.Length, MaxBytes);
        db.FileAttachments.RemoveRange(db.FileAttachments.Where(f => f.ComplianceId == c.Id));
        db.FileAttachments.Add(new FileAttachment
        {
            ScholarId = c.ScholarId, ComplianceId = c.Id, FileName = name, OriginalName = name,
            FileType = Path.GetExtension(name).ToLowerInvariant(), FileSize = data.Length, FileData = data,
            UploadedBy = current.UserId
        });
        c.Status = "Submitted";
        c.DateSubmitted = DateTime.Today;
        c.FilePath = name;
        await db.SaveChangesAsync();
    }

    public async Task UploadAsync(int id, string fileName, byte[] data)
    {
        var c = await db.ComplianceRecords.FindAsync(id) ?? throw AppException.NotFound("Compliance record");
        await AttachFileAsync(c, fileName, data);
        await log.LogCreate("file_attachments", id, $"File uploaded: {fileName}");
    }

    public async Task<(string Name, string ContentType, byte[] Data)> DownloadAsync(int id, int? ownerScholarId = null)
    {
        var f = await db.FileAttachments.Where(x => x.ComplianceId == id && (ownerScholarId == null || x.ScholarId == ownerScholarId))
            .OrderByDescending(x => x.Id).FirstOrDefaultAsync() ?? throw AppException.NotFound("File");
        return (f.FileName, UploadRules.ContentType(f.FileName), f.FileData);
    }

    public async Task DeleteFileAsync(int id)
    {
        var c = await db.ComplianceRecords.FindAsync(id) ?? throw AppException.NotFound("Compliance record");
        db.FileAttachments.RemoveRange(db.FileAttachments.Where(f => f.ComplianceId == id));
        c.Status = "Pending"; c.FilePath = null; c.DateSubmitted = null;
        await db.SaveChangesAsync();
        await log.LogDelete("file_attachments", id, $"Deleted file for compliance record {id}");
    }

    public async Task RemindAsync(int scholarId)
    {
        if (!await db.Scholars.AnyAsync(s => s.Id == scholarId)) throw AppException.NotFound("Scholar");
        db.Notifications.Add(new Notification
        {
            SenderId = current.UserId, RecipientId = scholarId, NotificationType = "Reminder",
            Title = "Compliance Reminder - IskolarAid",
            Message = "Dear scholar, you have pending compliance requirements that need your attention. Please submit them as soon as possible to avoid scholarship suspension. Log in to your IskolarAid account to view details."
        });
        await db.SaveChangesAsync();
        await log.LogCreate("notifications", scholarId, "Compliance reminder sent");
    }

    // ---------- Scholar (own records only) ----------

    public async Task<ScholarComplianceDto> ListForSelfAsync(int scholarId)
    {
        var today = DateTime.Today;
        var records = await db.ComplianceRecords.Where(c => c.ScholarId == scholarId).ToListAsync();
        var changed = false;
        foreach (var r in records)
        {
            if (ComplianceRules.ShouldBecomeOverdue(r.Status, r.DueDate, today)) { r.Status = "Overdue"; changed = true; }
            if (r.DateSubmitted is null && r.Status is "Submitted" or "Approved") { r.DateSubmitted = r.CreatedAt.Date; changed = true; }
        }
        if (changed) await db.SaveChangesAsync();

        var items = await ListItemsAsync(scholarId);
        var total = items.Count;
        var completed = items.Count(i => i.Status is "Approved" or "Submitted");
        return new ScholarComplianceDto(items, total, completed, items.Count(i => i.Status == "Pending"),
            items.Count(i => i.Status == "Overdue"), ComplianceRules.ComplianceRate(total, completed));
    }

    public async Task UploadForSelfAsync(int scholarId, int complianceId, string fileName, byte[] data)
    {
        var c = await db.ComplianceRecords.FirstOrDefaultAsync(x => x.Id == complianceId && x.ScholarId == scholarId)
                ?? throw AppException.NotFound("Requirement");
        // The desktop UI only offered upload for Pending/Rejected items; Overdue is also allowed so late documents can still be sent.
        if (c.Status is not ("Pending" or "Rejected" or "Overdue"))
            throw new AppException("This requirement can no longer be changed.");
        await AttachFileAsync(c, fileName, data);
        await log.LogCreate("file_attachments", complianceId, $"Scholar uploaded document: {fileName}");
    }
}
