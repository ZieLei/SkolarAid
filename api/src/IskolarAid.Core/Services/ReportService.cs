// =====================================================================
// ReportService.cs - read-only numbers, charts, reports and CSV files.
// Csv                     -> turns rows into a CSV file (Word files: Docx.cs)
// DashboardService        -> admin dashboard cards and charts
// ActivityLogQueryService -> Admin > Activity logs page
// ReportService           -> Admin > Reports page (tables, CSV, receipts)
// ScholarPortalService    -> the scholar's dashboard, profile and payments
// =====================================================================
using System.Globalization;
using System.Text;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using Microsoft.EntityFrameworkCore;

namespace IskolarAid.Core.Services;

public static class Csv
{
    /// <summary>RFC 4180 CSV with UTF-8 BOM (so Excel opens it correctly).</summary>
    public static byte[] Write(
        IReadOnlyList<string> columns,
        IEnumerable<IReadOnlyList<string?>> rows
    )
    {
        static string Esc(string? v)
        {
            v ??= "";
            // Neutralise spreadsheet formula injection.
            if (
                v.Length > 0
                && "=+-@".Contains(v[0])
                && !decimal.TryParse(v, NumberStyles.Any, CultureInfo.InvariantCulture, out _)
            )
                v = "'" + v;
            return v.Contains(',') || v.Contains('"') || v.Contains('\n') || v.Contains('\r')
                ? $"\"{v.Replace("\"", "\"\"")}\""
                : v;
        }
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", columns.Select(Esc)));
        foreach (var r in rows)
            sb.AppendLine(string.Join(",", r.Select(Esc)));
        return new UTF8Encoding(true)
            .GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(sb.ToString()))
            .ToArray();
    }
}

// Numbers and charts for the admin dashboard and the analytics section of Reports.
public class DashboardService(IskolarDbContext db)
{
    public async Task<DashboardStatsDto> StatsAsync()
    {
        var scholars = await db.Scholars.CountAsync(s => s.Status == "Active");
        var types = await db.ScholarshipTypes.CountAsync(t => t.IsActive);
        var disbursed = (
            await db.Payments.Where(p => p.Status == "Released").Select(p => p.Amount).ToListAsync()
        ).Sum();
        // "Pending" = processed/queued but not yet released; those peso amounts are not part of Total Disbursed until released.
        var queued = await db
            .Payments.Where(p => p.Status == "Pending" || p.Status == "Processed")
            .Select(p => p.Amount)
            .ToListAsync();
        return new DashboardStatsDto(scholars, types, disbursed, queued.Count, queued.Sum());
    }

    public async Task<List<RecentActivityDto>> RecentActivityAsync()
    {
        // Logins are noise on a dashboard; they stay in the full Activity Log.
        var rows = await db
            .ActivityLogs.AsNoTracking()
            .Where(a => a.ActionType != "LOGIN" && a.ActionType != "LOGOUT")
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Take(10)
            .ToListAsync();
        return rows.Select(a => new RecentActivityDto(
                a.UserName ?? "System",
                a.Details ?? "",
                a.CreatedAt
            ))
            .ToList();
    }

    public async Task<List<UpcomingPaymentDto>> UpcomingPaymentsAsync()
    {
        var rows = await db
            .Payments.AsNoTracking()
            .Include(p => p.Scholar)
            .Where(p => p.Status == "Processed" || p.Status == "Pending")
            .OrderBy(p => p.ComputationDate)
            .Take(10)
            .ToListAsync();
        return rows.Select(p => new UpcomingPaymentDto(
                p.Scholar!.FullName,
                p.Scholar.ScholarNumber,
                p.Amount,
                p.ReleaseDate ?? p.ComputationDate,
                p.Status,
                p.PaymentPeriod
            ))
            .ToList();
    }

