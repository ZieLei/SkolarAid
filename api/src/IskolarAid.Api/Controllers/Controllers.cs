// =====================================================================
// Controllers.cs - every HTTP endpoint of the API lives here.
//
// A controller is the "front desk": it receives the request from the
// browser, reads the URL / body, and hands the real work to a service
// in IskolarAid.Core/Services. Controllers hold almost no logic.
//
// Access rules:
// [AllowAnonymous]               -> anyone (login, sign-up)
// [Authorize(Policy = "Admin")]  -> only admin accounts
// [Authorize(Policy = "Scholar")]-> only scholar accounts
//
// TRACE: where input is checked, in order of a request's journey:
//   1. [Authorize] / policy on the controller  -> not logged in = 401, wrong role = 403
//   2. [ApiController] + the DTO attributes (Dtos.cs: [Required], [StringLength], [EmailAddress]...)
//      -> a bad body is rejected with 400 BEFORE the controller method runs (the "Add Scholar" field checks are here)
//   3. The service (IskolarAid.Core/Services/*) -> database-dependent checks; search "VALIDATION" to list them all
//   4. Rules (IskolarAid.Core/Rules/Rules.cs)  -> the pure business rules the service calls
// Tags used in comments: [ENTRY] endpoint, [VALIDATION] input check, [RULE] business rule, [DB] database, [SIDE-EFFECT] email/log/real-time.
//
// Errors: services throw AppException; ApiExceptionHandler
// (Infrastructure/Infrastructure.cs) turns it into a JSON error reply.
// =====================================================================
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using IskolarAid.Api.Infrastructure;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Services;

namespace IskolarAid.Api.Controllers;

// Small helper: turns an uploaded file into (file name, bytes).
// Throws a friendly error if no file was picked.
internal static class Files
{
    public static async Task<(string Name, byte[] Data)> ReadAsync(IFormFile? file)
    {
        // [VALIDATION] rejects with 400: "Please choose a file to upload."
        if (file is null || file.Length == 0) throw new AppException("Please choose a file to upload.");
        await using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return (file.FileName, ms.ToArray());
    }
}

// ---------------------------------------------------------------------
// /api/auth - log in, log out, "who am I?"
// ---------------------------------------------------------------------
[ApiController, Route("api/auth")]
public class AuthController(AuthService auth, JwtTokenService tokens, ICurrentUser current) : ControllerBase
{
    // POST /api/auth/login
    // 1. AuthService checks the username + password.
    // 2. JwtTokenService makes a signed token.
    // 3. The browser stores the token and sends it with every later request.
    // [VALIDATION] LoginRequest fields are required (Dtos.cs); rate limit 10 per minute per IP ("login" policy in Program.cs).
    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("login")]
    public async Task<LoginResponse> Login(LoginRequest req)
    {
        var r = await auth.LoginAsync(req.Username, req.Password);
        var (token, expires) = tokens.Create(r.User, r.Scholar);
        return new LoginResponse(token, expires, new UserInfoDto(r.User.Id, r.User.Username, r.User.Role, r.User.Name, r.Scholar?.Id, r.Scholar?.ScholarNumber));
    }

    // POST /api/auth/signup - a scholar the admin already added activates their account:
    // Scholar ID + Student ID or email + new password (AuthService.SignUpAsync).
    // On success they are logged in straight away, exactly like /login.
    [HttpPost("signup"), AllowAnonymous, EnableRateLimiting("register")]
    public async Task<LoginResponse> SignUp(SignUpRequest req)
    {
        var r = await auth.SignUpAsync(req.ScholarNumber, req.StudentIdOrEmail, req.Password);
        var (token, expires) = tokens.Create(r.User, r.Scholar);
        return new LoginResponse(token, expires, new UserInfoDto(r.User.Id, r.User.Username, r.User.Role, r.User.Name, r.Scholar?.Id, r.Scholar?.ScholarNumber));
    }

    // GET /api/auth/me - returns the logged-in user, read from the token.
    [HttpGet("me"), Authorize]
    public UserInfoDto Me() => new(current.UserId!.Value, User.FindFirst("username")?.Value ?? "", current.Role!, current.UserName!, current.ScholarId, null);

    // POST /api/auth/logout - only writes a "logged out" activity log entry.
    // (The browser throws away its token; JWTs cannot be cancelled server side.)
    [HttpPost("logout"), Authorize]
    public async Task<IActionResult> Logout() { await auth.LogoutAsync(current.UserId!.Value, current.UserName ?? ""); return NoContent(); }
}

