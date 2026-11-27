// =====================================================================
// ComplianceService.cs - the documents each scholar must submit.
//
// Life of a requirement:
// Pending -> (file uploaded) Submitted -> (admin checks) Approved / Rejected
// Pending past its due date -> Overdue
// Only scholars with ALL requirements Approved can be paid (see PayrollRules).
//
// Called by ComplianceController (admin) and ScholarPortalController (scholar).
// Uploaded files are stored inside the database (file_attachments.FileData).
// After each change we raise AppEvents.ComplianceChanged for live updates.
// =====================================================================
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace IskolarAid.Core.Services;

public class ComplianceService(
    IskolarDbContext db,
    ActivityLogService log,
    ICurrentUser current,
    IOptions<UploadOptions> upload,
    AppEvents events
)
{
    private long MaxBytes => upload.Value.MaxBytes;

    // Active scholars for the "pick a scholar" drop-down on the admin compliance tab.
    public async Task<List<ComplianceScholarOptionDto>> ScholarOptionsAsync()
    {
        var rows = await db
            .Scholars.Where(s => s.Status == "Active")
            .OrderBy(s => s.LastName)
            .Select(s => new
            {
                s.Id,
                s.FirstName,
                s.LastName,
                s.ScholarNumber,
            })
            .ToListAsync();
        return rows.Select(s => new ComplianceScholarOptionDto(
                s.Id,
                $"{s.FirstName} {s.LastName} ({s.ScholarNumber})"
            ))
            .ToList();
    }

    /// <summary>The 5 default requirements are created the first time a scholar's compliance is opened (legacy behaviour).</summary>
    public async Task EnsureDefaultsAsync(int scholarId)
    {
        if (await db.ComplianceRecords.AnyAsync(c => c.ScholarId == scholarId))
            return;
        for (var i = 0; i < ComplianceRules.DefaultTypes.Length; i++)
            db.ComplianceRecords.Add(NewDefault(scholarId, i, "Pending"));
        await db.SaveChangesAsync();
    }

    // Build one of the five default requirements (index i), due one month from now.
    public static ComplianceRecord NewDefault(int scholarId, int i, string status) =>
        new()
        {
            ScholarId = scholarId,
            RequirementType = ComplianceRules.DefaultTypes[i],
            Description = ComplianceRules.DefaultDescriptions[i],
            DueDate = DateTime.Now.AddMonths(1).Date,
            Status = status,
        };

    // Admin "show all" view: every requirement of every scholar in one list.
    // Order: things that need the admin first (Submitted = waiting for review, then Overdue,
    // Rejected, Pending), Approved last; earliest due date first inside each group.
    // Filters: status ("All" = no filter) and search text (scholar name / number or requirement).
    public async Task<List<ComplianceOverviewItemDto>> ListAllAsync(string? status, string? search)
    {
        var q = db
            .ComplianceRecords.AsNoTracking()
            .Include(c => c.Scholar)
            .Include(c => c.Checker)
            .AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && status != "All")
            q = q.Where(c => c.Status == status);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim();
            q = q.Where(c =>
                c.RequirementType.Contains(t)
                || c.Scholar!.FirstName.Contains(t)
                || c.Scholar.LastName.Contains(t)
                || c.Scholar.ScholarNumber.Contains(t)
            );
        }
        var records = await q.ToListAsync();
        var ids = records.Select(r => r.Id).ToList();
        var files = (
            await db
                .FileAttachments.Where(f => ids.Contains(f.ComplianceId))
                .Select(f => new { f.ComplianceId, f.FileName })
                .ToListAsync()
        )
            .GroupBy(f => f.ComplianceId)
            .ToDictionary(g => g.Key, g => (Count: g.Count(), Name: g.First().FileName));
        int Rank(string s) =>
            s switch
            {
                "Submitted" => 0,
                "Overdue" => 1,
                "Rejected" => 2,
                "Pending" => 3,
                _ => 4,
            };
        return records
            .OrderBy(r => Rank(r.Status))
            .ThenBy(r => r.DueDate)
            .ThenBy(r => r.Scholar!.LastName)
            .Take(3000)
            .Select(r =>
            {
                var f = files.GetValueOrDefault(r.Id);
                return new ComplianceOverviewItemDto(
                    r.Id,
                    r.ScholarId,
                    r.Scholar!.FullName,
                    r.Scholar.ScholarNumber,
                    r.RequirementType,
                    r.Description,
                    r.DueDate,
                    r.DateSubmitted,
                    r.Status,
                    r.Remarks,
                    r.Checker?.Name,
                    f.Count,
                    f.Name ?? r.FilePath
                );
            })
            .ToList();
    }

    // Admin view of one scholar: their info, every requirement, and an "x/y approved" summary.
    public async Task<ComplianceScholarInfoDto> GetForScholarAsync(int scholarId)
    {
        var s = await db
            .Scholars.Include(x => x.ScholarshipType)
            .FirstOrDefaultAsync(x => x.Id == scholarId)
            // [VALIDATION] the record must exist, otherwise 404 Not Found (Scholar)
            ?? throw AppException.NotFound("Scholar");
        await EnsureDefaultsAsync(scholarId);
        var items = await ListItemsAsync(scholarId);
        var statuses = items.Select(i => i.Status).ToList();
        var approved = statuses.Count(x => x == "Approved");
        var overall =
            items.Count == 0
                ? "No requirements"
                : $"{approved}/{items.Count} approved ({ComplianceRules.ComplianceRate(items.Count, approved)}%)";
        return new ComplianceScholarInfoDto(
            s.Id,
            s.FullName,
            s.ScholarNumber,
            s.Course,
            s.YearLevel,
            s.ScholarshipType?.Name,
            items,
            overall
        );
    }

    // All requirements of a scholar, with how many files each one has and who checked it.
    public async Task<List<ComplianceItemDto>> ListItemsAsync(int scholarId)
    {
        var records = await db
            .ComplianceRecords.Include(c => c.Checker)
            .Where(c => c.ScholarId == scholarId)
            .OrderBy(c => c.Id)
            .ToListAsync();
        var ids = records.Select(r => r.Id).ToList();
        var files = await db
            .FileAttachments.Where(f => ids.Contains(f.ComplianceId))
            .Select(f => new { f.ComplianceId, f.FileName })
            .ToListAsync();
        return records
            .Select(r =>
            {
                var f = files.Where(x => x.ComplianceId == r.Id).ToList();
                return new ComplianceItemDto(
                    r.Id,
                    r.RequirementType,
                    r.Description,
                    r.DueDate,
                    r.DateSubmitted,
                    r.Status,
                    r.Remarks,
                    r.Checker?.Name,
                    f.Count,
                    f.FirstOrDefault()?.FileName ?? r.FilePath
                );
            })
            .ToList();
    }

    // Admin approves / rejects / changes a requirement. Remembers which admin did it.
    // [ENTRY] Approve / Reject buttons -> PUT /api/admin/compliance/{id}/status. [VALIDATION] Status list is checked in ComplianceStatusDto (Dtos.cs).
    // [RULE] a scholar becomes payable only when ALL their requirements are Approved (ComplianceRules.Summarize).
    public async Task UpdateStatusAsync(int id, string status, string? remarks)
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Compliance record)
        var c = await db.ComplianceRecords.FindAsync(id)
            ?? throw AppException.NotFound("Compliance record");
        c.Status = status;
        c.Remarks = remarks;
        c.CheckedBy = current.UserId;
        if (status is "Submitted" or "Approved")
            c.DateSubmitted = DateTime.Today;
        await db.SaveChangesAsync();
        await log.LogUpdate("compliance_records", id, $"Status updated to {status}");
        events.RaiseComplianceChanged(c.ScholarId, c.RequirementType, status, byScholar: false);
    }

    // "Mark missing" = set to Overdue with a standard remark.
    public Task MarkMissingAsync(int id) =>
        UpdateStatusAsync(id, "Overdue", "Marked as missing by admin");

    // Admin adds an extra requirement (beyond the default five).
    public async Task<ComplianceItemDto> AddRequirementAsync(int scholarId, AddRequirementDto dto)
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Scholar)
        if (!await db.Scholars.AnyAsync(s => s.Id == scholarId))
            throw AppException.NotFound("Scholar");
        var c = new ComplianceRecord
        {
            ScholarId = scholarId,
            RequirementType = dto.RequirementType.Trim(),
            Description = dto.Description?.Trim(),
            DueDate = dto.DueDate.Date,
            Status = "Pending",
        };
        db.ComplianceRecords.Add(c);
        await db.SaveChangesAsync();
        await log.LogCreate(
            "compliance_records",
            scholarId,
            $"Added requirement '{c.RequirementType}'"
        );
        events.RaiseComplianceChanged(scholarId, c.RequirementType, c.Status, byScholar: false);
        return new ComplianceItemDto(
            c.Id,
            c.RequirementType,
            c.Description,
            c.DueDate,
            null,
            c.Status,
            null,
            null,
            0,
            null
        );
    }

    // Delete a requirement and its files.
    public async Task DeleteRequirementAsync(int id)
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Compliance record)
        var c = await db.ComplianceRecords.FindAsync(id)
            ?? throw AppException.NotFound("Compliance record");
        db.FileAttachments.RemoveRange(db.FileAttachments.Where(f => f.ComplianceId == id));
        db.ComplianceRecords.Remove(c);
        await db.SaveChangesAsync();
        await log.LogDelete("compliance_records", id, $"Deleted requirement '{c.RequirementType}'");
        events.RaiseComplianceChanged(c.ScholarId, c.RequirementType, "Deleted", byScholar: false);
    }

    /// <summary>Stores the file (replacing any existing one), marks the record Submitted. Used by admin and scholar uploads.</summary>
    // [VALIDATION] file type and size: UploadRules.Validate (UploadRules.cs) - PDF / Word / JPG / PNG only, not empty, within the size limit.
    // [DB] replaces the stored file and sets the requirement to "Submitted". Used by both admin and scholar uploads.
    public async Task AttachFileAsync(ComplianceRecord c, string fileName, byte[] data)
    {
        var name = UploadRules.Validate(fileName, data.Length, MaxBytes);
        db.FileAttachments.RemoveRange(db.FileAttachments.Where(f => f.ComplianceId == c.Id));
        db.FileAttachments.Add(
            new FileAttachment
            {
                ScholarId = c.ScholarId,
                ComplianceId = c.Id,
                FileName = name,
                OriginalName = name,
                FileType = Path.GetExtension(name).ToLowerInvariant(),
                FileSize = data.Length,
                FileData = data,
                UploadedBy = current.UserId,
            }
        );
        c.Status = "Submitted";
        c.DateSubmitted = DateTime.Today;
        c.FilePath = name;
        await db.SaveChangesAsync();
    }

    // [ENTRY] Admin > Compliance upload -> POST /api/admin/compliance/{id}/file (ComplianceController.Upload; 15 MB request cap).
    // Admin uploads a file for a scholar's requirement.
    public async Task UploadAsync(int id, string fileName, byte[] data)
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Compliance record)
        var c = await db.ComplianceRecords.FindAsync(id)
            ?? throw AppException.NotFound("Compliance record");
        await AttachFileAsync(c, fileName, data);
        await log.LogCreate("file_attachments", id, $"File uploaded: {fileName}");
        events.RaiseComplianceChanged(c.ScholarId, c.RequirementType, c.Status, byScholar: false);
    }

    // Get the newest file of a requirement. When ownerScholarId is given (scholar portal),
    // the file must belong to that scholar, so scholars cannot download other people's files.
    public async Task<(string Name, string ContentType, byte[] Data)> DownloadAsync(
        int id,
        int? ownerScholarId = null
    )
    {
        var f = await db
            .FileAttachments.Where(x =>
                x.ComplianceId == id && (ownerScholarId == null || x.ScholarId == ownerScholarId)
            )
            // [VALIDATION] the record must exist, otherwise 404 Not Found (File)
            .OrderByDescending(x => x.Id)
            .FirstOrDefaultAsync()
            ?? throw AppException.NotFound("File");
        return (f.FileName, UploadRules.ContentType(f.FileName), f.FileData);
    }

    // Remove the file and put the requirement back to Pending.
    public async Task DeleteFileAsync(int id)
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Compliance record)
        var c = await db.ComplianceRecords.FindAsync(id)
            ?? throw AppException.NotFound("Compliance record");
        db.FileAttachments.RemoveRange(db.FileAttachments.Where(f => f.ComplianceId == id));
        c.Status = "Pending";
        c.FilePath = null;
        c.DateSubmitted = null;
        await db.SaveChangesAsync();
        await log.LogDelete("file_attachments", id, $"Deleted file for compliance record {id}");
        events.RaiseComplianceChanged(c.ScholarId, c.RequirementType, c.Status, byScholar: false);
    }

    // Send the scholar an in-app "please submit your documents" notification.
    public async Task RemindAsync(int scholarId)
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Scholar)
        if (!await db.Scholars.AnyAsync(s => s.Id == scholarId))
            throw AppException.NotFound("Scholar");
        db.Notifications.Add(
            new Notification
            {
                SenderId = current.UserId,
                RecipientId = scholarId,
                NotificationType = "Reminder",
                Title = "Compliance Reminder - IskolarAid",
                Message =
                    "Dear scholar, you have pending compliance requirements that need your attention. Please submit them as soon as possible to avoid scholarship suspension. Log in to your IskolarAid account to view details.",
            }
        );
        await db.SaveChangesAsync();
        await log.LogCreate("notifications", scholarId, "Compliance reminder sent");
        events.RaiseNotificationsSent([scholarId], "Compliance Reminder - IskolarAid", "Reminder");
    }

    // ---------- Scholar (own records only) ----------

    // Scholar's own compliance page. First fix up old data:
    // - Pending items past their due date become Overdue.
    // - Submitted/Approved items with no submit date get one.
    // Then return the list and the counts for the summary cards.
    public async Task<ScholarComplianceDto> ListForSelfAsync(int scholarId)
    {
        var today = DateTime.Today;
        var records = await db.ComplianceRecords.Where(c => c.ScholarId == scholarId).ToListAsync();
        var changed = false;
        foreach (var r in records)
        {
            if (ComplianceRules.ShouldBecomeOverdue(r.Status, r.DueDate, today))
            {
                r.Status = "Overdue";
                changed = true;
            }
            if (r.DateSubmitted is null && r.Status is "Submitted" or "Approved")
            {
                r.DateSubmitted = r.CreatedAt.Date;
                changed = true;
            }
        }
        if (changed)
            await db.SaveChangesAsync();

        var items = await ListItemsAsync(scholarId);
        var total = items.Count;
        var completed = items.Count(i => i.Status is "Approved" or "Submitted");
        return new ScholarComplianceDto(
            items,
            total,
            completed,
            items.Count(i => i.Status == "Pending"),
            items.Count(i => i.Status == "Overdue"),
            ComplianceRules.ComplianceRate(total, completed)
        );
    }

    // [ENTRY] Scholar > Compliance upload -> POST /api/scholar/compliance/{id}/file (ScholarPortalController.Upload).
    // [VALIDATION] the requirement must belong to this scholar (id comes from the login token), and its status must be Pending / Rejected / Overdue.
    // Scholar uploads their own document. Only allowed while the item still needs a file.
    public async Task UploadForSelfAsync(
        int scholarId,
        int complianceId,
        string fileName,
        byte[] data
    )
    {
        var c = await db.ComplianceRecords.FirstOrDefaultAsync(x =>
            x.Id == complianceId && x.ScholarId == scholarId
        )
            // [VALIDATION] the record must exist, otherwise 404 Not Found (Requirement)
            ?? throw AppException.NotFound("Requirement");
        // The desktop UI only offered upload for Pending/Rejected items; Overdue is also allowed so late documents can still be sent.
        if (c.Status is not ("Pending" or "Rejected" or "Overdue"))
            // [VALIDATION] rejects with 400: "This requirement can no longer be changed."
            throw new AppException("This requirement can no longer be changed.");
        await AttachFileAsync(c, fileName, data);
        await log.LogCreate(
            "file_attachments",
            complianceId,
            $"Scholar uploaded document: {fileName}"
        );
        events.RaiseComplianceChanged(scholarId, c.RequirementType, c.Status, byScholar: true);
    }
}