    public async Task<List<ChartPointDto>> ByScholarshipAsync()
    {
        var types = await db.ScholarshipTypes.AsNoTracking().ToListAsync();
        var counts = await db
            .Scholars.Where(s => s.Status == "Active" && s.ScholarshipTypeId != null)
            .GroupBy(s => s.ScholarshipTypeId!.Value)
            .Select(g => new { g.Key, C = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.C);
        return types
            .Select(t => new ChartPointDto(t.Name, counts.GetValueOrDefault(t.Id)))
            .OrderByDescending(p => p.Value)
            .ThenBy(p => p.Label)
            .ToList();
    }

    public async Task<List<ChartPointDto>> ByCourseAsync()
    {
        var rows = await db
            .Scholars.Where(s => s.Status == "Active" && s.Course != null)
            .GroupBy(s => s.Course!)
            .Select(g => new { g.Key, C = g.Count() })
            .ToListAsync();
        return rows.OrderByDescending(r => r.C).Select(r => new ChartPointDto(r.Key, r.C)).ToList();
    }

    // Money RELEASED per month for the last 12 months (this month included), oldest first.
    // Every month is listed, with 0 when nothing was released, so the chart always has a full time axis.
    // Processed-but-not-released payments are not counted (the money has not gone out yet).
    public async Task<List<ChartPointDto>> MonthlyDisbursementAsync()
    {
        var first = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1).AddMonths(-11);
        var rows = await db
            .Payments.Where(p =>
                p.Status == "Released" && p.ReleaseDate != null && p.ReleaseDate >= first
            )
            .Select(p => new { p.ReleaseDate, p.Amount })
            .ToListAsync();
        var byMonth = rows.GroupBy(r => new DateTime(
                r.ReleaseDate!.Value.Year,
                r.ReleaseDate!.Value.Month,
                1
            ))
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Amount));
        return Enumerable
            .Range(0, 12)
            .Select(i => first.AddMonths(i))
            .Select(m => new ChartPointDto(
                m.ToString("MMM yyyy", CultureInfo.InvariantCulture),
                byMonth.GetValueOrDefault(m)
            ))
            .ToList();
    }

    public async Task<AnalyticsDto> AnalyticsAsync() =>
        new(
            await StatsAsync(),
            await ByScholarshipAsync(),
            await ByCourseAsync(),
            await MonthlyDisbursementAsync()
        );
}

// Search, page through and export the activity log.
public class ActivityLogQueryService(IskolarDbContext db, ActivityLogService log)
{
    public const int PageSize = 25;

