// =====================================================================
// PayrollService.cs - paying scholars their stipend (Admin > Payroll).
//
// The ideas behind payroll:
// - A scholarship pays its stipend amount once per CYCLE, set by its payment frequency
//   (Monthly, Quarterly, Semi-Annual, Annual). The payroll PERIOD is the cycle being paid now,
//   so it must last one cycle of the scholar's frequency (PayrollRules.CycleProblem), and it must have started.
// - A payment is never paid twice for the same days (InPeriod), and a payment is released only once.
//
// Two-step money flow:
// 1. ProcessAsync: admin picks scholars, a period and (optionally) the expected release date.
//    Each eligible scholar gets a Payment with Status = "Processed" and that expected release date
//    (default: 3 working days later; the admin can choose another day, or move it later with RescheduleAsync).
// 2. ReleaseAsync: on/after the expected release date the admin releases them: the admin confirms the money
//    was handed out. Nothing is released automatically. Status becomes "Released" and the release date
//    becomes the day it really happened.
//
// Eligible = Active scholar + all compliance Approved + stipend > 0
// + no payment yet that covers any day of the period
// + the period is one cycle of the scholar's frequency and has started
// + for "Bank Transfer": a bank name and account number on file (PayrollRules.PayoutProblem).
// (all combined in PayrollRules.IsEligible).
// Scholars get an in-app notification and an email.
// =====================================================================
using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class PayrollService(IskolarDbContext db, ActivityLogService log, ICurrentUser current, IEmailSender email, AppEvents events)
{
    // List<string>, not string[]: C# 14 binds string[].Contains to a span overload that EF Core 9 cannot translate.
    private static readonly List<string> PaidStatuses = ["Released", "Processed"];

    // Payments whose period shares at least one day with start..end.
    // New payments store their dates; old ones only have a "March 2026" label, so we match those by
    // the names of the months the range touches.
    private IQueryable<Payment> InPeriod(DateTime start, DateTime end)
    {
        start = start.Date; end = end.Date;
        var months = new List<string>();
        for (var m = new DateTime(start.Year, start.Month, 1); m <= end; m = m.AddMonths(1)) months.Add(PayrollRules.PeriodLabel(m));
        return db.Payments.Where(p => (p.PeriodStart != null && p.PeriodEnd != null && p.PeriodStart <= end && p.PeriodEnd >= start)
                                      || (p.PeriodStart == null && months.Contains(p.PaymentPeriod)));
    }

    // The table of scholars on the Payroll page, with filters.
    // For each scholar: stipend, compliance summary, "Already Paid"/"Not Paid", and eligible yes/no.
    // "Already Paid" = a Processed or Released payment already covers part of the chosen dates.
    // method = the payment method chosen on the page; null = do not check payout details.
    public async Task<List<PayrollCandidateDto>> CandidatesAsync(DateTime start, DateTime end, int? scholarshipTypeId, string? yearLevel, string? search, string? method = null)
    {
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
        // Load all compliance statuses and the payments in this period in two queries (not one per scholar).
        var comp = (await db.ComplianceRecords.Where(c => ids.Contains(c.ScholarId)).Select(c => new { c.ScholarId, c.Status }).ToListAsync())
            .GroupBy(c => c.ScholarId).ToDictionary(g => g.Key, g => g.Select(x => x.Status).ToList());
        var paid = (await InPeriod(start, end).Where(p => PaidStatuses.Contains(p.Status) && ids.Contains(p.ScholarId))
            .Select(p => p.ScholarId).ToListAsync()).ToHashSet();

        return scholars.Select(s =>
        {
            var statuses = comp.GetValueOrDefault(s.Id) ?? [];
            var stipend = s.ScholarshipType?.StipendAmount ?? 0; // the amount (and the frequency) come from the scholarship type
            var already = paid.Contains(s.Id);
            var payout = PayrollRules.PayoutProblem(method, s.BankName, s.BankAccountNumber);
            var frequency = FrequencyOf(s);
            var cycle = PayrollRules.CycleProblem(frequency, start, end, DateTime.Today);
            return new PayrollCandidateDto(s.Id, s.ScholarNumber, s.FullName, s.Course, s.YearLevel, s.ScholarshipType?.Name ?? "N/A",
                stipend, ComplianceRules.Summarize(statuses), already ? "Already Paid" : "Not Paid",
                PayrollRules.IsEligible(s.Status, statuses, stipend, already, payout is null, cycle is null), payout, frequency, cycle);
        }).ToList();
    }

    // How often this scholar is paid: the scholarship type's frequency (the stipend amount comes from the same place).
    private static string FrequencyOf(Scholar s)
        => !string.IsNullOrWhiteSpace(s.ScholarshipType?.PaymentFrequency) ? s.ScholarshipType!.PaymentFrequency
         : !string.IsNullOrWhiteSpace(s.StipendFrequency) ? s.StipendFrequency! : "Monthly";

    // The expected release date: the one the admin chose (never in the past), or 3 working days after processing.
    private static DateTime ReleaseDateFor(DateTime? chosen, DateTime now)
    {
        if (chosen is null) return PayrollRules.CalculateReleaseDate(now);
        if (chosen.Value.Date < now.Date) throw new AppException("The expected release date cannot be in the past.");
        return chosen.Value.Date;
    }

    // "Preview" button: shows what processing would do. Saves nothing.
    public async Task<PayrollPreviewDto> PreviewAsync(PayrollRequestDto req)
    {
        var period = CheckPeriod(req);
        var all = await CandidatesAsync(req.PeriodStart, req.PeriodEnd, null, null, null, req.Method);
        var picked = all.Where(c => req.ScholarIds.Contains(c.Id)).ToList();
        var lines = picked.Select(c => new PayrollPreviewLine(c.Id, c.FullName, c.StipendAmount, c.PaymentStatus == "Already Paid")).ToList();
        var fresh = picked.Where(c => c.IsEligible).ToList();
        return new PayrollPreviewDto(period, req.Method, picked.Count, lines.Count(l => l.AlreadyPaid), fresh.Count, fresh.Sum(c => c.StipendAmount), lines,
            ReleaseDateFor(req.ReleaseDate, DateTime.Now));
    }

    // Checks the chosen dates and returns the period label saved on each payment.
    // A period that has not started yet cannot be paid (no paying in advance), so a release can never come before its period.
    private static string CheckPeriod(PayrollRequestDto req)
    {
        if (PayrollRules.PeriodProblem(req.PeriodStart, req.PeriodEnd) is { } problem) throw new AppException(problem);
        if (req.PeriodStart.Date > DateTime.Today)
            throw new AppException($"The period {PayrollRules.PeriodLabel(req.PeriodStart, req.PeriodEnd)} has not started yet (it starts on {req.PeriodStart:MMM dd, yyyy}). Payroll can only be processed for a period that has already started.");
        return PayrollRules.PeriodLabel(req.PeriodStart, req.PeriodEnd);
    }

    // Step 1 of payroll: create "Processed" payments for the selected scholars.
    // Scholars who are not eligible are skipped and counted.
    public async Task<PayrollResultDto> ProcessAsync(PayrollRequestDto req)
    {
        var period = CheckPeriod(req);
        var now = DateTime.Now;
        var release = ReleaseDateFor(req.ReleaseDate, now);
        var processed = new List<(Scholar S, Payment P)>();
        var skipped = 0;

        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var id in req.ScholarIds.Distinct())
        {
            // Eligibility is re-checked inside the transaction (compliance complete, stipend > 0, not already paid for the period).
            var s = await db.Scholars.Include(x => x.ScholarshipType).FirstOrDefaultAsync(x => x.Id == id);
            if (s is null) { skipped++; continue; }
            var statuses = await db.ComplianceRecords.Where(c => c.ScholarId == id).Select(c => c.Status).ToListAsync();
            var already = await InPeriod(req.PeriodStart, req.PeriodEnd).AnyAsync(p => p.ScholarId == id && PaidStatuses.Contains(p.Status));
            var stipend = s.ScholarshipType?.StipendAmount ?? 0;
            var payoutReady = PayrollRules.PayoutProblem(req.Method, s.BankName, s.BankAccountNumber) is null;
            var cycleFits = PayrollRules.CycleProblem(FrequencyOf(s), req.PeriodStart, req.PeriodEnd, now) is null;
            if (!PayrollRules.IsEligible(s.Status, statuses, stipend, already, payoutReady, cycleFits)) { skipped++; continue; }

            var reference = PayrollRules.ReferenceNumber(now, s.Id);
            var pay = new Payment
            {
                ScholarId = s.Id, PaymentPeriod = period, PeriodStart = req.PeriodStart.Date, PeriodEnd = req.PeriodEnd.Date, Amount = stipend, ComputationDate = now.Date, ReleaseDate = release,
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

        // Log it and raise live-update events (admins + the paid scholars see it right away).
        var total = processed.Sum(x => x.P.Amount);
        if (processed.Count > 0)
            await log.LogCreate("payments", 0, $"Processed payroll for {processed.Count} scholars. Period: {period}, Total: ₱{total:N2}");
        var processedIds = processed.Select(x => x.S.Id).ToList();
        events.RaisePaymentsChanged(processedIds, "Processed");
        events.RaiseNotificationsSent(processedIds, "Payment Processed", "Update");

        // Notifications go out after commit and never roll back the payroll.
        var emails = 0;
        foreach (var (s, p) in processed)
        {
            var (subject, body) = MessageTemplates.PaymentProcessed(s.FullName, period, p.Amount, req.Method, s.ScholarNumber, p.ReferenceNumber!, p.ReleaseDate!.Value);
            if (!string.IsNullOrEmpty(s.Email) && await email.SendAsync(s.Email, s.FullName, subject, body)) emails++;
        }
        return new PayrollResultDto(period, req.Method, processed.Count, skipped, total, emails, release);
    }

    // Payments waiting to be released whose release date is today or earlier.
    public async Task<List<ProcessedPaymentDto>> ReadyForReleaseAsync()
    {
        var today = DateTime.Today;
        var rows = await db.Payments.AsNoTracking().Include(p => p.Scholar)
            .Where(p => p.Status == "Processed" && p.ReleaseDate != null && p.ReleaseDate <= today)
            .OrderBy(p => p.ReleaseDate).ToListAsync();
        return rows.Select(p => new ProcessedPaymentDto(p.Id, p.ScholarId, p.Scholar!.FullName, p.Scholar.ScholarNumber, p.PaymentPeriod,
            p.Amount, p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber)).ToList();
    }

    // Step 2 of payroll: mark ready payments as "Released".
    // No ids given = release every ready payment.
    public async Task<ReleaseResultDto> ReleaseAsync(IReadOnlyCollection<int>? paymentIds)
    {
        var today = DateTime.Today;
        var q = db.Payments.Include(p => p.Scholar)
            .Where(p => p.Status == "Processed" && p.ReleaseDate != null && p.ReleaseDate <= today);
        if (paymentIds is { Count: > 0 }) q = q.Where(p => paymentIds.Contains(p.Id));
        var due = await q.ToListAsync();
        if (due.Count == 0)
        {
            // Asked for specific payments that are already out: say so (a payment can only be released once).
            if (paymentIds is { Count: > 0 } && await db.Payments.AnyAsync(p => paymentIds.Contains(p.Id) && p.Status == "Released"))
                throw AppException.Conflict("That payment was already released. A payment can only be released once.");
            throw new AppException("No payments are ready for release. Payments must be 'Processed' with an expected release date of today or earlier.");
        }

        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var p in due)
        {
            p.Status = "Released";
            p.ReleaseDate = today;
            db.Notifications.Add(new Notification
            {
                SenderId = current.UserId, RecipientId = p.ScholarId, Title = "Payment Released!", NotificationType = "Update",
                Message = $"Great news, {p.Scholar!.FullName}!\n\nYour stipend for {p.PaymentPeriod} has been RELEASED.\nAmount: ₱{p.Amount:N2}\nMethod: {p.PaymentMethod}\nReference: {p.ReferenceNumber}\n\nThe funds should reflect in your account within 1-3 business days."
            });
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        var total = due.Sum(p => p.Amount);
        await log.LogCreate("payments", 0, $"Released {due.Count} payments. Total: ₱{total:N2}");
        var releasedIds = due.Select(p => p.ScholarId).Distinct().ToList();
        events.RaisePaymentsChanged(releasedIds, "Released");
        events.RaiseNotificationsSent(releasedIds, "Payment Released!", "Update");

        // Email each scholar after the database is saved.
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

    // Move the expected release date of a payment that is still "Processed" (for example when the funds are not ready on time).
    // Released payments cannot be changed. The scholar is told the new date.
    public async Task<ProcessedPaymentDto> RescheduleAsync(int paymentId, DateTime newDate)
    {
        var p = await db.Payments.Include(x => x.Scholar).FirstOrDefaultAsync(x => x.Id == paymentId) ?? throw AppException.NotFound("Payment");
        if (p.Status != "Processed")
            throw AppException.Conflict($"Only a payment that is still 'Processed' can be rescheduled. This one is {p.Status}.");
        newDate = newDate.Date;
        if (newDate < DateTime.Today) throw new AppException("The new release date cannot be in the past.");
        if (p.ReleaseDate?.Date == newDate) return ToDto(p);

        var old = p.ReleaseDate;
        p.ReleaseDate = newDate;
        db.Notifications.Add(new Notification
        {
            SenderId = current.UserId, RecipientId = p.ScholarId, Title = "Payment Release Date Changed", NotificationType = "Update",
            Message = $"The expected release of your stipend for {p.PaymentPeriod} has moved to {newDate:MMM dd, yyyy}" + (old is null ? "." : $" (it was {old:MMM dd, yyyy}).") +
                      $"\nAmount: ₱{p.Amount:N2}\nReference: {p.ReferenceNumber}"
        });
        await db.SaveChangesAsync();
        await log.LogUpdate("payments", p.Id, $"Moved the expected release of {p.Scholar!.FullName}'s {p.PaymentPeriod} stipend to {newDate:MMM dd, yyyy}");
        events.RaisePaymentsChanged([p.ScholarId], "Processed");
        events.RaiseNotificationsSent([p.ScholarId], "Payment Release Date Changed", "Update");
        return ToDto(p);
    }

    private static ProcessedPaymentDto ToDto(Payment p) => new(p.Id, p.ScholarId, p.Scholar!.FullName, p.Scholar.ScholarNumber, p.PaymentPeriod,
        p.Amount, p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber);

    // All payments whose period overlaps the chosen dates (the history table on the Payroll page).
    public async Task<List<DisbursementHistoryDto>> HistoryAsync(DateTime start, DateTime end)
    {
        var rows = await InPeriod(start, end).AsNoTracking().Include(p => p.Scholar).ToListAsync();
        return rows.OrderByDescending(p => p.ReleaseDate).ThenBy(p => p.Status)
            .Select(p => new DisbursementHistoryDto(p.Id, p.Scholar!.FullName, p.Scholar.ScholarNumber, p.PaymentPeriod, p.Amount, p.Status,
                p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber)).ToList();
    }

    // Numbers for the cards at the top of the Payroll page.
    public async Task<PayrollStatsDto> StatsAsync()
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        var processedToday = await db.Payments.CountAsync(p => p.CreatedAt >= today && p.CreatedAt < tomorrow && PaidStatuses.Contains(p.Status));
        var ready = await db.Payments.Where(p => p.Status == "Processed" && p.ReleaseDate != null && p.ReleaseDate <= today).Select(p => p.Amount).ToListAsync();
        return new PayrollStatsDto(processedToday, ready.Count, ready.Sum());
    }
}
