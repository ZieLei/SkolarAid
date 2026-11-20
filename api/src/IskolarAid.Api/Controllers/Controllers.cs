using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using IskolarAid.Api.Infrastructure;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Services;

namespace IskolarAid.Api.Controllers;

internal static class Files
{
    public static async Task<(string Name, byte[] Data)> ReadAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0) throw new AppException("Please choose a file to upload.");
        await using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        return (file.FileName, ms.ToArray());
    }
}

[ApiController, Route("api/auth")]
public class AuthController(AuthService auth, JwtTokenService tokens, ICurrentUser current) : ControllerBase
{
    [HttpPost("login"), AllowAnonymous, EnableRateLimiting("login")]
    public async Task<LoginResponse> Login(LoginRequest req)
    {
        var r = await auth.LoginAsync(req.Username, req.Password);
        var (token, expires) = tokens.Create(r.User, r.Scholar);
        return new LoginResponse(token, expires, new UserInfoDto(r.User.Id, r.User.Username, r.User.Role, r.User.Name, r.Scholar?.Id, r.Scholar?.ScholarNumber));
    }

    [HttpGet("me"), Authorize]
    public UserInfoDto Me() => new(current.UserId!.Value, User.FindFirst("username")?.Value ?? "", current.Role!, current.UserName!, current.ScholarId, null);

    [HttpPost("logout"), Authorize]
    public async Task<IActionResult> Logout() { await auth.LogoutAsync(current.UserId!.Value, current.UserName ?? ""); return NoContent(); }
}

[ApiController, Route("api")]
public class PublicController(ScholarshipTypeService types, RegistrationService registrations) : ControllerBase
{
    [HttpGet("scholarship-types/active")]
    public Task<List<ScholarshipTypeDto>> ActiveTypes() => types.ListAsync(activeOnly: true);

    [HttpPost("registrations"), EnableRateLimiting("register"), RequestSizeLimit(60 * 1024 * 1024)]
    public async Task<IActionResult> Register([FromForm] RegistrationSubmitDto dto)
    {
        var files = Request.Form.Files;
        var map = new Dictionary<string, string> { ["psa"] = "PSA", ["coe"] = "COE", ["cor"] = "COR", ["grades"] = "Grades", ["contract"] = "Contract" };
        var uploads = new List<RegistrationFile>();
        foreach (var f in files)
            if (map.TryGetValue(f.Name.ToLowerInvariant(), out var key) && f.Length > 0)
                uploads.Add(new RegistrationFile { Key = key, FileName = f.FileName, Content = f.OpenReadStream() });
        var id = await registrations.SubmitAsync(dto, uploads);
        return Ok(new { id, message = "Registration submitted successfully! Your application will be reviewed by the Scholarship Office." });
    }
}

[ApiController, Route("api/admin/dashboard"), Authorize(Policy = "Admin")]
public class DashboardController(DashboardService svc) : ControllerBase
{
    [HttpGet("stats")] public Task<DashboardStatsDto> Stats() => svc.StatsAsync();
    [HttpGet("recent-activity")] public Task<List<RecentActivityDto>> Recent() => svc.RecentActivityAsync();
    [HttpGet("upcoming-payments")] public Task<List<UpcomingPaymentDto>> Upcoming() => svc.UpcomingPaymentsAsync();
    [HttpGet("scholarship-distribution")] public Task<List<ChartPointDto>> Distribution() => svc.ByScholarshipAsync();
    [HttpGet("monthly-disbursement")] public Task<List<ChartPointDto>> Monthly() => svc.MonthlyDisbursementAsync();
}

[ApiController, Route("api/admin/scholars"), Authorize(Policy = "Admin")]
public class ScholarsController(ScholarService svc) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<ScholarListItemDto>> List(string? search, string? status, int? scholarshipTypeId, int page = 1, int pageSize = 50)
        => svc.ListAsync(search, status, scholarshipTypeId, Math.Max(page, 1), Math.Clamp(pageSize, 1, 200));

    [HttpGet("filters")] public Task<ScholarFiltersDto> Filters() => svc.FiltersAsync();
    [HttpGet("{id:int}")] public Task<ScholarDetailDto> Get(int id) => svc.GetAsync(id);

    [HttpPost]
    public async Task<ActionResult<ScholarCreatedDto>> Create(ScholarSaveDto dto)
    {
        var r = await svc.CreateAsync(dto);
        return CreatedAtAction(nameof(Get), new { id = r.Id }, r);
    }

    [HttpPut("{id:int}")] public async Task<IActionResult> Update(int id, ScholarSaveDto dto) { await svc.UpdateAsync(id, dto); return NoContent(); }
    [HttpPost("{id:int}/toggle-status")] public async Task<object> Toggle(int id) => new { status = await svc.ToggleStatusAsync(id) };
}

