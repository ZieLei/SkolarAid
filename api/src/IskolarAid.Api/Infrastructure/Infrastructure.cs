// =====================================================================
// Infrastructure.cs - small "plumbing" classes the API needs:
// JwtOptions / JwtTokenService -> make the login token
// HttpCurrentUser              -> read who is logged in from the token
// ApiExceptionHandler          -> turn errors into JSON replies
// =====================================================================
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Services;
using IskolarAid.Data.Entities;

namespace IskolarAid.Api.Infrastructure;

// Settings for login tokens (filled from the "Jwt" section / Jwt__* env vars).
// ExpiryMinutes = 480 means a login lasts 8 hours.
public class JwtOptions
{
    public string Key { get; set; } = "";
    public string Issuer { get; set; } = "IskolarAid";
    public string Audience { get; set; } = "IskolarAid";
    public int ExpiryMinutes { get; set; } = 480;
}

// Creates the signed token returned by POST /api/auth/login.
public class JwtTokenService(Microsoft.Extensions.Options.IOptions<JwtOptions> options)
{
    public (string Token, DateTime Expires) Create(User user, Scholar? scholar)
    {
        var o = options.Value;
        var expires = DateTime.UtcNow.AddMinutes(o.ExpiryMinutes);
        // "Claims" are the facts written inside the token: user id (sub), name, role, username.
        // The server reads them back on every request (see HttpCurrentUser below).
        var claims = new List<Claim>
        {
            new("sub", user.Id.ToString()),
            new("name", user.Name),
            new("role", user.Role),
            new("username", user.Username)
        };
        // Scholar accounts also carry their scholar id, so the portal knows whose data to show.
        if (scholar is not null) claims.Add(new Claim("scholar_id", scholar.Id.ToString()));
        // Sign the token with our secret key so nobody can change it without us noticing.
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(o.Key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(o.Issuer, o.Audience, claims, DateTime.UtcNow, expires, creds);
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}

// Answers "who is calling?" for services, by reading the claims of the current request's token.
// Services use ICurrentUser (for example ActivityLogService writes the user's name into the log).
public class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? P => accessor.HttpContext?.User;
    public int? UserId => int.TryParse(P?.FindFirstValue("sub"), out var v) ? v : null;
    public string? UserName => P?.FindFirstValue("name");
    public string? Role => P?.FindFirstValue("role");
    public int? ScholarId => int.TryParse(P?.FindFirstValue("scholar_id"), out var v) ? v : null;
    public string? IpAddress => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
}

/// <summary>Maps business exceptions to ProblemDetails; anything else becomes a generic 500 (details only in the log).</summary>
// Flow: a service throws -> this class catches it -> the browser gets {status, title, detail}.
// AppException  -> its own status (400, 404, 403...) and message, shown to the user.
// anything else -> 500 "An unexpected error occurred." and the real error goes to the server log.
public class ApiExceptionHandler(ILogger<ApiExceptionHandler> log, IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        int status; string title;
        if (ex is AppException app) { status = app.StatusCode; title = app.Message; }
        else if (ex is BadHttpRequestException) { status = 400; title = "Bad request."; }
        else
        {
            log.LogError(ex, "Unhandled exception for {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
            status = 500; title = "An unexpected error occurred.";
        }
        ctx.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = ctx,
            ProblemDetails = new ProblemDetails { Status = status, Title = title, Detail = title }
        });
    }
}