// ---------------------------------------------------------------------
// Public endpoints (no login).
// (New scholars no longer apply here: the admin adds them and they sign up
// with POST /api/auth/signup.)
// ---------------------------------------------------------------------
[ApiController, Route("api")]
public class PublicController(ScholarshipTypeService types) : ControllerBase
{
    // GET /api/scholarship-types/active - list of active scholarship types.
    [HttpGet("scholarship-types/active")]
    public Task<List<ScholarshipTypeDto>> ActiveTypes() => types.ListAsync(activeOnly: true);
}


// ---------------------------------------------------------------------
// Admin dashboard: the numbers, lists and charts on the admin home page.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/dashboard"), Authorize(Policy = "Admin")]
public class DashboardController(DashboardService svc) : ControllerBase
{
    [HttpGet("stats")] public Task<DashboardStatsDto> Stats() => svc.StatsAsync();
    [HttpGet("recent-activity")] public Task<List<RecentActivityDto>> Recent() => svc.RecentActivityAsync();
    [HttpGet("upcoming-payments")] public Task<List<UpcomingPaymentDto>> Upcoming() => svc.UpcomingPaymentsAsync();
    [HttpGet("scholarship-distribution")] public Task<List<ChartPointDto>> Distribution() => svc.ByScholarshipAsync();
    [HttpGet("monthly-disbursement")] public Task<List<ChartPointDto>> Monthly() => svc.MonthlyDisbursementAsync();
}

// ---------------------------------------------------------------------
// Admin > Scholars: list, view, add, edit, activate / deactivate.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/scholars"), Authorize(Policy = "Admin")]
public class ScholarsController(ScholarService svc) : ControllerBase
{
    // GET /api/admin/scholars?search=&status=&page= - one page of the scholar table.
    // page is at least 1, pageSize is kept between 1 and 200.
    [HttpGet]
    public Task<PagedResult<ScholarListItemDto>> List(string? search, string? status, int? scholarshipTypeId, int page = 1, int pageSize = 50)
        => svc.ListAsync(search, status, scholarshipTypeId, Math.Max(page, 1), Math.Clamp(pageSize, 1, 200));

    // Drop-down choices for the filter bar (statuses, scholarship types).
    [HttpGet("filters")] public Task<ScholarFiltersDto> Filters() => svc.FiltersAsync();
    [HttpGet("{id:int}")] public Task<ScholarDetailDto> Get(int id) => svc.GetAsync(id);

    // [ENTRY] "Add Scholar" modal -> POST /api/admin/scholars. Returns 201 Created with the new id.
    // [VALIDATION] ScholarSaveDto's attributes (Dtos.cs) are checked automatically before this method runs
    // (FirstName, LastName, Email, Course, YearLevel required; lengths; email format). Then ScholarService.CreateAsync.
    [HttpPost]
    public async Task<ActionResult<ScholarCreatedDto>> Create(ScholarSaveDto dto)
    {
        var r = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(Get), new { id = r.Id }, r);
    }

    // [ENTRY] "Edit Scholar" modal -> PUT: same ScholarSaveDto checks, then ScholarService.UpdateAsync.
    // toggle-status switches Active <-> Inactive.
    [HttpPut("{id:int}")] public async Task<IActionResult> Update(int id, ScholarSaveDto dto) { await svc.UpdateAsync(id, dto); return NoContent(); }
    [HttpPost("{id:int}/toggle-status")] public async Task<object> Toggle(int id) => new { status = await svc.ToggleStatusAsync(id) };
}

