using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class ScholarshipTypeService(IskolarDbContext db, ActivityLogService log)
{
    /// <summary>All types for the admin dialog, with the number of active scholars per type.</summary>
    public async Task<List<ScholarshipTypeDto>> ListAsync(bool activeOnly = false)
    {
        var q = db.ScholarshipTypes.AsQueryable();
        if (activeOnly) q = q.Where(t => t.IsActive);
        var counts = await db.Scholars.Where(s => s.Status == "Active" && s.ScholarshipTypeId != null)
            .GroupBy(s => s.ScholarshipTypeId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var list = await q.OrderBy(t => t.Name).ToListAsync();
        return list.Select(t => new ScholarshipTypeDto(t.Id, t.Name, t.Description, t.StipendAmount, t.PaymentFrequency,
            t.FundSource, t.RenewalConditions, t.IsActive, counts.GetValueOrDefault(t.Id))).ToList();
    }

    public async Task<ScholarshipTypeDto> CreateAsync(ScholarshipTypeSaveDto dto)
    {
        var name = dto.Name.Trim();
        if (await db.ScholarshipTypes.AnyAsync(t => t.Name == name))
            throw AppException.Conflict("A scholarship type with this name already exists.");
        var t = new ScholarshipType
        {
            Name = name, StipendAmount = dto.StipendAmount, PaymentFrequency = dto.PaymentFrequency,
            FundSource = dto.FundSource?.Trim(), RenewalConditions = dto.RenewalConditions?.Trim(),
            Description = dto.Description?.Trim(), IsActive = true
        };
        db.ScholarshipTypes.Add(t);
        await db.SaveChangesAsync();
        await log.LogCreate("scholarship_types", t.Id, $"Added scholarship type: {t.Name}");
        return new ScholarshipTypeDto(t.Id, t.Name, t.Description, t.StipendAmount, t.PaymentFrequency, t.FundSource, t.RenewalConditions, true, 0);
    }

    public async Task SetActiveAsync(int id, bool active)
    {
        var t = await db.ScholarshipTypes.FindAsync(id) ?? throw AppException.NotFound("Scholarship type");
        t.IsActive = active;
        await db.SaveChangesAsync();
        await log.LogUpdate("scholarship_types", id, $"{(active ? "Activated" : "Deactivated")} scholarship type: {t.Name}");
    }
}