    private IQueryable<Data.Entities.ActivityLog> Filtered(
        DateTime from,
        DateTime to,
        string? action,
        string? user,
        string? search
    )
    {
        var start = from.Date;
        var end = to.Date.AddDays(1);
        var q = db
            .ActivityLogs.AsNoTracking()
            .Include(a => a.User)
            .Where(a => a.CreatedAt >= start && a.CreatedAt < end);
        if (action == "Hide sign-ins")
            q = q.Where(a => a.ActionType != "LOGIN" && a.ActionType != "LOGOUT");
        else if (!string.IsNullOrWhiteSpace(action) && !action.StartsWith("All"))
            q = q.Where(a => a.ActionType == action.ToUpper());
        if (!string.IsNullOrWhiteSpace(user) && !user.StartsWith("All"))
            q = q.Where(a => a.UserName == user);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim();
            q = q.Where(a =>
                (a.UserName != null && a.UserName.Contains(t))
                || (a.Details != null && a.Details.Contains(t))
                || a.ActionType.Contains(t)
            );
        }
        return q;
    }

    private static ActivityLogDto ToDto(Data.Entities.ActivityLog a) =>
        new(
            a.Id,
            a.CreatedAt,
            a.UserName,
            a.User?.Role ?? "USER",
            a.ActionType,
            a.TableAffected,
            a.RecordId,
            a.Details,
            a.IpAddress ?? "-"
        );

    public async Task<PagedResult<ActivityLogDto>> ListAsync(
        DateTime from,
        DateTime to,
        string? action,
        string? user,
        string? search,
        int page
    )
    {
        var q = Filtered(from, to, action, user, search);
        var total = await q.CountAsync();
        var rows = await q.OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.Id)
            .Skip((Math.Max(page, 1) - 1) * PageSize)
            .Take(PageSize)
            .ToListAsync();
        return new PagedResult<ActivityLogDto>(
            rows.Select(ToDto).ToList(),
            total,
            Math.Max(page, 1),
            PageSize
        );
    }

    public async Task<ActivityStatsDto> StatsAsync()
    {
        var today = DateTime.Today;
        var tomorrow = today.AddDays(1);
        return new ActivityStatsDto(
            await db.ActivityLogs.CountAsync(),
            await db.ActivityLogs.CountAsync(a => a.CreatedAt >= today && a.CreatedAt < tomorrow),
            await db
                .ActivityLogs.Where(a =>
                    a.CreatedAt >= today && a.CreatedAt < tomorrow && a.UserId != null
                )
                .Select(a => a.UserId)
                .Distinct()
                .CountAsync()
        );
    }

    public async Task<ActivityFiltersDto> FiltersAsync() =>
        new(
            await db
                .ActivityLogs.Where(a => a.UserName != null)
                .Select(a => a.UserName!)
                .Distinct()
                .OrderBy(x => x)
                .ToListAsync(),
            await db.ActivityLogs.Select(a => a.ActionType).Distinct().OrderBy(x => x).ToListAsync()
        );

    public async Task<byte[]> CsvAsync(
        DateTime from,
        DateTime to,
        string? action,
        string? user,
        string? search
    )
    {
        var (columns, rows) = await ExportRowsAsync(from, to, action, user, search);
        await log.LogAsync("EXPORT", "Exported activity logs to CSV");
        return Csv.Write(columns, rows);
    }

    // Same rows as the CSV, as an editable Word file.
    public async Task<byte[]> DocxAsync(
        DateTime from,
        DateTime to,
        string? action,
        string? user,
        string? search
    )
    {
        var (columns, rows) = await ExportRowsAsync(from, to, action, user, search);
        await log.LogAsync("EXPORT", "Exported activity logs to Word");
        return Docx.Table(
            "Activity Log",
            columns,
            rows,
            $"From {from:MMM dd, yyyy} to {to:MMM dd, yyyy} · {rows.Count} entries"
        );
    }

    // The filtered log as a table (shared by the CSV and Word exports).
    private async Task<(string[] Columns, List<IReadOnlyList<string?>> Rows)> ExportRowsAsync(
        DateTime from,
        DateTime to,
        string? action,
        string? user,
        string? search
    )
    {
        var rows = await Filtered(from, to, action, user, search)
            .OrderByDescending(a => a.CreatedAt)
            .Take(50_000)
            .ToListAsync();
        return (
            [
                "ID",
                "Timestamp",
                "User",
                "Role",
                "Action",
                "Table",
                "Record ID",
                "Details",
                "IP Address",
            ],
            rows.Select(a =>
                    (IReadOnlyList<string?>)
                        [
                            a.Id.ToString(),
                            a.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                            a.UserName,
                            a.User?.Role ?? "USER",
                            a.ActionType,
                            a.TableAffected,
                            a.RecordId?.ToString(),
                            a.Details,
                            a.IpAddress ?? "-",
                        ]
                )
                .ToList()
        );
    }
}

public class ReportService(IskolarDbContext db, ActivityLogService log)
{
    // The report names shown in the "Report type" drop-down. GenerateAsync switches on these.
    public static readonly string[] ReportTypes =
    [
        "Scholar Census Report",
        "Payroll Summary Report",
        "Compliance Report",
        "Payment History Report",
        "Activity Log Report",
        "Scholarship Masterlist",
    ];