// ---------------------------------------------------------------------
// Admin > Scholarship types: list, add, turn on / off.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/scholarship-types"), Authorize(Policy = "Admin")]
public class ScholarshipTypesController(ScholarshipTypeService svc) : ControllerBase
{
    [HttpGet] public Task<List<ScholarshipTypeDto>> List() => svc.ListAsync();
    [HttpPost] public Task<ScholarshipTypeDto> Create(ScholarshipTypeSaveDto dto) => svc.CreateAsync(dto);
    // PUT edits a type's name, stipend amount, frequency and fund source.
    [HttpPut("{id:int}")] public Task<ScholarshipTypeDto> Update(int id, ScholarshipTypeSaveDto dto) => svc.UpdateAsync(id, dto);
    [HttpPost("{id:int}/activate")] public async Task<IActionResult> Activate(int id) { await svc.SetActiveAsync(id, true); return NoContent(); }
    [HttpPost("{id:int}/deactivate")] public async Task<IActionResult> Deactivate(int id) { await svc.SetActiveAsync(id, false); return NoContent(); }
}

// ---------------------------------------------------------------------
// Admin > Compliance: the documents each scholar must hand in
// (requirements), their status, and the uploaded files.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin"), Authorize(Policy = "Admin")]
public class ComplianceController(ComplianceService svc) : ControllerBase
{
    // GET /api/admin/compliance?status=&search= - every scholar's requirements in one list ("show all").
    [HttpGet("compliance")] public Task<List<ComplianceOverviewItemDto>> All(string? status, string? search) => svc.ListAllAsync(status, search);
    [HttpGet("compliance/scholars")] public Task<List<ComplianceScholarOptionDto>> Scholars() => svc.ScholarOptionsAsync();
    [HttpGet("scholars/{scholarId:int}/compliance")] public Task<ComplianceScholarInfoDto> Get(int scholarId) => svc.GetForScholarAsync(scholarId);
    [HttpPost("scholars/{scholarId:int}/compliance")] public Task<ComplianceItemDto> Add(int scholarId, AddRequirementDto dto) => svc.AddRequirementAsync(scholarId, dto);
    [HttpPost("scholars/{scholarId:int}/compliance/remind")] public async Task<IActionResult> Remind(int scholarId) { await svc.RemindAsync(scholarId); return NoContent(); }
    [HttpPut("compliance/{id:int}/status")] public async Task<IActionResult> Status(int id, ComplianceStatusDto dto) { await svc.UpdateStatusAsync(id, dto.Status, dto.Remarks); return NoContent(); }
    [HttpPost("compliance/{id:int}/mark-missing")] public async Task<IActionResult> Missing(int id) { await svc.MarkMissingAsync(id); return NoContent(); }
    [HttpDelete("compliance/{id:int}")] public async Task<IActionResult> Delete(int id) { await svc.DeleteRequirementAsync(id); return NoContent(); }

    // Admin uploads a file for a requirement (max 15 MB).
    [HttpPost("compliance/{id:int}/file"), RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IActionResult> Upload(int id, IFormFile file)
    {
        var (name, data) = await Files.ReadAsync(file);
        await svc.UploadAsync(id, name, data);
        return NoContent();
    }

    // Download the file saved for a requirement.
    [HttpGet("compliance/{id:int}/file")]
    public async Task<IActionResult> Download(int id)
    {
        var f = await svc.DownloadAsync(id);
        return File(f.Data, f.ContentType, f.Name);
    }

    [HttpDelete("compliance/{id:int}/file")] public async Task<IActionResult> DeleteFile(int id) { await svc.DeleteFileAsync(id); return NoContent(); }
}

// ---------------------------------------------------------------------
// Admin > Payroll. The money flow has two steps:
// 1. "process": pick scholars for a period -> creates Processed payments.
// 2. "release": hand the money out -> payments become Released.
// "preview" shows step 1 without saving anything.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/payroll"), Authorize(Policy = "Admin")]
public class PayrollController(PayrollService svc) : ControllerBase
{
    // Scholars who can be paid for the period from..to (defaults to the current month).
    [HttpGet("candidates")]
    public Task<List<PayrollCandidateDto>> Candidates(DateTime? from, DateTime? to, int? scholarshipTypeId, string? yearLevel, string? search, string? method)
    {
        var (start, end) = Period(from, to);
        return svc.CandidatesAsync(start, end, scholarshipTypeId, yearLevel, search, method);
    }

