// =====================================================================
// RealtimeNotifier.cs - listens to AppEvents (C# events raised by the
// services) and forwards each one to the right browsers via SignalR.
// Which event goes to whom:
// NotificationsSent     -> the scholars who got it + all admins
// RegistrationSubmitted -> admins
// RegistrationReviewed  -> admins
// PaymentsChanged       -> admins + the scholars whose payments changed
// ComplianceChanged     -> admins + that one scholar
// =====================================================================
using Microsoft.AspNetCore.SignalR;
using IskolarAid.Core.Services;

namespace IskolarAid.Api.Realtime;

/// <summary>
/// Subscriber that turns the app's C# events into SignalR events (C# event → IHubContext → browsers).
/// Created once at startup. Payloads stay small (ids and what changed); pages fetch the details over HTTP,
/// which remains the source of truth.
/// </summary>
public sealed class RealtimeNotifier
{
    private readonly IHubContext<NotificationHub> _hub;
    private readonly ILogger<RealtimeNotifier> _log;

    // Subscribe to every event once, when the app starts (Program.cs creates this object).
    public RealtimeNotifier(AppEvents events, IHubContext<NotificationHub> hub, ILogger<RealtimeNotifier> log)
    {
        _hub = hub;
        _log = log;
        events.NotificationsSent += OnNotificationsSent;
        events.RegistrationSubmitted += OnRegistrationSubmitted;
        events.RegistrationReviewed += OnRegistrationReviewed;
        events.PaymentsChanged += OnPaymentsChanged;
        events.ComplianceChanged += OnComplianceChanged;
    }

    private void OnNotificationsSent(object? sender, NotificationsSentEventArgs e)
    {
        Send("NotificationReceived", _hub.Clients.Groups(ScholarGroups(e.ScholarIds)).SendAsync("NotificationReceived", new { e.Title, e.Type }));
        Send("NotificationsChanged", _hub.Clients.Group(HubGroups.Admins).SendAsync("NotificationsChanged", new { Count = e.ScholarIds.Count }));
    }

    private void OnRegistrationSubmitted(object? sender, RegistrationEventArgs e) =>
        Send("RegistrationSubmitted", _hub.Clients.Group(HubGroups.Admins).SendAsync("RegistrationSubmitted", new { Id = e.RegistrationId, Name = e.ApplicantName }));

    private void OnRegistrationReviewed(object? sender, RegistrationEventArgs e) =>
        Send("RegistrationReviewed", _hub.Clients.Group(HubGroups.Admins).SendAsync("RegistrationReviewed", new { Id = e.RegistrationId, Name = e.ApplicantName, e.Status }));

    private void OnPaymentsChanged(object? sender, PaymentsChangedEventArgs e)
    {
        Send("PaymentsChanged", _hub.Clients.Group(HubGroups.Admins).SendAsync("PaymentsChanged", new { e.Status, Count = e.ScholarIds.Count }));
        Send("PaymentsChanged", _hub.Clients.Groups(ScholarGroups(e.ScholarIds)).SendAsync("PaymentsChanged", new { e.Status, Count = 1 }));
    }

    private void OnComplianceChanged(object? sender, ComplianceChangedEventArgs e)
    {
        var payload = new { e.ScholarId, e.Requirement, e.Status, e.ByScholar };
        Send("ComplianceChanged", _hub.Clients.Groups(HubGroups.Admins, HubGroups.Scholar(e.ScholarId)).SendAsync("ComplianceChanged", payload));
    }

    // Turn scholar ids into SignalR group names, without duplicates.
    private static List<string> ScholarGroups(IEnumerable<int> ids) => ids.Distinct().Select(HubGroups.Scholar).ToList();

    /// <summary>Fire and forget: the HTTP request that raised the event does not wait for browsers, but failures are logged.</summary>
    private void Send(string name, Task sending) =>
        sending.ContinueWith(t => _log.LogWarning(t.Exception, "Could not push {Event} to clients", name), TaskContinuationOptions.OnlyOnFaulted);
}
