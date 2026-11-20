using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SkolarAid.Core.Common;
using SkolarAid.Core.Dtos;
using SkolarAid.Core.Rules;
using SkolarAid.Data;

namespace SkolarAid.Core.Services;

public static class Csv
{
    /// <summary>RFC 4180 CSV with UTF-8 BOM (so Excel opens it correctly).</summary>
    public static byte[] Write(IReadOnlyList<string> columns, IEnumerable<IReadOnlyList<string?>> rows)
    {
        static string Esc(string? v)
        {
            v ??= "";
            // Neutralise spreadsheet formula injection.
            if (v.Length > 0 && "=+-@".Contains(v[0]) && !decimal.TryParse(v, NumberStyles.Any, CultureInfo.InvariantCulture, out _)) v = "'" + v;
            return v.Contains(',') || v.Contains('"') || v.Contains('\n') || v.Contains('\r') ? $"\"{v.Replace("\"", "\"\"")}\"" : v;
        }
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", columns.Select(Esc)));
        foreach (var r in rows) sb.AppendLine(string.Join(",", r.Select(Esc)));
        return new UTF8Encoding(true).GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }
}

public class DashboardService(SkolarDbContext db)
{
    public async Task<DashboardStatsDto> StatsAsync()
    {
        var scholars = await db.Scholars.CountAsync(s => s.Status == "Active");
        var types = await db.ScholarshipTypes.CountAsync(t => t.IsActive);
        var disbursed = (await db.Payments.Where(p => p.Status == "Released").Select(p => p.Amount).ToListAsync()).Sum();
        // "Pending" = processed/queued but not yet released; those peso amounts are not part of Total Disbursed until released.
        var queued = await db.Payments.Where(p => p.Status == "Pending" || p.Status == "Processed").Select(p => p.Amount).ToListAsync();
        return new DashboardStatsDto(scholars, types, disbursed, queued.Count, queued.Sum());
    }

    public async Task<List<RecentActivityDto>> RecentActivityAsync()
    {
        var rows = await db.ActivityLogs.AsNoTracking().OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id).Take(10).ToListAsync();
        return rows.Select(a => new RecentActivityDto(a.UserName ?? "System", a.Details ?? "", a.CreatedAt)).ToList();
    }

    public async Task<List<UpcomingPaymentDto>> UpcomingPaymentsAsync()
    {
        var rows = await db.Payments.AsNoTracking().Include(p => p.Scholar).Where(p => p.Status == "Processed" || p.Status == "Pending")
            .OrderBy(p => p.ComputationDate).Take(10).ToListAsync();
        return rows.Select(p => new UpcomingPaymentDto(p.Scholar!.FullName, p.Scholar.ScholarNumber, p.Amount,
            p.ReleaseDate ?? p.ComputationDate, p.Status)).ToList();
    }

    public async Task<List<ChartPointDto>> ByScholarshipAsync()
    {
        var types = await db.ScholarshipTypes.AsNoTracking().ToListAsync();
        var counts = await db.Scholars.Where(s => s.Status == "Active" && s.ScholarshipTypeId != null)
            .GroupBy(s => s.ScholarshipTypeId!.Value).Select(g => new { g.Key, C = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.C);
        return types.Select(t => new ChartPointDto(t.Name, counts.GetValueOrDefault(t.Id)))
            .OrderByDescending(p => p.Value).ThenBy(p => p.Label).ToList();
    }

    public async Task<List<ChartPointDto>> ByCourseAsync()
    {
        var rows = await db.Scholars.Where(s => s.Status == "Active" && s.Course != null)
            .GroupBy(s => s.Course!).Select(g => new { g.Key, C = g.Count() }).ToListAsync();
        return rows.OrderByDescending(r => r.C).Select(r => new ChartPointDto(r.Key, r.C)).ToList();
    }

    public async Task<List<ChartPointDto>> MonthlyDisbursementAsync()
    {
        var since = DateTime.Today.AddMonths(-12);
        var rows = await db.Payments.Where(p => p.Status == "Released" && p.ReleaseDate != null && p.ReleaseDate >= since)
            .Select(p => new { p.ReleaseDate, p.Amount }).ToListAsync();
        return rows.GroupBy(r => new { r.ReleaseDate!.Value.Year, r.ReleaseDate!.Value.Month }).OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month)
            .Select(g => new ChartPointDto(new DateTime(g.Key.Year, g.Key.Month, 1).ToString("MMM yyyy", CultureInfo.InvariantCulture), g.Sum(x => x.Amount))).ToList();
    }

    public async Task<AnalyticsDto> AnalyticsAsync()
        => new(await StatsAsync(), await ByScholarshipAsync(), await ByCourseAsync(), await MonthlyDisbursementAsync());
}