    // [ENTRY] Payroll page: Preview / Process buttons. Checks: PayrollRequestDto (Dtos.cs) then PayrollService.
    [HttpPost("preview")] public Task<PayrollPreviewDto> Preview(PayrollRequestDto dto) => svc.PreviewAsync(dto);
    [HttpPost("process")] public Task<PayrollResultDto> Process(PayrollRequestDto dto) => svc.ProcessAsync(dto);
    [HttpGet("ready-for-release")] public Task<List<ProcessedPaymentDto>> Ready() => svc.ReadyForReleaseAsync();

    // Move the expected release date of a payment that is still "Processed" (the scholar is notified).
    [HttpPost("payments/{id:int}/reschedule")]
    public Task<ProcessedPaymentDto> Reschedule(int id, RescheduleRequestDto dto) => svc.RescheduleAsync(id, dto.ReleaseDate);
    [HttpPost("release")] public Task<ReleaseResultDto> Release([FromBody] ReleaseRequest? req) => svc.ReleaseAsync(req?.PaymentIds);
    [HttpGet("history")]
    public Task<List<DisbursementHistoryDto>> History(DateTime? from, DateTime? to)
    {
        var (start, end) = Period(from, to);
        return svc.HistoryAsync(start, end);
    }
    [HttpGet("stats")] public Task<PayrollStatsDto> Stats() => svc.StatsAsync();

    // Missing dates default to the current month.
    private static (DateTime Start, DateTime End) Period(DateTime? from, DateTime? to)
    {
        var month = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        var start = (from ?? month).Date;
        var end = (to ?? (from is null ? month.AddMonths(1).AddDays(-1) : start)).Date;
        return end < start ? (end, start) : (start, end);
    }
}

// Body of POST /release. No ids = release every payment that is ready.
public record ReleaseRequest(List<int>? PaymentIds);

// ---------------------------------------------------------------------
// Admin > Reports & analytics: charts, report tables, CSV export, receipts.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/reports"), Authorize(Policy = "Admin")]
public class ReportsController(ReportService reports, DashboardService dashboard) : ControllerBase
{
    [HttpGet("types")] public string[] Types() => ReportService.ReportTypes;
    [HttpGet("analytics")] public Task<AnalyticsDto> Analytics() => dashboard.AnalyticsAsync();
    [HttpGet("by-course")] public Task<List<ChartPointDto>> ByCourse() => dashboard.ByCourseAsync();
    [HttpGet("generate")] public Task<ReportResultDto> Generate([FromQuery] ReportQuery q) => reports.GenerateAsync(q);

    // Same report as "generate", but downloaded as a CSV file.
    [HttpGet("csv")]
    public async Task<IActionResult> Csv([FromQuery] ReportQuery q)
        => File(await reports.CsvAsync(q), "text/csv", $"Report_{DateTime.Now:yyyyMMdd_HHmmss}.csv");

    // Same report as an editable Word file.
    [HttpGet("docx")]
    public async Task<IActionResult> Docx([FromQuery] ReportQuery q)
        => File(await reports.DocxAsync(q), DocxType, $"Report_{DateTime.Now:yyyyMMdd_HHmmss}.docx");

    // One receipt as an editable Word file.
    [HttpGet("receipts/{paymentId:int}/docx")]
    public async Task<IActionResult> ReceiptDocx(int paymentId)
        => File(await reports.ReceiptDocxAsync(paymentId), DocxType, $"Receipt_{paymentId}.docx");

    // A blank form (layout sent by the web app) as an editable Word file.
    [HttpPost("template-docx")]
    public IActionResult TemplateDocx(TemplateDocxRequest req)
        => File(Core.Services.Docx.Write(new Core.Services.Docx.Content
        {
            Title = req.Title, Lines = [$"{req.Note} Date: ____________________ Prepared by: ____________________".Trim()],
            Columns = req.Columns, BlankRows = req.BlankRows, Signatures = ["Prepared by", "Approved by"]
        }), DocxType, $"{string.Concat(req.Title.Where(char.IsLetterOrDigit))}.docx");

