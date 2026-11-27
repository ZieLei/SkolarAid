// =====================================================================
// ScholarshipTypeService.cs - scholarship programs (name, stipend, how often paid).
// Called by ScholarshipTypesController (admin) and PublicController
// (the Register page needs the active ones).
// =====================================================================
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

    // Add a new scholarship type. Names must be unique.
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

    // Edit a type's name, stipend amount, how often it pays, and fund source.
    // The new amount is used the next time payroll is processed.
    public async Task<ScholarshipTypeDto> UpdateAsync(int id, ScholarshipTypeSaveDto dto)
    {
        var t = await db.ScholarshipTypes.FindAsync(id) ?? throw AppException.NotFound("Scholarship type");
        var name = dto.Name.Trim();
        var lower = name.ToLower();
        if (await db.ScholarshipTypes.AnyAsync(x => x.Id != id && x.Name.ToLower() == lower))
            throw AppException.Conflict("A scholarship type with this name already exists.");
        t.Name = name; t.StipendAmount = dto.StipendAmount; t.PaymentFrequency = dto.PaymentFrequency;
        t.FundSource = dto.FundSource?.Trim() ?? t.FundSource;
        await db.SaveChangesAsync();
        await log.LogUpdate("scholarship_types", id, $"Updated scholarship type: {t.Name} ({t.StipendAmount:N2} {t.PaymentFrequency})");
        var count = await db.Scholars.CountAsync(s => s.Status == "Active" && s.ScholarshipTypeId == id);
        return new ScholarshipTypeDto(t.Id, t.Name, t.Description, t.StipendAmount, t.PaymentFrequency, t.FundSource, t.RenewalConditions, t.IsActive, count);
    }

    // Adds the common Philippine scholarships (ScholarshipCatalog) that are not in the table yet.
    // Called by DbSeeder on every start. Returns how many were added.
    public static async Task<int> EnsureCatalogAsync(IskolarDbContext db)
    {
        var existing = (await db.ScholarshipTypes.Select(t => t.Name).ToListAsync()).Select(n => n.ToLowerInvariant()).ToList();
        var added = 0;
        foreach (var e in ScholarshipCatalog.Entries)
        {
            var name = e.Name.ToLowerInvariant();
            // Skip exact matches, and older short names already in use (e.g. "Tulong Dunong Program").
            if (existing.Any(x => x == name || name.Contains(x))) continue;
            db.ScholarshipTypes.Add(new ScholarshipType
            {
                Name = e.Name, FundSource = e.FundSource, StipendAmount = e.Stipend, PaymentFrequency = e.Frequency,
                Description = e.Description, IsActive = true
            });
            added++;
        }
        if (added > 0) await db.SaveChangesAsync();
        return added;
    }

    // Turn a type on or off. Inactive types are hidden when adding scholars.
    public async Task SetActiveAsync(int id, bool active)
    {
        var t = await db.ScholarshipTypes.FindAsync(id) ?? throw AppException.NotFound("Scholarship type");
        t.IsActive = active;
        await db.SaveChangesAsync();
        await log.LogUpdate("scholarship_types", id, $"{(active ? "Activated" : "Deactivated")} scholarship type: {t.Name}");
    }
}
