using IskolarAid.Core.Common;
using IskolarAid.Core.Services;
using IskolarAid.Data;
using IskolarAid.Data.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace IskolarAid.Tests;

public class FakeUser : ICurrentUser
{
    public int? UserId { get; set; }
    public string? UserName { get; set; } = "Admin";
    public string? Role { get; set; } = "ADMIN";
    public int? ScholarId { get; set; }
    public string? IpAddress { get; set; } = "127.0.0.1";
}

public class FakeEmail : IEmailSender
{
    public List<string> Sent { get; } = [];

    public Task<bool> SendAsync(
        string toAddress,
        string toName,
        string subject,
        string htmlBody,
        CancellationToken ct = default
    )
    {
        Sent.Add($"{toAddress}|{subject}");
        return Task.FromResult(true);
    }
}

/// <summary>SQLite in-memory database + the service graph under test.</summary>
public sealed class Fixture : IDisposable
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:");
    public IskolarDbContext Db { get; }
    public FakeUser Current { get; } = new();
    public FakeEmail Email { get; } = new();
    public PasswordService Passwords { get; } = new();
    public ActivityLogService Log { get; }
    public AppEvents Events { get; } = new();

    public Fixture()
    {
        _conn.Open();
        Db = new IskolarDbContext(
            new DbContextOptionsBuilder<IskolarDbContext>().UseSqlite(_conn).Options
        );
        Db.Database.EnsureCreated();
        Log = new ActivityLogService(Db, Current);
    }

    public Microsoft.Extensions.Options.IOptions<T> Opt<T>(T v)
        where T : class => Microsoft.Extensions.Options.Options.Create(v);

    public AuthService Auth => new(Db, Passwords, Log);
    public ComplianceService Compliance => new(Db, Log, Current, Opt(new UploadOptions()), Events);
    public ScholarService Scholars => new(Db, Passwords, Log, Email, Opt(new SmtpOptions()));
    public PayrollService Payroll => new(Db, Log, Current, Email, Events);

    public async Task<ScholarshipType> AddTypeAsync(
        string name = "Academic",
        decimal amount = 5000,
        bool active = true,
        string frequency = "Monthly"
    )
    {
        var t = new ScholarshipType
        {
            Name = name,
            StipendAmount = amount,
            PaymentFrequency = frequency,
            IsActive = active,
        };
        Db.ScholarshipTypes.Add(t);
        await Db.SaveChangesAsync();
        return t;
    }

    public async Task<User> AddUserAsync(
        string username,
        string password,
        string role = "ADMIN",
        string status = "Active",
        bool hashed = true
    )
    {
        var u = new User
        {
            Username = username,
            Password = hashed ? Passwords.Hash(password) : password,
            Role = role,
            Name = username,
            AccountStatus = status,
        };
        Db.Users.Add(u);
        await Db.SaveChangesAsync();
        return u;
    }

    /// <summary>A scholar whose 5 compliance records all carry <paramref name="complianceStatus"/>.</summary>
    // Test scholars have bank details by default, so Bank Transfer payroll works; pass bank: false for one without.
    public async Task<Scholar> AddScholarAsync(
        int typeId,
        string complianceStatus = "Approved",
        string status = "Active",
        string number = "SCH-2026-001",
        bool bank = true
    )
    {
        var s = new Scholar
        {
            FirstName = "Juan",
            LastName = "Cruz",
            ScholarNumber = number,
            ScholarshipTypeId = typeId,
            Status = status,
            Email = "juan@x.ph",
            ContactNumber = "09171234567",
            BankName = bank ? "BDO" : null,
            BankAccountNumber = bank ? "001234567890" : null,
        };
        Db.Scholars.Add(s);
        await Db.SaveChangesAsync();
        for (var i = 0; i < 5; i++)
            Db.ComplianceRecords.Add(ComplianceService.NewDefault(s.Id, i, complianceStatus));
        await Db.SaveChangesAsync();
        return s;
    }

    public void Dispose()
    {
        Db.Dispose();
        _conn.Dispose();
    }
}