    // A payment is in range when it was processed in the range OR is scheduled/released in it.
    // (Release date alone would hide a payment processed today: its release date is a few days ahead.)
    // Build one report as a table (title, column names, rows of text).
    // The date range defaults to the last year. Filters that start with "All" mean "no filter".
    public async Task<ReportResultDto> GenerateAsync(ReportQuery q)
    {
        var from = (q.From ?? DateTime.Today.AddYears(-1)).Date;
        var to = (q.To ?? DateTime.Today).Date.AddDays(1);
        ReportResultDto result;

        switch (q.Type)
        {
            case "Scholar Census Report":
            {
                var s = db
                    .Scholars.AsNoTracking()
                    .Include(x => x.ScholarshipType)
                    .Where(x => x.CreatedAt >= from && x.CreatedAt < to);
                if (!string.IsNullOrEmpty(q.Status) && q.Status != "All Status")
                    s = s.Where(x => x.Status == q.Status);
                if (!string.IsNullOrEmpty(q.Scholarship) && !q.Scholarship.StartsWith("All"))
                    s = s.Where(x => x.ScholarshipType!.Name == q.Scholarship);
                if (!string.IsNullOrEmpty(q.Course) && !q.Course.StartsWith("All"))
                    s = s.Where(x => x.Course == q.Course);
                var rows = await s.OrderBy(x => x.Id).ToListAsync();
                result = new ReportResultDto(
                    q.Type,
                    ["Scholar #", "Name", "Course", "Year", "Scholarship", "Status"],
                    rows.Select(x =>
                            (IReadOnlyList<string?>)
                                [
                                    x.ScholarNumber,
                                    $"{x.FirstName} {x.LastName}",
                                    x.Course,
                                    x.YearLevel,
                                    x.ScholarshipType?.Name ?? "Not Assigned",
                                    x.Status,
                                ]
                        )
                        .ToList()
                );
                break;
            }
            case "Payroll Summary Report":
            {
                var rows = (
                    await db
                        .Payments.AsNoTracking()
                        .Where(p =>
                            (p.ComputationDate >= from && p.ComputationDate < to)
                            || (p.ReleaseDate >= from && p.ReleaseDate < to)
                        )
                        .ToListAsync()
                )
                    .GroupBy(p => new { p.PaymentPeriod, p.Status })
                    .OrderByDescending(g => g.Key.PaymentPeriod)
                    .ToList();
                result = new ReportResultDto(
                    q.Type,
                    ["Period", "Total Payments", "Total Amount", "Status"],
                    rows.Select(g =>
                            (IReadOnlyList<string?>)
                                [
                                    g.Key.PaymentPeriod,
                                    g.Count().ToString(),
                                    g.Sum(p => p.Amount)
                                        .ToString("N2", CultureInfo.InvariantCulture),
                                    g.Key.Status,
                                ]
                        )
                        .ToList()
                );
                break;
            }
            case "Compliance Report":
            {
                var c = db
                    .ComplianceRecords.AsNoTracking()
                    .Include(x => x.Scholar)
                        .ThenInclude(s => s!.ScholarshipType)
                    .AsQueryable();
                if (!string.IsNullOrEmpty(q.Scholarship) && !q.Scholarship.StartsWith("All"))
                    c = c.Where(x => x.Scholar!.ScholarshipType!.Name == q.Scholarship);
                if (!string.IsNullOrEmpty(q.Course) && !q.Course.StartsWith("All"))
                    c = c.Where(x => x.Scholar!.Course == q.Course);
                var rows = (await c.ToListAsync())
                    .OrderBy(x => x.Scholar!.LastName)
                    .ThenBy(x => x.RequirementType)
                    .ToList();
                result = new ReportResultDto(
                    q.Type,
                    [
                        "Scholar #",
                        "Name",
                        "Course",
                        "Requirement",
                        "Status",
                        "Due Date",
                        "Date Submitted",
                        "Remarks",
                    ],
                    rows.Select(x =>
                            (IReadOnlyList<string?>)
                                [
                                    x.Scholar!.ScholarNumber,
                                    $"{x.Scholar.FirstName} {x.Scholar.LastName}",
                                    x.Scholar.Course,
                                    x.RequirementType,
                                    x.Status,
                                    x.DueDate.ToString("yyyy-MM-dd"),
                                    x.DateSubmitted?.ToString("yyyy-MM-dd"),
                                    x.Remarks,
                                ]
                        )
                        .ToList()
                );
                break;
            }
            case "Payment History Report":
            {
                var rows = (
                    await db
                        .Payments.AsNoTracking()
                        .Include(p => p.Scholar)
                        .Where(p =>
                            (p.ComputationDate >= from && p.ComputationDate < to)
                            || (p.ReleaseDate >= from && p.ReleaseDate < to)
                        )
                        .ToListAsync()
                )
                    .OrderByDescending(p => p.ReleaseDate)
                    .ToList();
                result = new ReportResultDto(
                    q.Type,
                    ["Scholar #", "Name", "Period", "Amount", "Status", "Release Date", "Method"],
                    rows.Select(p =>
                            (IReadOnlyList<string?>)
                                [
                                    p.Scholar!.ScholarNumber,
                                    $"{p.Scholar.FirstName} {p.Scholar.LastName}",
                                    p.PaymentPeriod,
                                    p.Amount.ToString("N2", CultureInfo.InvariantCulture),
                                    p.Status,
                                    p.ReleaseDate?.ToString("yyyy-MM-dd"),
                                    p.PaymentMethod,
                                ]
                        )
                        .ToList()
                );
                break;
            }
            case "Activity Log Report":
            {
                var rows = await db
                    .ActivityLogs.AsNoTracking()
                    .Where(a => a.CreatedAt >= from && a.CreatedAt < to)
                    .OrderByDescending(a => a.CreatedAt)
                    .Take(5000)
                    .ToListAsync();
                result = new ReportResultDto(
                    q.Type,
                    ["User", "Action", "Details", "Timestamp"],
                    rows.Select(a =>
                            (IReadOnlyList<string?>)
                                [
                                    a.UserName,
                                    a.ActionType,
                                    a.Details,
                                    a.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                                ]
                        )
                        .ToList()
                );
                break;
            }
            default:
            {
                var rows = await db.Scholars.AsNoTracking().OrderBy(s => s.Id).ToListAsync();
                result = new ReportResultDto(
                    "Scholarship Masterlist",
                    ["Scholar #", "Name", "Course", "Status"],
                    rows.Select(s =>
                            (IReadOnlyList<string?>)
                                [s.ScholarNumber, $"{s.FirstName} {s.LastName}", s.Course, s.Status]
                        )
                        .ToList()
                );
                break;
            }
        }
        // Every report run is written to the activity log.
        await log.LogAsync(
            "GENERATE_REPORT",
            $"Generated {result.Title} with {result.Rows.Count} records"
        );
        return result;
    }

