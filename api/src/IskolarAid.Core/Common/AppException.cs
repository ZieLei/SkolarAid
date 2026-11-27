// =====================================================================
// AppException.cs - shared building blocks used by every service.
// =====================================================================
namespace IskolarAid.Core.Common;

/// <summary>Business-rule failure that maps to an HTTP status (400/403/404/409).</summary>
// Throw this when the USER did something wrong (bad input, not found, no access).
// The message is shown to the user as-is, so keep it friendly.
// Example: throw AppException.NotFound("Scholar");  -> 404 "Scholar was not found."
public class AppException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public static AppException NotFound(string what) => new($"{what} was not found.", 404);
    public static AppException Conflict(string msg) => new(msg, 409);
    public static AppException Forbidden(string msg) => new(msg, 403);
}

// One page of a long list: the rows on this page + the total count (for the pager).
public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

// "Who is logged in right now?" - filled from the login token by HttpCurrentUser (API project).
// ScholarId is set only for scholar accounts.
public interface ICurrentUser
{
    int? UserId { get; }
    string? UserName { get; }
    string? Role { get; }
    int? ScholarId { get; }
    string? IpAddress { get; }
}
