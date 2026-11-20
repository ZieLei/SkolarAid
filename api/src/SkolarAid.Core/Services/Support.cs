using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SkolarAid.Core.Common;
using SkolarAid.Data;
using SkolarAid.Data.Entities;

namespace SkolarAid.Core.Services;

public class ActivityLogService(SkolarDbContext db, ICurrentUser current)
{
    public async Task LogAsync(string action, string? details, string? table = null, int? recordId = null,
        int? userId = null, string? userName = null)
    {
        try
        {
            db.ActivityLogs.Add(new ActivityLog
            {
                UserId = userId ?? current.UserId,
                UserName = userName ?? current.UserName ?? "System",
                ActionType = action,
                TableAffected = table,
                RecordId = recordId,
                Details = details,
                IpAddress = current.IpAddress
            });
            await db.SaveChangesAsync();
        }
        catch
        {
            // Logging must never break the request (same behaviour as the desktop app).
        }
    }

    public Task LogCreate(string table, int id, string details) => LogAsync("CREATE", details, table, id);
    public Task LogUpdate(string table, int id, string details) => LogAsync("UPDATE", details, table, id);
    public Task LogDelete(string table, int id, string details) => LogAsync("DELETE", details, table, id);
}

public class PasswordService
{
    private readonly PasswordHasher<User> _hasher = new();
    private static readonly User Dummy = new();

    /// <summary>Identity v3 hashes always start with "AQAAAA" (version byte 1, base64). Anything else is a legacy plaintext value.</summary>
    public static bool IsHash(string stored) => stored.StartsWith("AQAAAA", StringComparison.Ordinal);

    public string Hash(string password) => _hasher.HashPassword(Dummy, password);

    /// <summary>Returns (ok, needsRehash). Legacy plaintext passwords are accepted once and flagged for rehash.</summary>
    public (bool Ok, bool NeedsRehash) Verify(string stored, string provided)
    {
        if (string.IsNullOrEmpty(stored)) return (false, false);
        if (!IsHash(stored))
        {
            var a = Encoding.UTF8.GetBytes(stored);
            var b = Encoding.UTF8.GetBytes(provided);
            return (System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(a, b), true);
        }
        var r = _hasher.VerifyHashedPassword(Dummy, stored, provided);
        return (r != PasswordVerificationResult.Failed, r == PasswordVerificationResult.SuccessRehashNeeded);
    }
}

public class AuthService(SkolarDbContext db, PasswordService passwords, ActivityLogService log)
{
    public async Task<UserInfoDtoInternal> LoginAsync(string username, string password)
    {
        username = username.Trim();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        // Same message for unknown user and wrong password (no user enumeration).
        var fail = new AppException("Invalid Student ID or Password.", 401);
        if (user is null) throw fail;

        var (ok, rehash) = passwords.Verify(user.Password, password);
        if (!ok) throw fail;
        if (user.AccountStatus != "Active")
            throw AppException.Forbidden("Your account is inactive or locked. Please contact the administrator.");

        Scholar? scholar = null;
        if (user.Role == Roles.Scholar)
        {
            scholar = await db.Scholars.FirstOrDefaultAsync(s => s.UserId == user.Id);
            if (scholar is null || scholar.Status != "Active")
                throw AppException.Forbidden("Scholar profile not found or inactive.");
        }

        if (rehash) user.Password = passwords.Hash(password);
        user.LastLogin = DateTime.Now;
        await db.SaveChangesAsync();
        await log.LogAsync("LOGIN", $"{user.Name} logged into the system", "users", user.Id, user.Id, user.Name);
        return new UserInfoDtoInternal(user, scholar);
    }

    public Task LogoutAsync(int userId, string name) => log.LogAsync("LOGOUT", $"{name} logged out", "users", userId, userId, name);
}

public record UserInfoDtoInternal(User User, Scholar? Scholar);