    // Same report, returned as a CSV file.
    public async Task<byte[]> CsvAsync(ReportQuery q)
    {
        var r = await GenerateAsync(q);
        await log.LogAsync("EXPORT", $"Exported {r.Title} to CSV");
        return Csv.Write(r.Columns, r.Rows);
    }

    // Same report as an editable Word file.
    public async Task<byte[]> DocxAsync(ReportQuery q)
    {
        var r = await GenerateAsync(q);
        await log.LogAsync("EXPORT", $"Exported {r.Title} to Word");
        return Docx.Table(r.Title, r.Columns, r.Rows, $"{r.Rows.Count} records");
    }

    // One payment receipt as an editable Word file (same details as the printed receipt).
    public async Task<byte[]> ReceiptDocxAsync(int paymentId)
    {
        var r = await ReceiptAsync(paymentId);
        string? D(DateTime? d) => d?.ToString("MMMM dd, yyyy", CultureInfo.InvariantCulture);
        return Docx.Write(
            new Docx.Content
            {
                Title = "Disbursement Receipt",
                Lines = [$"Reference: {r.ReferenceNumber ?? "-"}"],
                Columns = ["Item", "Details"],
                Rows =
                [
                    ["Scholar Name", r.ScholarName],
                    ["Scholar Number", r.ScholarNumber],
                    ["Student ID", r.StudentId],
                    ["Course", r.Course],
                    ["Period", r.Period],
                    ["Status", r.Status],
                    ["Release Date", D(r.ReleaseDate)],
                    ["Payment Method", r.PaymentMethod],
                    [
                        "Bank",
                        string.Join(
                            " · ",
                            new[] { r.BankName, r.BankAccountNumber }.Where(x =>
                                !string.IsNullOrWhiteSpace(x)
                            )
                        ),
                    ],
                    ["Computation Date", D(r.ComputationDate)],
                    ["Processed By", r.ProcessedBy],
                    ["Amount", "P" + r.Amount.ToString("N2", CultureInfo.InvariantCulture)],
                    ["Amount in Words", r.AmountInWords],
                ],
                Signatures = ["Received by (Scholar)", "Authorized Signatory"],
            }
        );
    }

