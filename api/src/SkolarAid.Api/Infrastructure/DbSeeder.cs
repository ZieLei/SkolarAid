using Microsoft.EntityFrameworkCore;
using SkolarAid.Core.Services;
using SkolarAid.Data;
using SkolarAid.Data.Entities;

namespace SkolarAid.Api.Infrastructure;

/// <summary>Seeds the first admin (from env vars) and, optionally, sample scholarship types. Idempotent.</summary>
public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider sp, IConfiguration config, ILogger log)
    {
        var db = sp.GetRequiredService<SkolarDbContext>();
        var passwords = sp.GetRequiredService<PasswordService>();

        var adminUser = config["Seed:AdminUsername"];
        var adminPass = config["Seed:AdminPassword"];
        if (!string.IsNullOrWhiteSpace(adminUser) && !string.IsNullOrWhiteSpace(adminPass))
        {
            if (!await db.Users.AnyAsync(u => u.Role == Roles.Admin))
            {
                db.Users.Add(new User
                {
                    Username = adminUser.Trim(), Password = passwords.Hash(adminPass), Role = Roles.Admin,
                    Name = config["Seed:AdminName"] ?? "Administrator", AccountStatus = "Active"
                });
                await db.SaveChangesAsync();
                log.LogInformation("Seeded admin user '{User}'", adminUser);
            }
        }
        else if (!await db.Users.AnyAsync(u => u.Role == Roles.Admin))
        {
            log.LogWarning("No admin user exists. Set Seed__AdminUsername and Seed__AdminPassword to create one.");
        }

        if (config.GetValue<bool>("Seed:DemoLogins"))
        {
            await UpsertDemoAsync(db, passwords, Roles.Admin, "Adachi", "adachi123", "Adachi", log);
            await UpsertDemoAsync(db, passwords, Roles.Scholar, "Shimamura", "shimamura123", "Shimamura", log);
        }

        if (config.GetValue<bool>("Seed:SampleData") && !await db.ScholarshipTypes.AnyAsync())
        {
            db.ScholarshipTypes.AddRange(
                new ScholarshipType { Name = "Academic Excellence Scholarship", StipendAmount = 5000, PaymentFrequency = "Monthly", FundSource = "Government", RenewalConditions = "Minimum GPA of 2.5, No failing grades", IsActive = true },
                new ScholarshipType { Name = "Financial Assistance Grant", StipendAmount = 3500, PaymentFrequency = "Monthly", FundSource = "Private", RenewalConditions = "Maintain full-time enrollment", IsActive = true },
                new ScholarshipType { Name = "Tulong Dunong Program", StipendAmount = 7500, PaymentFrequency = "Semi-Annual", FundSource = "Government", RenewalConditions = "Minimum GPA of 2.0, No failing grades", IsActive = true });
            await db.SaveChangesAsync();
            log.LogInformation("Seeded sample scholarship types");
        }
    }

    /// <summary>Local-dev convenience logins. Re-applies the password on every start so they always work.</summary>
    private static async Task UpsertDemoAsync(SkolarDbContext db, PasswordService passwords, string role, string username, string password, string name, ILogger log)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user is null)
        {
            user = new User { Username = username, Role = role, Name = name };
            db.Users.Add(user);
        }
        user.Password = passwords.Hash(password);
        user.Role = role;
        user.AccountStatus = "Active";
        await db.SaveChangesAsync();

        if (role == Roles.Scholar && !await db.Scholars.AnyAsync(s => s.UserId == user.Id))
        {
            db.Scholars.Add(new Scholar
            {
                UserId = user.Id, StudentId = username, ScholarNumber = "DEMO-0001",
                FirstName = name, LastName = "Demo", Email = "shimamura@example.com",
                Course = "BS Computer Science", YearLevel = "3rd Year", Status = "Active"
            });
            await db.SaveChangesAsync();
        }
        log.LogInformation("Demo login ready: {User} ({Role})", username, role);
    }
}