    internal const string DocxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    [HttpGet("released-payments")] public Task<List<ReleasedPaymentDto>> Released() => reports.ReleasedPaymentsAsync();
    [HttpGet("receipts/{paymentId:int}")] public Task<ReceiptDto> Receipt(int paymentId) => reports.ReceiptAsync(paymentId);
}

// ---------------------------------------------------------------------
// Admin > Activity logs: who did what and when. Default range is the last 30 days.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/activity-logs"), Authorize(Policy = "Admin")]
public class ActivityLogsController(ActivityLogQueryService svc) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<ActivityLogDto>> List(DateTime? from, DateTime? to, string? action, string? user, string? search, int page = 1)
        => svc.ListAsync(from ?? DateTime.Today.AddDays(-30), to ?? DateTime.Today, action, user, search, page);

    [HttpGet("stats")] public Task<ActivityStatsDto> Stats() => svc.StatsAsync();
    [HttpGet("filters")] public Task<ActivityFiltersDto> Filters() => svc.FiltersAsync();

    // Same rows as the CSV, as an editable Word file.
    [HttpGet("docx")]
    public async Task<IActionResult> Docx(DateTime? from, DateTime? to, string? action, string? user, string? search)
        => File(await svc.DocxAsync(from ?? DateTime.Today.AddDays(-30), to ?? DateTime.Today, action, user, search), ReportsController.DocxType, $"ActivityLogs_{DateTime.Now:yyyyMMdd_HHmmss}.docx");

    [HttpGet("csv")]
    public async Task<IActionResult> Csv(DateTime? from, DateTime? to, string? action, string? user, string? search)
        => File(await svc.CsvAsync(from ?? DateTime.Today.AddDays(-30), to ?? DateTime.Today, action, user, search), "text/csv", $"ActivityLogs_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
}

// ---------------------------------------------------------------------
// Admin > Notifications: read, send (compose), mark read, delete.
// ---------------------------------------------------------------------
[ApiController, Route("api/admin/notifications"), Authorize(Policy = "Admin")]
public class NotificationsController(NotificationService svc) : ControllerBase
{
    [HttpGet] public Task<List<NotificationDto>> List(string? type, bool unreadOnly, string? search, int? recipientId) => svc.ListAsync(type, unreadOnly, search, recipientId);
    [HttpGet("stats")] public Task<NotificationStatsDto> Stats() => svc.StatsAsync();
    [HttpGet("recipients")] public Task<List<OptionDto>> Recipients() => svc.RecipientsAsync();
    [HttpPost] public Task<ComposeResultDto> Compose(ComposeNotificationDto dto) => svc.ComposeAsync(dto);
    [HttpPost("{id:int}/read")] public async Task<IActionResult> Read(int id) { await svc.MarkReadAsync(id); return NoContent(); }
    [HttpPost("read-all")] public async Task<object> ReadAll() => new { updated = await svc.MarkAllReadAsync() };
    [HttpDelete("{id:int}")] public async Task<IActionResult> Delete(int id) { await svc.DeleteAsync(id); return NoContent(); }
    [HttpDelete("read")] public async Task<object> DeleteRead() => new { deleted = await svc.DeleteAllReadAsync() };
}

/// <summary>Scholar portal. Every call is scoped to the scholar in the JWT; no scholar id is ever accepted from the client.</summary>
// ---------------------------------------------------------------------
// Scholar portal: what a logged-in scholar sees about themself.
// ---------------------------------------------------------------------
[ApiController, Route("api/scholar"), Authorize(Policy = "Scholar")]
public class ScholarPortalController(ScholarPortalService portal, ComplianceService compliance, NotificationService notifications, ICurrentUser current) : ControllerBase
{
    // The scholar id taken from the login token. Every method below uses it,
    // so a scholar can only ever see their own data.
    // [VALIDATION] access check, otherwise 403 Forbidden
    private int Me => current.ScholarId ?? throw AppException.Forbidden("No scholar profile is linked to this account.");

