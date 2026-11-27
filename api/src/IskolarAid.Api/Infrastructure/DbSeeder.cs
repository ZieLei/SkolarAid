// =====================================================================
// DbSeeder.cs - puts starting data into the database when the API starts.
// Called once from Program.cs. Each part is controlled by a setting:
// Seed__AdminUsername/Password -> first admin account (only if no admin exists)
// Seed__DemoLogins             -> demo admin "Adachi" and demo scholar "Shimamura"
// Seed__HistoricalData         -> two years of fake history (HistorySeeder + SampleDocuments)
// Seed__SampleData             -> three example scholarship types (only if none exist)
// (always)                     -> common Philippine scholarships (ScholarshipCatalog), missing ones only
// Safe to run many times: it checks before adding.
// =====================================================================
using IskolarAid.Core.Services;
using IskolarAid.Data;
using IskolarAid.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace IskolarAid.Api.Infrastructure;

/// <summary>Seeds the first admin (from env vars) and, optionally, sample scholarship types. Idempotent.</summary>
public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider sp, IConfiguration config, ILogger log)
    {
        var db = sp.GetRequiredService<IskolarDbContext>();
        var passwords = sp.GetRequiredService<PasswordService>();

        // 1. First admin account.
        var adminUser = config["Seed:AdminUsername"];
        var adminPass = config["Seed:AdminPassword"];
        if (!string.IsNullOrWhiteSpace(adminUser) && !string.IsNullOrWhiteSpace(adminPass))
        {
            if (!await db.Users.AnyAsync(u => u.Role == Roles.Admin))
            {
                db.Users.Add(
                    new User
                    {
                        Username = adminUser.Trim(),
                        Password = passwords.Hash(adminPass),
                        Role = Roles.Admin,
                        Name = config["Seed:AdminName"] ?? "Administrator",
                        AccountStatus = "Active",
                    }
                );
                await db.SaveChangesAsync();
                log.LogInformation("Seeded admin user '{User}'", adminUser);
            }
        }
        else if (!await db.Users.AnyAsync(u => u.Role == Roles.Admin))
        {
            log.LogWarning(
                "No admin user exists. Set Seed__AdminUsername and Seed__AdminPassword to create one."
            );
        }

        // 2. Demo logins for local development.
        if (config.GetValue<bool>("Seed:DemoLogins"))
        {
            await UpsertDemoAsync(db, passwords, Roles.Admin, "Adachi", "adachi123", "Adachi", log);
            await UpsertDemoAsync(
                db,
                passwords,
                Roles.Scholar,
                "Shimamura",
                "shimamura123",
                "Shimamura",
                log
            );
        }

        // 3. Fake history so charts and tables have something to show.
        if (config.GetValue<bool>("Seed:HistoricalData"))
        {
            await HistorySeeder.SeedAsync(sp, log);
            await SampleDocuments.AttachAsync(db, log);
        }

        // 4. Example scholarship types.
        if (config.GetValue<bool>("Seed:SampleData") && !await db.ScholarshipTypes.AnyAsync())
        {
            db.ScholarshipTypes.AddRange(
                new ScholarshipType
                {
                    Name = "Academic Excellence Scholarship",
                    StipendAmount = 5000,
                    PaymentFrequency = "Monthly",
                    FundSource = "Government",
                    RenewalConditions = "Minimum GPA of 2.5, No failing grades",
                    IsActive = true,
                },
                new ScholarshipType
                {
                    Name = "Financial Assistance Grant",
                    StipendAmount = 3500,
                    PaymentFrequency = "Monthly",
                    FundSource = "Private",
                    RenewalConditions = "Maintain full-time enrollment",
                    IsActive = true,
                },
                new ScholarshipType
                {
                    Name = "Tulong Dunong Program",
                    StipendAmount = 7500,
                    PaymentFrequency = "Semi-Annual",
                    FundSource = "Government",
                    RenewalConditions = "Minimum GPA of 2.0, No failing grades",
                    IsActive = true,
                }
            );
            await db.SaveChangesAsync();
            log.LogInformation("Seeded sample scholarship types");
        }

        // 5. Common Philippine scholarships (always; only missing ones are added).
        var catalog = await ScholarshipTypeService.EnsureCatalogAsync(db);
        if (catalog > 0)
            log.LogInformation("Added {Count} scholarship types from the catalog", catalog);
    }

    /// <summary>Local-dev convenience logins. Re-applies the password on every start so they always work.</summary>
    private static async Task UpsertDemoAsync(
        IskolarDbContext db,
        PasswordService passwords,
        string role,
        string username,
        string password,
        string name,
        ILogger log
    )
    {
        // Find the user, or create it if missing. Then reset the password so the demo login always works.
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user is null)
        {
            user = new User
            {
                Username = username,
                Role = role,
                Name = name,
            };
            db.Users.Add(user);
        }
        user.Password = passwords.Hash(password);
        user.Role = role;
        user.AccountStatus = "Active";
        await db.SaveChangesAsync();

        // A scholar login also needs a matching Scholar profile row.
        if (role == Roles.Scholar && !await db.Scholars.AnyAsync(s => s.UserId == user.Id))
        {
            db.Scholars.Add(
                new Scholar
                {
                    UserId = user.Id,
                    StudentId = "2026-000099",
                    ScholarNumber = "DEMO-0001",
                    FirstName = name,
                    LastName = "Demo",
                    Email = "shimamura@example.com",
                    Course = "BS Computer Science",
                    YearLevel = "3rd Year",
                    Status = "Active",
                }
            );
            await db.SaveChangesAsync();
        }
        else if (role == Roles.Scholar)
        {
            // Earlier versions used the username as the Student ID; give it a realistic one.
            var existing = await db.Scholars.FirstAsync(s => s.UserId == user.Id);
            if (existing.StudentId == username)
            {
                existing.StudentId = "2026-000099";
                await db.SaveChangesAsync();
            }
        }
        log.LogInformation("Demo login ready: {User} ({Role})", username, role);
    }
}
