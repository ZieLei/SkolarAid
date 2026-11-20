namespace SkolarAid.Core.Common;

/// <summary>Business-rule failure that maps to an HTTP status (400/403/404/409).</summary>
public class AppException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public static AppException NotFound(string what) => new($"{what} was not found.", 404);
    public static AppException Conflict(string msg) => new(msg, 409);
    public static AppException Forbidden(string msg) => new(msg, 403);
}

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public interface ICurrentUser
{
    int? UserId { get; }
    string? UserName { get; }
    string? Role { get; }
    int? ScholarId { get; }
    string? IpAddress { get; }
}