    [HttpGet("dashboard")] public Task<ScholarDashboardDto> Dashboard() => portal.DashboardAsync(Me);
    [HttpGet("profile")] public Task<ScholarProfileDto> Profile() => portal.ProfileAsync(Me);
    [HttpPut("profile")] public Task<ScholarProfileDto> UpdateProfile(ScholarProfileUpdateDto dto) => portal.UpdateProfileAsync(Me, dto);
    [HttpGet("payments")] public Task<ScholarPaymentsDto> Payments() => portal.PaymentsAsync(Me);

    [HttpGet("payments/csv")]
    public async Task<IActionResult> PaymentsCsv() => File(await portal.PaymentsCsvAsync(Me), "text/csv", $"PaymentHistory_{DateTime.Now:yyyyMMdd}.csv");

    [HttpGet("payments/docx")]
    public async Task<IActionResult> PaymentsDocx() => File(await portal.PaymentsDocxAsync(Me), ReportsController.DocxType, $"PaymentHistory_{DateTime.Now:yyyyMMdd}.docx");

    [HttpGet("compliance")] public Task<ScholarComplianceDto> Compliance() => compliance.ListForSelfAsync(Me);

    [HttpPost("compliance/{id:int}/file"), RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IActionResult> Upload(int id, IFormFile file)
    {
        var (name, data) = await Files.ReadAsync(file);
        await compliance.UploadForSelfAsync(Me, id, name, data);
        return NoContent();
    }

    [HttpGet("compliance/{id:int}/file")]
    public async Task<IActionResult> Download(int id)
    {
        var f = await compliance.DownloadAsync(id, Me);
        return File(f.Data, f.ContentType, f.Name);
    }

    [HttpGet("notifications")] public Task<ScholarNotificationsDto> Notifications(string? type, bool unreadOnly) => notifications.ListForScholarAsync(Me, type, unreadOnly);
    [HttpPost("notifications/{id:int}/read")] public async Task<IActionResult> Read(int id) { await notifications.MarkReadForScholarAsync(Me, id); return NoContent(); }
    [HttpPost("notifications/read-all")] public async Task<object> ReadAll() => new { updated = await notifications.MarkAllReadForScholarAsync(Me) };
}

// ---------------------------------------------------------------------
// Profile pictures (ProfilePictureService).
// ---------------------------------------------------------------------
[ApiController, Route("api")]
public class ProfilePictureController(ProfilePictureService pictures, ICurrentUser current) : ControllerBase
{
    // [VALIDATION] access check, otherwise 403 Forbidden
    private int Me => current.UserId ?? throw AppException.Forbidden("Please log in again.");

    // GET /api/me/picture - your own picture (204 when you have none; the web app then shows an icon).
    [HttpGet("me/picture"), Authorize]
    public async Task<IActionResult> Mine() => Picture(await pictures.GetAsync(Me));

    // PUT /api/me/picture - upload or replace your picture (form field "file").
    // The request may be a little bigger than the 5 MB picture (form overhead); the service enforces the real 5 MB limit.
    [HttpPut("me/picture"), Authorize, RequestSizeLimit(6 * 1024 * 1024)]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        var (_, data) = await Files.ReadAsync(file);
        await pictures.SetAsync(Me, data);
        return NoContent();
    }

    // DELETE /api/me/picture - remove your picture.
    [HttpDelete("me/picture"), Authorize]
    public async Task<IActionResult> Remove() { await pictures.DeleteAsync(Me); return NoContent(); }

    // GET /api/admin/scholars/{id}/picture - admin sees a scholar's picture.
    [HttpGet("admin/scholars/{scholarId:int}/picture"), Authorize(Policy = "Admin")]
    public async Task<IActionResult> OfScholar(int scholarId) => Picture(await pictures.GetForScholarAsync(scholarId));

    // No picture -> 204 No Content (not 404), so browsers do not log an error for every avatar.
    private IActionResult Picture((byte[] Data, string ContentType)? p) => p is { } x ? File(x.Data, x.ContentType) : NoContent();
}
