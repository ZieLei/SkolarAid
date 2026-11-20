using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SkolarAid.Api.Infrastructure;
using SkolarAid.Core.Common;
using SkolarAid.Core.Services;
using SkolarAid.Data;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---- Configuration (environment variables override appsettings; double underscore = nesting) ----
builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
builder.Services.Configure<SmtpOptions>(config.GetSection("Smtp"));
builder.Services.Configure<SmsOptions>(config.GetSection("Sms"));
builder.Services.Configure<UploadOptions>(config.GetSection("Uploads"));

var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.Key) || jwt.Key.Length < 32)
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException("Jwt__Key must be set to a random value of at least 32 characters.");
    // Development only: a throw-away key per process start (tokens stop working after a restart).
    jwt.Key = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
    builder.Services.Configure<JwtOptions>(o => o.Key = jwt.Key);
    Console.WriteLine("WARN: Jwt__Key not set - using an ephemeral development key.");
}

var cs = config.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(cs)) throw new InvalidOperationException("ConnectionStrings__Default is required.");
var serverVersion = Version.Parse(config["Database:ServerVersion"] ?? "8.0.36");
var serverType = string.Equals(config["Database:ServerType"], "MariaDb", StringComparison.OrdinalIgnoreCase) ? ServerType.MariaDb : ServerType.MySql;
// MySQL is the real database. "Sqlite" exists only for throw-away demos/UI checks without a MySQL server.
var useSqlite = string.Equals(config["Database:Provider"], "Sqlite", StringComparison.OrdinalIgnoreCase);
builder.Services.AddDbContext<SkolarDbContext>(o =>
{
    if (useSqlite) o.UseSqlite(cs); else o.UseMySql(cs, ServerVersion.Create(serverVersion, serverType));
});

// ---- Services ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddSingleton<PasswordService>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<IFileStore, LocalFileStore>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddHttpClient<ISmsSender, SemaphoreSmsSender>();
builder.Services.AddScoped<ActivityLogService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ScholarshipTypeService>();
builder.Services.AddScoped<ComplianceService>();
builder.Services.AddScoped<ScholarService>();
builder.Services.AddScoped<RegistrationService>();
builder.Services.AddScoped<PayrollService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<ActivityLogQueryService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<ScholarPortalService>();

// ---- Auth ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = jwt.Issuer,
        ValidateAudience = true, ValidAudience = jwt.Audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1),
        RoleClaimType = "role", NameClaimType = "name"
    };
});
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Admin", p => p.RequireRole(SkolarAid.Data.Entities.Roles.Admin))
    .AddPolicy("Scholar", p => p.RequireRole(SkolarAid.Data.Entities.Roles.Scholar));

// ---- CORS (explicit origins only) ----
var origins = (config["Cors:Origins"] ?? "http://localhost:4200").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()
    .WithExposedHeaders("Content-Disposition")));

// ---- Rate limiting (login brute force, public registration spam) ----
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "x",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("register", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "x",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromHours(1) }));
});

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.Configure<ForwardedHeadersOptions>(o => o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o => o.MultipartBodyLengthLimit = 60 * 1024 * 1024);

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ---- Startup tasks ----
using (var scope = app.Services.CreateScope())
{
    var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    if (useSqlite)
    {
        scope.ServiceProvider.GetRequiredService<SkolarDbContext>().Database.EnsureCreated();
    }
    else if (config.GetValue<bool>("Database:AutoMigrate"))
    {
        var db = scope.ServiceProvider.GetRequiredService<SkolarDbContext>();
        for (var attempt = 1; ; attempt++)
        {
            try { await db.Database.MigrateAsync(); break; }
            catch (Exception ex) when (attempt < 15)
            {
                log.LogWarning("Database not ready ({Message}); retry {Attempt}/15", ex.Message, attempt);
                await Task.Delay(TimeSpan.FromSeconds(3));
            }
        }
    }
    await DbSeeder.SeedAsync(scope.ServiceProvider, config, log);
}

app.Run();

public partial class Program;
