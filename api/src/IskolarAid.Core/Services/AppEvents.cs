// =====================================================================
// AppEvents.cs - the app's "something happened" announcements.
//
// Flow:  Service saves a change -> calls events.RaiseXxx(...)
// -> every subscriber is told (today: RealtimeNotifier in the API,
// which pushes a live update to browsers).
// The services do not need to know who is listening.
// =====================================================================
namespace IskolarAid.Core.Services;

// ---- Event arguments: small payloads (ids and what changed), never whole entities. ----

/// <summary>One or more scholars received a new notification.</summary>
public sealed class NotificationsSentEventArgs(IReadOnlyCollection<int> scholarIds, string title, string type) : EventArgs
{
    public IReadOnlyCollection<int> ScholarIds { get; } = scholarIds;
    public string Title { get; } = title;
    public string Type { get; } = type;
}

/// <summary>A registration was submitted (Status = "Pending") or reviewed ("Approved" / "Rejected").</summary>
public sealed class RegistrationEventArgs(int registrationId, string applicantName, string status) : EventArgs
{
    public int RegistrationId { get; } = registrationId;
    public string ApplicantName { get; } = applicantName;
    public string Status { get; } = status;
}

/// <summary>Payments of these scholars changed status ("Processed" or "Released").</summary>
public sealed class PaymentsChangedEventArgs(IReadOnlyCollection<int> scholarIds, string status) : EventArgs
{
    public IReadOnlyCollection<int> ScholarIds { get; } = scholarIds;
    public string Status { get; } = status;
}

/// <summary>A scholar's compliance requirements changed. <see cref="ByScholar"/> is true when the scholar uploaded the document.</summary>
public sealed class ComplianceChangedEventArgs(int scholarId, string requirement, string status, bool byScholar) : EventArgs
{
    public int ScholarId { get; } = scholarId;
    public string Requirement { get; } = requirement;
    public string Status { get; } = status;
    public bool ByScholar { get; } = byScholar;
}

/// <summary>
/// The application's C# events, one shared instance (singleton). Services raise an event AFTER their changes are saved;
/// subscribers (for example the SignalR RealtimeNotifier in the API) react without the services knowing about them.
/// A failing subscriber is reported to <see cref="SubscriberFailed"/> and never breaks the request that raised the event.
/// </summary>
public class AppEvents
{
    public event EventHandler<NotificationsSentEventArgs>? NotificationsSent;
    public event EventHandler<RegistrationEventArgs>? RegistrationSubmitted;
    public event EventHandler<RegistrationEventArgs>? RegistrationReviewed;
    public event EventHandler<PaymentsChangedEventArgs>? PaymentsChanged;
    public event EventHandler<ComplianceChangedEventArgs>? ComplianceChanged;

    /// <summary>Called when a subscriber throws (the API logs it).</summary>
    public Action<string, Exception>? SubscriberFailed { get; set; }

    public void RaiseNotificationsSent(IReadOnlyCollection<int> scholarIds, string title, string type)
    { if (scholarIds.Count > 0) Raise(NotificationsSent, nameof(NotificationsSent), new NotificationsSentEventArgs(scholarIds, title, type)); }

    public void RaiseRegistrationSubmitted(int id, string name) =>
        Raise(RegistrationSubmitted, nameof(RegistrationSubmitted), new RegistrationEventArgs(id, name, "Pending"));

    public void RaiseRegistrationReviewed(int id, string name, string status) =>
        Raise(RegistrationReviewed, nameof(RegistrationReviewed), new RegistrationEventArgs(id, name, status));

    public void RaisePaymentsChanged(IReadOnlyCollection<int> scholarIds, string status)
    { if (scholarIds.Count > 0) Raise(PaymentsChanged, nameof(PaymentsChanged), new PaymentsChangedEventArgs(scholarIds, status)); }

    public void RaiseComplianceChanged(int scholarId, string requirement, string status, bool byScholar) =>
        Raise(ComplianceChanged, nameof(ComplianceChanged), new ComplianceChangedEventArgs(scholarId, requirement, status, byScholar));

    // Call each subscriber one by one. If one crashes we report it and keep going,
    // so the user's request still succeeds.
    private void Raise<T>(EventHandler<T>? handlers, string name, T args)
    {
        if (handlers is null) return;
        foreach (var h in handlers.GetInvocationList().Cast<EventHandler<T>>())
        {
            try { h(this, args); }
            catch (Exception ex) { SubscriberFailed?.Invoke(name, ex); }
        }
    }
}
