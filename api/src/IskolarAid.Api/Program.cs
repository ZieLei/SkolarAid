// =====================================================================
// Program.cs - the starting point of the API (the back end).
//
// When the server starts, this file runs from top to bottom:
//   1. Read settings (JWT key, database, email, uploads).
//   2. Register every service so controllers can ask for them.
//   3. Set up login checks (JWT), CORS, rate limits and error handling.
//   4. Build the app and connect the URL routes (controllers + SignalR hub).
//   5. Prepare the database (create / migrate / seed) and start listening.
//
// TRACE: where things happen in this file -
//   login token check ........ "---- Auth ----"            (every [Authorize] endpoint depends on it)
//   admin / scholar roles .... AddPolicy("Admin"/"Scholar")
//   rate limits .............. "---- Rate limiting ----"   (login 10/min, sign-up 10/hour)
//   field validation ......... builder.Services.AddControllers() + [ApiController] -> DTO attributes in Dtos.cs
//   error -> JSON reply ...... ApiExceptionHandler (Infrastructure/Infrastructure.cs)
//   live updates ............. AppEvents -> RealtimeNotifier -> NotificationHub (/hubs/notifications)
//
// How a request flows through the API:
//   Browser -> Controller (Controllers/Controllers.cs)
//           -> Service (IskolarAid.Core/Services/*)
//           -> Database (IskolarAid.Data/IskolarDbContext.cs)
// =====================================================================
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using IskolarAid.Api.Infrastructure;
using IskolarAid.Api.Realtime;
using IskolarAid.Core.Common;
using IskolarAid.Core.Services;
using IskolarAid.Data;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---- Configuration (environment variables override appsettings; double underscore = nesting) ----
builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
builder.Services.Configure<SmtpOptions>(config.GetSection("Smtp"));
builder.Services.Configure<UploadOptions>(config.GetSection("Uploads"));

// The JWT key signs every login token. It must be long and secret.
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

// ---- Database connection ----
var cs = config.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(cs)) throw new InvalidOperationException("ConnectionStrings__Default is required.");
var serverVersion = Version.Parse(config["Database:ServerVersion"] ?? "8.0.36");
var serverType = string.Equals(config["Database:ServerType"], "MariaDb", StringComparison.OrdinalIgnoreCase) ? ServerType.MariaDb : ServerType.MySql;
// MySQL is the real database. "Sqlite" exists only for throw-away demos/UI checks without a MySQL server.
var useSqlite = string.Equals(config["Database:Provider"], "Sqlite", StringComparison.OrdinalIgnoreCase);
builder.Services.AddDbContext<IskolarDbContext>(o =>
{
    if (useSqlite) o.UseSqlite(cs); else o.UseMySql(cs, ServerVersion.Create(serverVersion, serverType));
});

// ---- Services ----
// Register each class so ASP.NET can create it and pass it into constructors
// (this is called "dependency injection").
//   Singleton = one shared copy for the whole app.
//   Scoped    = a new copy for every HTTP request.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddSingleton<PasswordService>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
builder.Services.AddScoped<ActivityLogService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ScholarshipTypeService>();
builder.Services.AddScoped<ComplianceService>();
builder.Services.AddScoped<ScholarService>();
builder.Services.AddScoped<PayrollService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<ActivityLogQueryService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<ScholarPortalService>();
builder.Services.AddScoped<ProfilePictureService>();

// ---- Real time: C# events (AppEvents) -> RealtimeNotifier -> SignalR hub -> browsers ----
builder.Services.AddSingleton<AppEvents>();
builder.Services.AddSingleton<RealtimeNotifier>();
builder.Services.AddSignalR();

// ---- Auth ----
// Every protected request must carry "Authorization: Bearer <token>".
// Here we say how to check that token (who made it, for whom, not expired, signed with our key).
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
    // Browsers cannot send an Authorization header on a WebSocket, so the SignalR client puts the token in the query string.
    o.Events = new JwtBearerEvents
    {
        OnMessageReceived = ctx =>
        {
            var token = ctx.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs")) ctx.Token = token;
            return Task.CompletedTask;
        }
    };
});
// Two roles: "Admin" pages and "Scholar" pages. Controllers pick one with [Authorize(Policy = ...)].
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Admin", p => p.RequireRole(IskolarAid.Data.Entities.Roles.Admin))
    .AddPolicy("Scholar", p => p.RequireRole(IskolarAid.Data.Entities.Roles.Scholar));

