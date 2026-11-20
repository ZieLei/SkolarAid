using Microsoft.EntityFrameworkCore;
using SkolarAid.Core.Common;
using SkolarAid.Core.Dtos;
using SkolarAid.Core.Rules;
using SkolarAid.Data;
using SkolarAid.Data.Entities;

namespace SkolarAid.Core.Services;

public class PayrollService(SkolarDbContext db, ActivityLogService log, ICurrentUser current, IEmailSender email, ISmsSender sms)
{
    // List<string>, not string[]: C# 14 binds string[].Contains to a span overload that EF Core 9 cannot translate.
    private static readonly List<string> PaidStatuses = ["Released", "Processed"];

    public async Task<List<PayrollCandidateDto>> CandidatesAsync(DateTime periodDate, int? scholarshipTypeId, string? yearLevel, string? search)
    {
        var period = PayrollRules.PeriodLabel(periodDate);
        var q = db.Scholars.AsNoTracking().Include(s => s.ScholarshipType).Where(s => s.Status == "Active");
        if (scholarshipTypeId is > 0) q = q.Where(s => s.ScholarshipTypeId == scholarshipTypeId);
        if (!string.IsNullOrWhiteSpace(yearLevel) && !yearLevel.StartsWith("All")) q = q.Where(s => s.YearLevel == yearLevel);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim();
            q = q.Where(s => s.ScholarNumber.Contains(t) || s.FirstName.Contains(t) || s.LastName.Contains(t));
        }
        var scholars = await q.OrderBy(s => s.Id).ToListAsync();
        var ids = scholars.Select(s => s.Id).ToList();
        var comp = (await db.ComplianceRecords.Where(c => ids.Contains(c.ScholarId)).Select(c => new { c.ScholarId, c.Status }).ToListAsync())
            .GroupBy(c => c.ScholarId).ToDictionary(g => g.Key, g => g.Select(x => x.Status).ToList());
        var paid = (await db.Payments.Where(p => p.PaymentPeriod == period && PaidStatuses.Contains(p.Status) && ids.Contains(p.ScholarId))
            .Select(p => p.ScholarId).ToListAsync()).ToHashSet();

