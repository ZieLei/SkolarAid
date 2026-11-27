// =====================================================================
// Support.cs - services used by many other services:
// ActivityLogService -> writes the "who did what" audit trail
// PasswordService    -> hashes and checks passwords
// AuthService        -> login / logout logic
// =====================================================================
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Common;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

// Writes one row into the activity_logs table. Used after almost every change
// (create, update, delete, login...). The Admin > Activity logs page shows these rows.
public class ActivityLogService(IskolarDbContext db, ICurrentUser current)
{
    public async Task LogAsync(string action, string? details, string? table = null, int? recordId = null,
        int? userId = null, string? userName = null)
    {
        Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry<ActivityLog>? entry = null;
        try
        {
            entry = db.ActivityLogs.Add(new ActivityLog
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
            // Detach the failed row so it cannot poison the next SaveChanges on this context.
            if (entry is not null) entry.State = EntityState.Detached;
        }
    }

    // Short cuts for the three most common actions.
    public Task LogCreate(string table, int id, string details) => LogAsync("CREATE", details, table, id);
    public Task LogUpdate(string table, int id, string details) => LogAsync("UPDATE", details, table, id);
    public Task LogDelete(string table, int id, string details) => LogAsync("DELETE", details, table, id);
}

// Passwords are never stored as plain text. We store a one-way "hash" (ASP.NET Identity format).
// The old desktop app stored plain text, so those are still accepted once and then upgraded.
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

// Login steps:
// 1. Find the user by username (for scholars this is their Student ID).
// 2. Check the password.
// 3. Check the account is Active (and, for scholars, that the scholar profile is Active).
// 4. Upgrade an old plain-text password to a hash if needed.
// 5. Save the last login time and write a LOGIN activity log.
// The controller then makes the JWT token from the returned user.
// Sign-up (for scholars the admin already added) is SignUpAsync below.
public class AuthService(IskolarDbContext db, PasswordService passwords, ActivityLogService log)
{
    // [ENTRY] AuthController.Login (POST /api/auth/login). [VALIDATION] unknown user / wrong password -> 401,
    // not activated yet -> 401, inactive account or scholar -> 403. [DB] updates LastLogin. [SIDE-EFFECT] LOGIN activity log.
    public async Task<UserInfoDtoInternal> LoginAsync(string username, string password)
    {
        username = username.Trim();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        // Same message for unknown user and wrong password (no user enumeration).
        var fail = new AppException("Invalid Student ID or Password.", 401);
        if (user is null) throw fail;
        if (user.AccountStatus == AccountStatuses.Pending)
            // [VALIDATION] rejects with 401 Unauthorized: "You have not activated your account yet. Choose \ …"
            throw new AppException("You have not activated your account yet. Choose \"Sign up\" and enter your Scholar ID to set your password.", 401);

        var (ok, rehash) = passwords.Verify(user.Password, password);
        if (!ok) throw fail;
        if (user.AccountStatus != "Active")
            // [VALIDATION] access check, otherwise 403 Forbidden
            throw AppException.Forbidden("Your account is inactive or locked. Please contact the administrator.");

        Scholar? scholar = null;
        if (user.Role == Roles.Scholar)
        {
            scholar = await db.Scholars.FirstOrDefaultAsync(s => s.UserId == user.Id);
            if (scholar is null || scholar.Status != "Active")
                // [VALIDATION] access check, otherwise 403 Forbidden
                throw AppException.Forbidden("Scholar profile not found or inactive.");
        }

        if (rehash) user.Password = passwords.Hash(password);
        user.LastLogin = DateTime.Now;
        await db.SaveChangesAsync();
        await log.LogAsync("LOGIN", $"{user.Name} logged into the system", "users", user.Id, user.Id, user.Name);
        return new UserInfoDtoInternal(user, scholar);
    }

    // Sign-up for a scholar the Scholarship Office already added. Steps:
    // 1. Find the scholar by Scholar ID (e.g. SCH-2026-001).
    // 2. The Student ID or email they typed must match that scholar.
    // 3. The scholar must be Active and must not have a working account yet.
    // 4. Save their chosen password and switch the account to Active.
    // The controller then logs them in straight away (returns a token).
    // [ENTRY] AuthController.SignUp (POST /api/auth/signup).
    public async Task<UserInfoDtoInternal> SignUpAsync(string scholarNumber, string studentIdOrEmail, string password)
    {
        var number = scholarNumber.Trim().ToUpperInvariant();
        var id = studentIdOrEmail.Trim();
        var idLower = id.ToLowerInvariant();
        // One message for "no such Scholar ID" and "ID and email do not match", so nobody can guess IDs.
        var notFound = new AppException("We could not find a scholar with that Scholar ID and Student ID or email. Check both, or contact the Scholarship Office.", 404);

        var scholar = await db.Scholars.Include(s => s.User).FirstOrDefaultAsync(s => s.ScholarNumber == number) ?? throw notFound;
        var matches = (scholar.StudentId != null && scholar.StudentId == id) || (scholar.Email != null && scholar.Email.ToLower() == idLower);
        if (!matches) throw notFound;
        if (scholar.Status != "Active")
            // [VALIDATION] access check, otherwise 403 Forbidden
            throw AppException.Forbidden("Your scholarship is not active, so you cannot sign up. Please contact the Scholarship Office.");
        if (scholar.User is { AccountStatus: not AccountStatuses.Pending })
            // [VALIDATION] duplicate / wrong-state check, otherwise 409 Conflict
            throw AppException.Conflict("This scholar already has an account. Please log in with your Student ID instead.");
        // [VALIDATION] new password must pass ScholarRules.PasswordProblem (8+ characters, a letter and a number) -> 400 with the reason.
        if (ScholarRules.PasswordProblem(password) is { } problem) throw new AppException(problem);

        var user = scholar.User;
        if (user is null)
        {
            // Older scholars (from the desktop app) may have no login row at all: make one.
            var username = scholar.StudentId ?? scholar.ScholarNumber;
            if (await db.Users.AnyAsync(u => u.Username == username))
                // [VALIDATION] duplicate / wrong-state check, otherwise 409 Conflict
                throw AppException.Conflict("An account with this Student ID already exists. Please contact the Scholarship Office.");
            user = new User { Username = username, Role = Roles.Scholar, Name = scholar.FullName };
            scholar.User = user;
        }
        user.Password = passwords.Hash(password);
        user.AccountStatus = AccountStatuses.Active;
        user.LastLogin = DateTime.Now;
        await db.SaveChangesAsync();
        await log.LogAsync("SIGNUP", $"{scholar.FullName} signed up ({scholar.ScholarNumber})", "users", user.Id, user.Id, user.Name);
        return new UserInfoDtoInternal(user, scholar);
    }

    public Task LogoutAsync(int userId, string name) => log.LogAsync("LOGOUT", $"{name} logged out", "users", userId, userId, name);
}

// What LoginAsync returns: the user row and, for scholars, their scholar row.
public record UserInfoDtoInternal(User User, Scholar? Scholar);