[ApiController, Route("api/admin/scholarship-types"), Authorize(Policy = "Admin")]
public class ScholarshipTypesController(ScholarshipTypeService svc) : ControllerBase
{
    [HttpGet] public Task<List<ScholarshipTypeDto>> List() => svc.ListAsync();
    [HttpPost] public Task<ScholarshipTypeDto> Create(ScholarshipTypeSaveDto dto) => svc.CreateAsync(dto);
    [HttpPost("{id:int}/activate")] public async Task<IActionResult> Activate(int id) { await svc.SetActiveAsync(id, true); return NoContent(); }
    [HttpPost("{id:int}/deactivate")] public async Task<IActionResult> Deactivate(int id) { await svc.SetActiveAsync(id, false); return NoContent(); }
}

[ApiController, Route("api/admin"), Authorize(Policy = "Admin")]
public class ComplianceController(ComplianceService svc) : ControllerBase
{
    [HttpGet("compliance/scholars")] public Task<List<ComplianceScholarOptionDto>> Scholars() => svc.ScholarOptionsAsync();
    [HttpGet("scholars/{scholarId:int}/compliance")] public Task<ComplianceScholarInfoDto> Get(int scholarId) => svc.GetForScholarAsync(scholarId);
    [HttpPost("scholars/{scholarId:int}/compliance")] public Task<ComplianceItemDto> Add(int scholarId, AddRequirementDto dto) => svc.AddRequirementAsync(scholarId, dto);
    [HttpPost("scholars/{scholarId:int}/compliance/remind")] public async Task<IActionResult> Remind(int scholarId) { await svc.RemindAsync(scholarId); return NoContent(); }
    [HttpPut("compliance/{id:int}/status")] public async Task<IActionResult> Status(int id, ComplianceStatusDto dto) { await svc.UpdateStatusAsync(id, dto.Status, dto.Remarks); return NoContent(); }
    [HttpPost("compliance/{id:int}/mark-missing")] public async Task<IActionResult> Missing(int id) { await svc.MarkMissingAsync(id); return NoContent(); }
    [HttpDelete("compliance/{id:int}")] public async Task<IActionResult> Delete(int id) { await svc.DeleteRequirementAsync(id); return NoContent(); }

    [HttpPost("compliance/{id:int}/file"), RequestSizeLimit(15 * 1024 * 1024)]
    public async Task<IActionResult> Upload(int id, IFormFile file)
    {
        var (name, data) = await Files.ReadAsync(file);
        await svc.UploadAsync(id, name, data);
        return NoContent();
    }

    [HttpGet("compliance/{id:int}/file")]
    public async Task<IActionResult> Download(int id)
    {
        var f = await svc.DownloadAsync(id);
        return File(f.Data, f.ContentType, f.Name);
    }

    [HttpDelete("compliance/{id:int}/file")] public async Task<IActionResult> DeleteFile(int id) { await svc.DeleteFileAsync(id); return NoContent(); }
}

[ApiController, Route("api/admin/registrations"), Authorize(Policy = "Admin")]
public class RegistrationsController(RegistrationService svc) : ControllerBase
{
    [HttpGet] public Task<List<RegistrationListItemDto>> List() => svc.ListAsync();
    [HttpGet("{id:int}")] public Task<RegistrationDetailDto> Get(int id) => svc.GetAsync(id);

    [HttpGet("{id:int}/files/{key}")]
    public async Task<IActionResult> GetFile(int id, string key)
    {
        var f = await svc.GetFileAsync(id, key);
        return File(f.Data, f.ContentType, f.Name);
    }

    [HttpPost("{id:int}/approve")] public Task<RegistrationApprovedDto> Approve(int id) => svc.ApproveAsync(id);

    [HttpPost("{id:int}/reject")]
    public async Task<object> Reject(int id, RejectRegistrationDto dto) => new { emailSent = await svc.RejectAsync(id, dto.Reason, dto.SendEmail) };
}