public class ActivityLogQueryService(SkolarDbContext db, ActivityLogService log)
{
    public const int PageSize = 25;

    private IQueryable<Data.Entities.ActivityLog> Filtered(DateTime from, DateTime to, string? action, string? user, string? search)
    {
        var start = from.Date;
        var end = to.Date.AddDays(1);
        var q = db.ActivityLogs.AsNoTracking().Include(a => a.User).Where(a => a.CreatedAt >= start && a.CreatedAt < end);
        if (!string.IsNullOrWhiteSpace(action) && !action.StartsWith("All")) q = q.Where(a => a.ActionType == action.ToUpper());
        if (!string.IsNullOrWhiteSpace(user) && !user.StartsWith("All")) q = q.Where(a => a.UserName == user);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim();
            q = q.Where(a => (a.UserName != null && a.UserName.Contains(t)) || (a.Details != null && a.Details.Contains(t)) || a.ActionType.Contains(t));
        }
        return q;
    }

    private static ActivityLogDto ToDto(Data.Entities.ActivityLog a) => new(a.Id, a.CreatedAt, a.UserName,
        a.User?.Role ?? "USER", a.ActionType, a.TableAffected, a.RecordId, a.Details, a.IpAddress ?? "-");

    public async Task<PagedResult<ActivityLogDto>> ListAsync(DateTime from, DateTime to, string? action, string? user, string? search, int page)
    {
        var q = Filtered(from, to, action, user, search);
        var total = await q.CountAsync();
        var rows = await q.OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.Id).Skip((Math.Max(page, 1) - 1) * PageSize).Take(PageSize).ToListAsync();
        return new PagedResult<ActivityLogDto>(rows.Select(ToDto).ToList(), total, Math.Max(page, 1), PageSize);
    }

    public async Task<ActivityStatsDto> StatsAsync()
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        return new ActivityStatsDto(await db.ActivityLogs.CountAsync(),
            await db.ActivityLogs.CountAsync(a => a.CreatedAt >= today && a.CreatedAt < tomorrow),
            await db.ActivityLogs.Where(a => a.CreatedAt >= today && a.CreatedAt < tomorrow && a.UserId != null).Select(a => a.UserId).Distinct().CountAsync());
    }

    public async Task<ActivityFiltersDto> FiltersAsync() => new(
        await db.ActivityLogs.Where(a => a.UserName != null).Select(a => a.UserName!).Distinct().OrderBy(x => x).ToListAsync(),
        await db.ActivityLogs.Select(a => a.ActionType).Distinct().OrderBy(x => x).ToListAsync());

    public async Task<byte[]> CsvAsync(DateTime from, DateTime to, string? action, string? user, string? search)
    {
        var rows = await Filtered(from, to, action, user, search).OrderByDescending(a => a.CreatedAt).Take(50_000).ToListAsync();
        await log.LogAsync("EXPORT", "Exported activity logs to CSV");
        return Csv.Write(["ID", "Timestamp", "User", "Role", "Action", "Table", "Record ID", "Details", "IP Address"],
            rows.Select(a => (IReadOnlyList<string?>)[a.Id.ToString(), a.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"), a.UserName,
                a.User?.Role ?? "USER", a.ActionType, a.TableAffected, a.RecordId?.ToString(), a.Details, a.IpAddress ?? "-"]));
    }
}