    // Data for one printable payment receipt.
    public async Task<ReceiptDto> ReceiptAsync(int paymentId)
    {
        var p = await db
            .Payments.AsNoTracking()
            .Include(x => x.Scholar)
            .Include(x => x.Processor)
            .FirstOrDefaultAsync(x => x.Id == paymentId)
            // [VALIDATION] the record must exist, otherwise 404 Not Found (Payment)
            ?? throw AppException.NotFound("Payment");
        var s = p.Scholar!;
        await log.LogAsync(
            "PRINT_RECEIPT",
            $"Printed disbursement receipt for {s.FullName} (#{paymentId})",
            "payments",
            paymentId
        );
        return new ReceiptDto(
            p.Id,
            s.FullName,
            s.ScholarNumber,
            s.StudentId,
            s.Course,
            p.PaymentPeriod,
            p.Amount,
            AmountWords.ToWords(p.Amount),
            p.Status,
            p.ReleaseDate,
            p.PaymentMethod,
            p.ReferenceNumber,
            p.Processor?.Name,
            s.BankName,
            s.BankAccountNumber,
            p.ComputationDate
        );
    }

    // Released payments to pick from when printing a receipt.
    public async Task<List<ReleasedPaymentDto>> ReleasedPaymentsAsync() =>
        (
            await db
                .Payments.AsNoTracking()
                .Where(p => p.Status == "Released")
                .Include(p => p.Scholar)
                .OrderByDescending(p => p.ReleaseDate)
                .Take(200)
                .ToListAsync()
        )
            .Select(p => new ReleasedPaymentDto(
                p.Id,
                p.Scholar!.ScholarNumber,
                p.Scholar.FullName,
                p.PaymentPeriod,
                p.Amount,
                p.ReleaseDate
            ))
            .ToList();
}