        return scholars.Select(s =>
        {
            var statuses = comp.GetValueOrDefault(s.Id) ?? [];
            var stipend = s.ScholarshipType?.StipendAmount ?? 0; // legacy: amount comes from the scholarship type
            var already = paid.Contains(s.Id);
            return new PayrollCandidateDto(s.Id, s.ScholarNumber, s.FullName, s.Course, s.YearLevel, s.ScholarshipType?.Name ?? "N/A",
                stipend, ComplianceRules.Summarize(statuses), already ? "Already Paid" : "Not Paid",
                PayrollRules.IsEligible(s.Status, statuses, stipend, already));
        }).ToList();
    }

    public async Task<PayrollPreviewDto> PreviewAsync(PayrollRequestDto req)
    {
        var period = PayrollRules.PeriodLabel(req.PeriodDate);
        var all = await CandidatesAsync(req.PeriodDate, null, null, null);
        var picked = all.Where(c => req.ScholarIds.Contains(c.Id)).ToList();
        var lines = picked.Select(c => new PayrollPreviewLine(c.Id, c.FullName, c.StipendAmount, c.PaymentStatus == "Already Paid")).ToList();
        var fresh = picked.Where(c => c.IsEligible).ToList();
        return new PayrollPreviewDto(period, req.Method, picked.Count, lines.Count(l => l.AlreadyPaid), fresh.Count, fresh.Sum(c => c.StipendAmount), lines);
    }

    public async Task<PayrollResultDto> ProcessAsync(PayrollRequestDto req)
    {
        var period = PayrollRules.PeriodLabel(req.PeriodDate);
        var now = DateTime.Now;
        var processed = new List<(Scholar S, Payment P)>();
        var skipped = 0;

        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var id in req.ScholarIds.Distinct())
        {
            // Eligibility is re-checked inside the transaction (compliance complete, stipend > 0, not already paid for the period).
            var s = await db.Scholars.Include(x => x.ScholarshipType).FirstOrDefaultAsync(x => x.Id == id);
            if (s is null) { skipped++; continue; }
            var statuses = await db.ComplianceRecords.Where(c => c.ScholarId == id).Select(c => c.Status).ToListAsync();
            var already = await db.Payments.AnyAsync(p => p.ScholarId == id && p.PaymentPeriod == period && PaidStatuses.Contains(p.Status));
            var stipend = s.ScholarshipType?.StipendAmount ?? 0;
            if (!PayrollRules.IsEligible(s.Status, statuses, stipend, already)) { skipped++; continue; }

            var release = PayrollRules.CalculateReleaseDate(now);
            var reference = PayrollRules.ReferenceNumber(now, s.Id);
            var pay = new Payment
            {
                ScholarId = s.Id, PaymentPeriod = period, Amount = stipend, ComputationDate = now.Date, ReleaseDate = release,
                Status = "Processed", PaymentMethod = req.Method, ReferenceNumber = reference, ProcessedBy = current.UserId,
                Remarks = $"Batch payroll for {period} via {req.Method}. Ref: {reference}"
            };
            db.Payments.Add(pay);
            db.Notifications.Add(new Notification
            {
                SenderId = current.UserId, RecipientId = s.Id, Title = "Payment Processed", NotificationType = "Update",
                Message = $"Your stipend for {period} has been processed.\nAmount: ₱{stipend:N2}\nReference: {reference}\nExpected Release: {release:MMM dd, yyyy}\nPayment Method: {req.Method}"
            });
            processed.Add((s, pay));
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        var total = processed.Sum(x => x.P.Amount);
        if (processed.Count > 0)
            await log.LogCreate("payments", 0, $"Processed payroll for {processed.Count} scholars. Period: {period}, Total: ₱{total:N2}");

        // Notifications go out after commit and never roll back the payroll.
        int emails = 0, texts = 0;
        foreach (var (s, p) in processed)
        {
            var (subject, body) = MessageTemplates.PaymentProcessed(s.FullName, period, p.Amount, req.Method, s.ScholarNumber, p.ReferenceNumber!, p.ReleaseDate!.Value);
            if (!string.IsNullOrEmpty(s.Email) && await email.SendAsync(s.Email, s.FullName, subject, body)) emails++;
            if (!string.IsNullOrEmpty(s.ContactNumber) && await sms.SendAsync(s.ContactNumber,
                    $"ScholarAid: Your stipend for {period} (P{p.Amount:N2}) has been processed. Ref: {p.ReferenceNumber}. -LCC")) texts++;
        }
        return new PayrollResultDto(period, req.Method, processed.Count, skipped, total, emails, texts);
    }

    public async Task<List<ProcessedPaymentDto>> ReadyForReleaseAsync()
    {
        var today = DateTime.Today;
        var rows = await db.Payments.AsNoTracking().Include(p => p.Scholar)
            .Where(p => p.Status == "Processed" && p.ReleaseDate != null && p.ReleaseDate <= today)
            .OrderBy(p => p.ReleaseDate).ToListAsync();
        return rows.Select(p => new ProcessedPaymentDto(p.Id, p.ScholarId, p.Scholar!.FullName, p.Scholar.ScholarNumber, p.PaymentPeriod,
            p.Amount, p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber)).ToList();
    }

    public async Task<ReleaseResultDto> ReleaseAsync(IReadOnlyCollection<int>? paymentIds)
    {
        var today = DateTime.Today;
        var q = db.Payments.Include(p => p.Scholar)
            .Where(p => p.Status == "Processed" && p.ReleaseDate != null && p.ReleaseDate <= today);
        if (paymentIds is { Count: > 0 }) q = q.Where(p => paymentIds.Contains(p.Id));
        var due = await q.ToListAsync();
        if (due.Count == 0) throw new AppException("No payments are ready for release. Payments must be 'Processed' with a release date of today or earlier.");

        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var p in due)
        {
            p.Status = "Released";
            p.ReleaseDate = today;
            db.Notifications.Add(new Notification
            {
                SenderId = current.UserId, RecipientId = p.ScholarId, Title = "🎉 Payment Released!", NotificationType = "Update",
                Message = $"Great news, {p.Scholar!.FullName}!\n\nYour stipend for {p.PaymentPeriod} has been RELEASED.\nAmount: ₱{p.Amount:N2}\nMethod: {p.PaymentMethod}\nReference: {p.ReferenceNumber}\n\nThe funds should reflect in your account within 1-3 business days."
            });
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        var total = due.Sum(p => p.Amount);
        await log.LogCreate("payments", 0, $"Released {due.Count} payments. Total: ₱{total:N2}");

        var emails = 0;
        foreach (var p in due)
        {
            var s = p.Scholar!;
            if (string.IsNullOrEmpty(s.Email)) continue;
            var (subject, body) = MessageTemplates.PaymentReleased(s.FullName, p.PaymentPeriod, p.Amount, p.PaymentMethod ?? "", p.ReferenceNumber ?? "");
            if (await email.SendAsync(s.Email, s.FullName, subject, body)) emails++;
        }
        return new ReleaseResultDto(due.Count, emails, total);
    }

    public async Task<List<DisbursementHistoryDto>> HistoryAsync(DateTime periodDate)
    {
        var period = PayrollRules.PeriodLabel(periodDate);
        var rows = await db.Payments.AsNoTracking().Include(p => p.Scholar).Where(p => p.PaymentPeriod == period).ToListAsync();
        return rows.OrderByDescending(p => p.ReleaseDate).ThenBy(p => p.Status)
            .Select(p => new DisbursementHistoryDto(p.Id, p.Scholar!.FullName, p.Scholar.ScholarNumber, p.PaymentPeriod, p.Amount, p.Status,
                p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber)).ToList();
    }

    public async Task<PayrollStatsDto> StatsAsync()
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        var processedToday = await db.Payments.CountAsync(p => p.CreatedAt >= today && p.CreatedAt < tomorrow && PaidStatuses.Contains(p.Status));
        var ready = await db.Payments.Where(p => p.Status == "Processed" && p.ReleaseDate != null && p.ReleaseDate <= today).Select(p => p.Amount).ToListAsync();
        return new PayrollStatsDto(processedToday, ready.Count, ready.Sum());
    }
}