[ApiController, Route("api/admin/payroll"), Authorize(Policy = "Admin")]
public class PayrollController(PayrollService svc) : ControllerBase
{
    [HttpGet("candidates")]
    public Task<List<PayrollCandidateDto>> Candidates(DateTime? period, int? scholarshipTypeId, string? yearLevel, string? search)
        => svc.CandidatesAsync(period ?? DateTime.Today, scholarshipTypeId, yearLevel, search);

    [HttpPost("preview")] public Task<PayrollPreviewDto> Preview(PayrollRequestDto dto) => svc.PreviewAsync(dto);
    [HttpPost("process")] public Task<PayrollResultDto> Process(PayrollRequestDto dto) => svc.ProcessAsync(dto);
    [HttpGet("ready-for-release")] public Task<List<ProcessedPaymentDto>> Ready() => svc.ReadyForReleaseAsync();
    [HttpPost("release")] public Task<ReleaseResultDto> Release([FromBody] ReleaseRequest? req) => svc.ReleaseAsync(req?.PaymentIds);
    [HttpGet("history")] public Task<List<DisbursementHistoryDto>> History(DateTime? period) => svc.HistoryAsync(period ?? DateTime.Today);
    [HttpGet("stats")] public Task<PayrollStatsDto> Stats() => svc.StatsAsync();
}

public record ReleaseRequest(List<int>? PaymentIds);

[ApiController, Route("api/admin/reports"), Authorize(Policy = "Admin")]
public class ReportsController(ReportService reports, DashboardService dashboard) : ControllerBase
{
    [HttpGet("types")] public string[] Types() => ReportService.ReportTypes;
    [HttpGet("analytics")] public Task<AnalyticsDto> Analytics() => dashboard.AnalyticsAsync();
    [HttpGet("by-course")] public Task<List<ChartPointDto>> ByCourse() => dashboard.ByCourseAsync();
    [HttpGet("generate")] public Task<ReportResultDto> Generate([FromQuery] ReportQuery q) => reports.GenerateAsync(q);

    [HttpGet("csv")]
    public async Task<IActionResult> Csv([FromQuery] ReportQuery q)
        => File(await reports.CsvAsync(q), "text/csv", $"Report_{DateTime.Now:yyyyMMdd_HHmmss}.csv");

    [HttpGet("released-payments")] public Task<List<ReleasedPaymentDto>> Released() => reports.ReleasedPaymentsAsync();
    [HttpGet("receipts/{paymentId:int}")] public Task<ReceiptDto> Receipt(int paymentId) => reports.ReceiptAsync(paymentId);
}

[ApiController, Route("api/admin/activity-logs"), Authorize(Policy = "Admin")]
public class ActivityLogsController(ActivityLogQueryService svc) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<ActivityLogDto>> List(DateTime? from, DateTime? to, string? action, string? user, string? search, int page = 1)
        => svc.ListAsync(from ?? DateTime.Today.AddDays(-30), to ?? DateTime.Today, action, user, search, page);

    [HttpGet("stats")] public Task<ActivityStatsDto> Stats() => svc.StatsAsync();
    [HttpGet("filters")] public Task<ActivityFiltersDto> Filters() => svc.FiltersAsync();

    [HttpGet("csv")]
    public async Task<IActionResult> Csv(DateTime? from, DateTime? to, string? action, string? user, string? search)
        => File(await svc.CsvAsync(from ?? DateTime.Today.AddDays(-30), to ?? DateTime.Today, action, user, search), "text/csv", $"ActivityLogs_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
}

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
[ApiController, Route("api/scholar"), Authorize(Policy = "Scholar")]
public class ScholarPortalController(ScholarPortalService portal, ComplianceService compliance, NotificationService notifications, ICurrentUser current) : ControllerBase
{
    private int Me => current.ScholarId ?? throw AppException.Forbidden("No scholar profile is linked to this account.");

    [HttpGet("dashboard")] public Task<ScholarDashboardDto> Dashboard() => portal.DashboardAsync(Me);
    [HttpGet("profile")] public Task<ScholarProfileDto> Profile() => portal.ProfileAsync(Me);
    [HttpPut("profile")] public Task<ScholarProfileDto> UpdateProfile(ScholarProfileUpdateDto dto) => portal.UpdateProfileAsync(Me, dto);
    [HttpGet("payments")] public Task<ScholarPaymentsDto> Payments() => portal.PaymentsAsync(Me);

    [HttpGet("payments/csv")]
    public async Task<IActionResult> PaymentsCsv() => File(await portal.PaymentsCsvAsync(Me), "text/csv", $"PaymentHistory_{DateTime.Now:yyyyMMdd}.csv");

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