// Everything the scholar portal shows (called by ScholarPortalController).
// Every method takes the scholar id from the login token, never from the browser.
public class ScholarPortalService(
    IskolarDbContext db,
    ComplianceService compliance,
    NotificationService notifications,
    ActivityLogService log
)
{
    /// <summary>Scholars can keep their own contact and payout details current; everything else stays with the Scholarship Office.</summary>
    public async Task<ScholarProfileDto> UpdateProfileAsync(
        int scholarId,
        ScholarProfileUpdateDto dto
    )
    {
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Scholar)
        var s = await db.Scholars.FirstOrDefaultAsync(x => x.Id == scholarId)
            ?? throw AppException.NotFound("Scholar");
        static string? N(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        s.ContactNumber = N(dto.ContactNumber) is { } c ? ScholarRules.NormalizePhone(c) : null;
        s.Address = N(dto.Address);
        s.BankName = N(dto.BankName);
        s.BankAccountNumber = N(dto.BankAccountNumber);
        await db.SaveChangesAsync();
        await log.LogUpdate(
            "scholars",
            scholarId,
            $"{s.FullName} updated their own contact/bank details"
        );
        return await ProfileAsync(scholarId);
    }

    private async Task<Data.Entities.Scholar> ScholarAsync(int id) =>
        // [VALIDATION] the record must exist, otherwise 404 Not Found (Scholar)
        await db
            .Scholars.AsNoTracking()
            .Include(s => s.ScholarshipType)
            .FirstOrDefaultAsync(s => s.Id == id)
        ?? throw AppException.NotFound("Scholar");

    // Scholar home page: scholarship, next payment, compliance and recent notifications.
    public async Task<ScholarDashboardDto> DashboardAsync(int scholarId)
    {
        var s = await ScholarAsync(scholarId);
        var payments = await PaymentsAsync(scholarId);
        var comp = await compliance.ListForSelfAsync(scholarId);
        var notifs = await notifications.ListForScholarAsync(scholarId, null, false);
        // Prefer the real queued payment (same release date the admin sees); only fall back to the frequency-based estimate.
        var queued = payments
            .Items.Where(p => p.Status is "Processed" or "Pending")
            .OrderBy(p => p.ReleaseDate ?? DateTime.MaxValue)
            .FirstOrDefault();
        var nextDate = queued is { ReleaseDate: not null }
            ? queued.ReleaseDate.Value.ToString("MMM dd, yyyy", CultureInfo.InvariantCulture)
            : ScholarRules.NextPaymentDate(
                s.ScholarshipType?.PaymentFrequency ?? s.StipendFrequency,
                DateTime.Now
            );
        var nextNote = queued is { ReleaseDate: not null }
            ? $"{queued.Period} stipend · {queued.Status}, releases on this date"
            : "Estimated · no payment processed yet";
        var due = comp.Items.Where(i => i.Status is "Pending" or "Rejected" or "Overdue").ToList();
        return new ScholarDashboardDto(
            s.FullName,
            s.ScholarNumber,
            s.ScholarshipType?.Name ?? "N/A",
            s.ScholarshipType?.StipendAmount ?? 0,
            nextDate,
            payments.TotalReceived,
            comp.Rate,
            payments.Items.Take(5).ToList(),
            comp.Items.Take(3).ToList(),
            notifs.Items.Take(3).ToList(),
            nextNote,
            queued?.Amount,
            due.Count,
            due.Count == 0 ? null : due.Min(i => i.DueDate)
        );
    }

    public async Task<ScholarProfileDto> ProfileAsync(int scholarId)
    {
        var s = await ScholarAsync(scholarId);
        return new ScholarProfileDto(
            s.FirstName,
            s.MiddleName,
            s.LastName,
            s.Email,
            s.ContactNumber,
            s.Address,
            s.DateOfBirth,
            s.Gender,
            s.BankName,
            s.BankAccountNumber,
            s.StudentId,
            s.Hei,
            s.Course,
            s.YearLevel,
            s.ScholarNumber,
            s.ScholarshipType?.Name,
            s.EnrollmentDate,
            s.ExpectedGraduation,
            s.Status,
            s.ScholarshipType?.StipendAmount ?? s.StipendAmount ?? 0,
            s.ScholarshipFundSource,
            s.RenewalConditions
        );
    }

    // The scholar's payment history plus totals: received, pending, last payment.
    public async Task<ScholarPaymentsDto> PaymentsAsync(int scholarId)
    {
        var rows = await db
            .Payments.AsNoTracking()
            .Include(p => p.Processor)
            .Where(p => p.ScholarId == scholarId)
            .ToListAsync();
        rows = rows.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id).ToList();
        var items = rows.Select(p => new PaymentItemDto(
                p.Id,
                p.PaymentPeriod,
                p.Amount,
                p.Status,
                p.ReleaseDate,
                p.PaymentMethod,
                p.ReferenceNumber,
                p.Processor?.Name
            ))
            .ToList();
        var released = rows.Where(p => p.Status == "Released").ToList();
        var last = released.OrderByDescending(p => p.ReleaseDate).FirstOrDefault();
        return new ScholarPaymentsDto(
            items,
            released.Sum(p => p.Amount),
            rows.Where(p => p.Status is "Pending" or "Processed").Sum(p => p.Amount),
            last?.Amount ?? 0,
            last?.ReleaseDate,
            rows.Count
        );
    }

    // Same payment history as a CSV download.
    public async Task<byte[]> PaymentsCsvAsync(int scholarId)
    {
        var (columns, rows) = await PaymentRowsAsync(scholarId);
        return Csv.Write(columns, rows);
    }

    // Same payment history as an editable Word file.
    public async Task<byte[]> PaymentsDocxAsync(int scholarId)
    {
        var s = await ScholarAsync(scholarId);
        var (columns, rows) = await PaymentRowsAsync(scholarId);
        return Docx.Table("Payment History", columns, rows, $"{s.FullName} ({s.ScholarNumber})");
    }

    private async Task<(string[] Columns, List<IReadOnlyList<string?>> Rows)> PaymentRowsAsync(
        int scholarId
    )
    {
        var p = await PaymentsAsync(scholarId);
        return (
            [
                "ID",
                "Period",
                "Amount",
                "Status",
                "Release Date",
                "Payment Method",
                "Reference Number",
                "Processed By",
            ],
            p.Items.Select(i =>
                    (IReadOnlyList<string?>)
                        [
                            i.Id.ToString(),
                            i.Period,
                            i.Amount.ToString("F2", CultureInfo.InvariantCulture),
                            i.Status,
                            i.ReleaseDate?.ToString("yyyy-MM-dd"),
                            i.PaymentMethod,
                            i.ReferenceNumber,
                            i.ProcessedBy,
                        ]
                )
                .ToList()
        );
    }
}
