using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using IskolarAid.Data.Entities;

namespace IskolarAid.Api.Realtime;

/// <summary>Group names used by the hub and the notifier.</summary>
public static class HubGroups
{
    public const string Admins = "admins";
    public static string Scholar(int scholarId) => $"scholar-{scholarId}";
}

/// <summary>
/// The one real-time endpoint (/hubs/notifications). Clients only LISTEN; the server raises these client events:
/// <list type="bullet">
/// <item>Scholars: NotificationReceived, PaymentsChanged, ComplianceChanged</item>
/// <item>Admins: RegistrationSubmitted, RegistrationReviewed, NotificationsChanged, PaymentsChanged, ComplianceChanged</item>
/// </list>
/// Group membership comes from the signed-in user's token, never from the client, so a scholar can only hear their own events.
/// A reconnect is a new connection, so OnConnectedAsync runs again and puts it back in its group automatically.
/// </summary>
[Authorize]
public class NotificationHub(ILogger<NotificationHub> logger) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var user = Context.User;
        var role = user?.FindFirst("role")?.Value;
        if (role == Roles.Admin)
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Admins);
        else if (role == Roles.Scholar && int.TryParse(user?.FindFirst("scholar_id")?.Value, out var scholarId))
            await Groups.AddToGroupAsync(Context.ConnectionId, HubGroups.Scholar(scholarId));

        logger.LogInformation("Hub connected: {Id} ({Role} {Name})", Context.ConnectionId, role, user?.FindFirst("name")?.Value);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // SignalR removes the connection from all of its groups by itself.
        logger.LogInformation("Hub disconnected: {Id}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