public class ReportService(SkolarDbContext db, ActivityLogService log)
{
    public static readonly string[] ReportTypes =
        ["Scholar Census Report", "Payroll Summary Report", "Compliance Report", "Payment History Report", "Activity Log Report", "Scholarship Masterlist"];

    public async Task<ReportResultDto> GenerateAsync(ReportQuery q)
    {
        var from = (q.From ?? DateTime.Today.AddYears(-1)).Date;
        var to = (q.To ?? DateTime.Today).Date.AddDays(1);
        ReportResultDto result;

        switch (q.Type)
        {
            case "Scholar Census Report":
            {
                var s = db.Scholars.AsNoTracking().Include(x => x.ScholarshipType).Where(x => x.CreatedAt >= from && x.CreatedAt < to);
                if (!string.IsNullOrEmpty(q.Status) && q.Status != "All Status") s = s.Where(x => x.Status == q.Status);
                if (!string.IsNullOrEmpty(q.Scholarship) && !q.Scholarship.StartsWith("All")) s = s.Where(x => x.ScholarshipType!.Name == q.Scholarship);
                if (!string.IsNullOrEmpty(q.Course) && !q.Course.StartsWith("All")) s = s.Where(x => x.Course == q.Course);
                var rows = await s.OrderBy(x => x.Id).ToListAsync();
                result = new ReportResultDto(q.Type, ["Scholar #", "Name", "Course", "Year", "Scholarship", "Status"],
                    rows.Select(x => (IReadOnlyList<string?>)[x.ScholarNumber, $"{x.FirstName} {x.LastName}", x.Course, x.YearLevel, x.ScholarshipType?.Name ?? "Not Assigned", x.Status]).ToList());
                break;
            }
            case "Payroll Summary Report":
            {
                var rows = (await db.Payments.AsNoTracking().Where(p => p.ReleaseDate >= from && p.ReleaseDate < to).ToListAsync())
                    .GroupBy(p => new { p.PaymentPeriod, p.Status }).OrderByDescending(g => g.Key.PaymentPeriod).ToList();
                result = new ReportResultDto(q.Type, ["Period", "Total Payments", "Total Amount", "Status"],
                    rows.Select(g => (IReadOnlyList<string?>)[g.Key.PaymentPeriod, g.Count().ToString(), g.Sum(p => p.Amount).ToString("N2", CultureInfo.InvariantCulture), g.Key.Status]).ToList());
                break;
            }
            case "Compliance Report":
            {
                var c = db.ComplianceRecords.AsNoTracking().Include(x => x.Scholar).ThenInclude(s => s!.ScholarshipType).AsQueryable();
                if (!string.IsNullOrEmpty(q.Scholarship) && !q.Scholarship.StartsWith("All")) c = c.Where(x => x.Scholar!.ScholarshipType!.Name == q.Scholarship);
                if (!string.IsNullOrEmpty(q.Course) && !q.Course.StartsWith("All")) c = c.Where(x => x.Scholar!.Course == q.Course);
                var rows = (await c.ToListAsync()).OrderBy(x => x.Scholar!.LastName).ThenBy(x => x.RequirementType).ToList();
                result = new ReportResultDto(q.Type, ["Scholar #", "Name", "Course", "Requirement", "Status", "Due Date", "Date Submitted", "Remarks"],
                    rows.Select(x => (IReadOnlyList<string?>)[x.Scholar!.ScholarNumber, $"{x.Scholar.FirstName} {x.Scholar.LastName}", x.Scholar.Course,
                        x.RequirementType, x.Status, x.DueDate.ToString("yyyy-MM-dd"), x.DateSubmitted?.ToString("yyyy-MM-dd"), x.Remarks]).ToList());
                break;
            }
            case "Payment History Report":
            {
                var rows = (await db.Payments.AsNoTracking().Include(p => p.Scholar).Where(p => p.ReleaseDate >= from && p.ReleaseDate < to).ToListAsync())
                    .OrderByDescending(p => p.ReleaseDate).ToList();
                result = new ReportResultDto(q.Type, ["Scholar #", "Name", "Period", "Amount", "Status", "Release Date", "Method"],
                    rows.Select(p => (IReadOnlyList<string?>)[p.Scholar!.ScholarNumber, $"{p.Scholar.FirstName} {p.Scholar.LastName}", p.PaymentPeriod,
                        p.Amount.ToString("N2", CultureInfo.InvariantCulture), p.Status, p.ReleaseDate?.ToString("yyyy-MM-dd"), p.PaymentMethod]).ToList());
                break;
            }
            case "Activity Log Report":
            {
                var rows = await db.ActivityLogs.AsNoTracking().Where(a => a.CreatedAt >= from && a.CreatedAt < to).OrderByDescending(a => a.CreatedAt).Take(5000).ToListAsync();
                result = new ReportResultDto(q.Type, ["User", "Action", "Details", "Timestamp"],
                    rows.Select(a => (IReadOnlyList<string?>)[a.UserName, a.ActionType, a.Details, a.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss")]).ToList());
                break;
            }
            default:
            {
                var rows = await db.Scholars.AsNoTracking().OrderBy(s => s.Id).ToListAsync();
                result = new ReportResultDto("Scholarship Masterlist", ["Scholar #", "Name", "Course", "Status"],
                    rows.Select(s => (IReadOnlyList<string?>)[s.ScholarNumber, $"{s.FirstName} {s.LastName}", s.Course, s.Status]).ToList());
                break;
            }
        }
        await log.LogAsync("GENERATE_REPORT", $"Generated {result.Title} with {result.Rows.Count} records");
        return result;
    }

    public async Task<byte[]> CsvAsync(ReportQuery q)
    {
        var r = await GenerateAsync(q);
        await log.LogAsync("EXPORT", $"Exported {r.Title} to CSV");
        return Csv.Write(r.Columns, r.Rows);
    }

    public async Task<ReceiptDto> ReceiptAsync(int paymentId)
    {
        var p = await db.Payments.AsNoTracking().Include(x => x.Scholar).Include(x => x.Processor).FirstOrDefaultAsync(x => x.Id == paymentId)
                ?? throw AppException.NotFound("Payment");
        var s = p.Scholar!;
        await log.LogAsync("PRINT_RECEIPT", $"Printed disbursement receipt for {s.FullName} (#{paymentId})", "payments", paymentId);
        return new ReceiptDto(p.Id, s.FullName, s.ScholarNumber, s.StudentId, s.Course, p.PaymentPeriod, p.Amount, AmountWords.ToWords(p.Amount),
            p.Status, p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber, p.Processor?.Name, s.BankName, s.BankAccountNumber, p.ComputationDate);
    }

    public async Task<List<ReleasedPaymentDto>> ReleasedPaymentsAsync() =>
        (await db.Payments.AsNoTracking().Where(p => p.Status == "Released").Include(p => p.Scholar).OrderByDescending(p => p.ReleaseDate).Take(200).ToListAsync())
        .Select(p => new ReleasedPaymentDto(p.Id, p.Scholar!.ScholarNumber, p.Scholar.FullName, p.PaymentPeriod, p.Amount, p.ReleaseDate)).ToList();
}

public class ScholarPortalService(SkolarDbContext db, ComplianceService compliance, NotificationService notifications)
{
    private async Task<Data.Entities.Scholar> ScholarAsync(int id) =>
        await db.Scholars.AsNoTracking().Include(s => s.ScholarshipType).FirstOrDefaultAsync(s => s.Id == id) ?? throw AppException.NotFound("Scholar");

    public async Task<ScholarDashboardDto> DashboardAsync(int scholarId)
    {
        var s = await ScholarAsync(scholarId);
        var payments = await PaymentsAsync(scholarId);
        var comp = await compliance.ListForSelfAsync(scholarId);
        var notifs = await notifications.ListForScholarAsync(scholarId, null, false);
        // Prefer the real queued payment (same release date the admin sees); only fall back to the frequency-based estimate.
        var queued = payments.Items.Where(p => p.Status is "Processed" or "Pending").OrderBy(p => p.ReleaseDate ?? DateTime.MaxValue).FirstOrDefault();
        var nextDate = queued is { ReleaseDate: not null }
            ? queued.ReleaseDate.Value.ToString("MMM dd, yyyy", CultureInfo.InvariantCulture)
            : ScholarRules.NextPaymentDate(s.StipendFrequency, DateTime.Now);
        var nextNote = queued is { ReleaseDate: not null } ? $"{queued.Period} stipend · {queued.Status}, releases on this date" : "Estimated · no payment processed yet";
        var due = comp.Items.Where(i => i.Status is "Pending" or "Rejected" or "Overdue").ToList();
        return new ScholarDashboardDto(s.FullName, s.ScholarNumber, s.ScholarshipType?.Name ?? "N/A", s.ScholarshipType?.StipendAmount ?? 0,
            nextDate, payments.TotalReceived, comp.Rate,
            payments.Items.Take(5).ToList(), comp.Items.Take(3).ToList(), notifs.Items.Take(3).ToList(),
            nextNote, queued?.Amount, due.Count, due.Count == 0 ? null : due.Min(i => i.DueDate));
    }

    public async Task<ScholarProfileDto> ProfileAsync(int scholarId)
    {
        var s = await ScholarAsync(scholarId);
        return new ScholarProfileDto(s.FirstName, s.MiddleName, s.LastName, s.Email, s.ContactNumber, s.Address, s.DateOfBirth, s.Gender,
            s.BankName, s.BankAccountNumber, s.StudentId, s.Hei, s.Course, s.YearLevel, s.ScholarNumber, s.ScholarshipType?.Name,
            s.EnrollmentDate, s.ExpectedGraduation, s.Status, s.ScholarshipType?.StipendAmount ?? s.StipendAmount ?? 0,
            s.ScholarshipFundSource, s.RenewalConditions);
    }

    public async Task<ScholarPaymentsDto> PaymentsAsync(int scholarId)
    {
        var rows = await db.Payments.AsNoTracking().Include(p => p.Processor).Where(p => p.ScholarId == scholarId).ToListAsync();
        rows = rows.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id).ToList();
        var items = rows.Select(p => new PaymentItemDto(p.Id, p.PaymentPeriod, p.Amount, p.Status, p.ReleaseDate, p.PaymentMethod, p.ReferenceNumber, p.Processor?.Name)).ToList();
        var released = rows.Where(p => p.Status == "Released").ToList();
        var last = released.OrderByDescending(p => p.ReleaseDate).FirstOrDefault();
        return new ScholarPaymentsDto(items, released.Sum(p => p.Amount),
            rows.Where(p => p.Status is "Pending" or "Processed").Sum(p => p.Amount), last?.Amount ?? 0, last?.ReleaseDate, rows.Count);
    }

    public async Task<byte[]> PaymentsCsvAsync(int scholarId)
    {
        var p = await PaymentsAsync(scholarId);
        return Csv.Write(["ID", "Period", "Amount", "Status", "Release Date", "Payment Method", "Reference Number", "Processed By"],
            p.Items.Select(i => (IReadOnlyList<string?>)[i.Id.ToString(), i.Period, i.Amount.ToString("F2", CultureInfo.InvariantCulture), i.Status,
                i.ReleaseDate?.ToString("yyyy-MM-dd"), i.PaymentMethod, i.ReferenceNumber, i.ProcessedBy]));
    }
}
