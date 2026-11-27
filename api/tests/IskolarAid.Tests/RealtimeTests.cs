using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Services;

namespace IskolarAid.Tests;

/// <summary>The C# events the services raise (Arrange–Act–Assert: record every event, act, check what was recorded).</summary>
public class AppEventsTests
{
    [Fact]
    public void A_failing_subscriber_does_not_stop_the_others_or_the_caller()
    {
        var events = new AppEvents();
        var failures = new List<string>();
        var received = 0;
        events.SubscriberFailed = (name, _) => failures.Add(name);
        events.NotificationsSent += (_, _) => throw new InvalidOperationException("boom");
        events.NotificationsSent += (_, _) => received++;

        events.RaiseNotificationsSent([1], "Reminder", "General");

        Assert.Equal(1, received);
        Assert.Equal(["NotificationsSent"], failures);
    }

    [Fact]
    public async Task Payroll_raises_payment_and_notification_events_only_for_processed_scholars()
    {
        using var f = new Fixture();
        var payments = new List<PaymentsChangedEventArgs>();
        var notes = new List<NotificationsSentEventArgs>();
        f.Events.PaymentsChanged += (_, e) => payments.Add(e);
        f.Events.NotificationsSent += (_, e) => notes.Add(e);
        var t = await f.AddTypeAsync();
        var ok = await f.AddScholarAsync(t.Id, "Approved");
        var no = await f.AddScholarAsync(t.Id, "Pending", number: "SCH-2026-002");

        await f.Payroll.ProcessAsync(new PayrollRequestDto { PeriodStart = new DateTime(2026, 3, 1), PeriodEnd = new DateTime(2026, 3, 31), Method = "Cash", ScholarIds = [ok.Id, no.Id] });

        var p = Assert.Single(payments);
        Assert.Equal("Processed", p.Status);
        Assert.Equal([ok.Id], p.ScholarIds);
        Assert.Equal([ok.Id], Assert.Single(notes).ScholarIds);
    }

    [Fact]
    public async Task Nothing_is_raised_when_no_scholar_was_processed()
    {
        using var f = new Fixture();
        var raised = 0;
        f.Events.PaymentsChanged += (_, _) => raised++;
        f.Events.NotificationsSent += (_, _) => raised++;
        var no = await f.AddScholarAsync((await f.AddTypeAsync()).Id, "Pending");

        await f.Payroll.ProcessAsync(new PayrollRequestDto { PeriodStart = new DateTime(2026, 3, 1), PeriodEnd = new DateTime(2026, 3, 31), Method = "Cash", ScholarIds = [no.Id] });

        Assert.Equal(0, raised);
    }

    [Fact]
    public async Task Scholar_upload_raises_compliance_changed_marked_as_by_scholar()
    {
        using var f = new Fixture();
        var got = new List<ComplianceChangedEventArgs>();
        f.Events.ComplianceChanged += (_, e) => got.Add(e);
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id, "Pending");
        var rec = await f.Db.ComplianceRecords.FirstAsync(c => c.ScholarId == s.Id);

        await f.Compliance.UploadForSelfAsync(s.Id, rec.Id, "coe.pdf", [1, 2, 3]);

        var e = Assert.Single(got);
        Assert.Equal((s.Id, rec.RequirementType, "Submitted", true), (e.ScholarId, e.Requirement, e.Status, e.ByScholar));
    }
}

/// <summary>The SignalR hub over the in-memory test server: authentication, groups, and pushed events.</summary>
public class HubTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    // Activates an admin-created scholar (they choose a password) and returns their token.
    private async Task<string> SignUpAsync(ScholarCreatedDto s)
    {
        var res = await factory.CreateClient().PostAsJsonAsync("/api/auth/signup", new SignUpRequest(s.ScholarNumber, s.Email, "Scholar2026"));
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<LoginResponse>())!.Token;
    }

    private async Task<string> TokenAsync(string user, string pass)
    {
        var res = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(user, pass));
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<LoginResponse>())!.Token;
    }

    private HubConnection Connect(string token) => new HubConnectionBuilder()
        .WithUrl(new Uri(factory.Server.BaseAddress, "hubs/notifications"), o =>
        {
            o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            o.Transports = HttpTransportType.LongPolling; // the test server has no real sockets
            o.AccessTokenProvider = () => Task.FromResult<string?>(token);
        })
        .Build();

    [Fact]
    public async Task Negotiate_requires_a_token()
    {
        var res = await factory.CreateClient().PostAsync("/hubs/notifications/negotiate?negotiateVersion=1", null);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task A_reminder_reaches_only_that_scholar_and_the_admins()
    {
        var adminToken = await TokenAsync("admin", "Adm1n!Pass");
        var admin = factory.CreateClient();
        admin.DefaultRequestHeaders.Authorization = new("Bearer", adminToken);
        var type = await (await admin.PostAsJsonAsync("/api/admin/scholarship-types",
            new ScholarshipTypeSaveDto { Name = "Hub Grant", StipendAmount = 3000, PaymentFrequency = "Monthly" })).Content.ReadFromJsonAsync<ScholarshipTypeDto>();
        async Task<ScholarCreatedDto> AddScholar(string first) => (await (await admin.PostAsJsonAsync("/api/admin/scholars", new ScholarSaveDto
        {
            FirstName = first, LastName = "Hub", Email = $"{first}@x.ph", Course = "Bachelor of Science in Criminology",
            YearLevel = "1st Year", ScholarshipTypeId = type!.Id, StipendAmount = 3000
        })).Content.ReadFromJsonAsync<ScholarCreatedDto>())!;
        var target = await AddScholar("Rina");
        var other = await AddScholar("Leo");

        await using var adminHub = Connect(adminToken);
        await using var targetHub = Connect(await SignUpAsync(target));
        await using var otherHub = Connect(await SignUpAsync(other));
        var adminGot = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var targetGot = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var otherGot = 0;
        adminHub.On<CountPayload>("NotificationsChanged", p => adminGot.TrySetResult(p.Count));
        targetHub.On<NotificationPayload>("NotificationReceived", p => targetGot.TrySetResult(p.Title));
        otherHub.On<NotificationPayload>("NotificationReceived", _ => Interlocked.Increment(ref otherGot));
        await Task.WhenAll(adminHub.StartAsync(), targetHub.StartAsync(), otherHub.StartAsync());

        var remind = await admin.PostAsync($"/api/admin/scholars/{target.Id}/compliance/remind", null);
        Assert.Equal(HttpStatusCode.NoContent, remind.StatusCode);

        Assert.Equal("Compliance Reminder - IskolarAid", await targetGot.Task.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.Equal(1, await adminGot.Task.WaitAsync(TimeSpan.FromSeconds(10)));
        await Task.Delay(300);
        Assert.Equal(0, otherGot);
    }

    private sealed record NotificationPayload(string Title, string Type);
    private sealed record CountPayload(int Count);
}
