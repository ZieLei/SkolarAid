using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using SkolarAid.Core.Common;
using SkolarAid.Core.Dtos;
using SkolarAid.Core.Services;
using SkolarAid.Data.Entities;

namespace SkolarAid.Api.Infrastructure;

public class JwtOptions
{
    public string Key { get; set; } = "";
    public string Issuer { get; set; } = "SkolarAid";
    public string Audience { get; set; } = "SkolarAid";
    public int ExpiryMinutes { get; set; } = 480;
}

public class JwtTokenService(Microsoft.Extensions.Options.IOptions<JwtOptions> options)
{
    public (string Token, DateTime Expires) Create(User user, Scholar? scholar)
    {
        var o = options.Value;
        var expires = DateTime.UtcNow.AddMinutes(o.ExpiryMinutes);
        var claims = new List<Claim>
        {
            new("sub", user.Id.ToString()),
            new("name", user.Name),
            new("role", user.Role),
            new("username", user.Username)
        };
        if (scholar is not null) claims.Add(new Claim("scholar_id", scholar.Id.ToString()));
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(o.Key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(o.Issuer, o.Audience, claims, DateTime.UtcNow, expires, creds);
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}

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