// ---- CORS (explicit origins only; AllowCredentials is required by the SignalR browser client) ----
var origins = (config["Cors:Origins"] ?? "http://localhost:4200").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()
    .WithExposedHeaders("Content-Disposition").AllowCredentials()));

// ---- Rate limiting (login brute force, sign-up spam) ----
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "x",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("register", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "x",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromHours(1) }));
});

// ---- Controllers, error handling, proxy headers, upload size ----
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.Configure<ForwardedHeadersOptions>(o => o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o => o.MultipartBodyLengthLimit = 60 * 1024 * 1024);

var app = builder.Build();

// ---- Request pipeline ----
// Every request passes through these steps in this exact order.
app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
// Connect URLs to code: /api/... -> controllers, /hubs/notifications -> live updates, /health -> "ok".
app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ---- Startup tasks ----
// Create the notifier now so it subscribes to the C# events before the first request.
app.Services.GetRequiredService<RealtimeNotifier>();
var eventsLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("AppEvents");
app.Services.GetRequiredService<AppEvents>().SubscriberFailed = (name, ex) => eventsLog.LogError(ex, "A subscriber of {Event} failed", name);

// Get the database ready before taking requests:
//   SQLite (demo)   -> create the tables from the model.
//   MySQL + AutoMigrate -> apply migrations, retrying while the DB is still starting.
// Then add the default admin and sample data if needed (DbSeeder).
using (var scope = app.Services.CreateScope())
{
    var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    if (useSqlite)
    {
        // The SQLite demo database is throw-away. If it was made by an older version of the app
        // (a table or column is missing), start it again from scratch instead of failing later.
        var db = scope.ServiceProvider.GetRequiredService<IskolarDbContext>();
        db.Database.EnsureCreated();
        if (SqliteSchema.IsOutdated(db))
        {
            log.LogWarning("The demo database is from an older version of the app; recreating it.");
            db.Database.EnsureDeleted();
            db.Database.EnsureCreated();
        }
    }
    else if (config.GetValue<bool>("Database:AutoMigrate"))
    {
        var db = scope.ServiceProvider.GetRequiredService<IskolarDbContext>();
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

// ---- One-off command: import the real scholar list from an Excel file, then exit ----
//   ./run.sh import "<file.xlsx>" [--purge-seed]      (see ScholarImportService.cs)
var importArg = args.FirstOrDefault(a => a.StartsWith("--import-scholars="));
if (importArg is not null)
{
    var path = importArg["--import-scholars=".Length..];
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<IskolarDbContext>();
    using var file = File.OpenRead(path);
    var rows = ScholarImporter.ParseRows(XlsxReader.ReadFirstSheet(file));
    var result = await ScholarImporter.ImportAsync(db, scope.ServiceProvider.GetRequiredService<PasswordService>(), rows, args.Contains("--purge-seed"));
    Console.WriteLine($"Import done: {result.Created} scholars added, {result.Skipped} already present (skipped), {result.Inactive} not active, {result.Purged} fake scholars removed.");
    Console.WriteLine($"Scholarship type amount (from the sheet): {result.TypeAmount:N2} per semester.");
    // The office needs to tell each scholar their Scholar ID: write the list next to the database files (not in git).
    var listPath = Path.Combine(Environment.GetEnvironmentVariable("IMPORT_LIST_DIR") ?? ".", "scholar-ids.csv");
    File.WriteAllLines(listPath, new[] { "Scholar ID,Name,Email,Award number" }.Concat(result.Rows.Select(r => $"{r.Number},\"{r.Name}\",{r.Email},{r.Award}")));
    Console.WriteLine($"Scholar ID list: {listPath}");
    return;
}

// Start the web server. This line blocks until the app shuts down.
app.Run();

// Lets the test project start this app in memory (WebApplicationFactory<Program>).
public partial class Program;
