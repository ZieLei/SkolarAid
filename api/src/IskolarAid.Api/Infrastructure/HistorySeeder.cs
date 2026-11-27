// =====================================================================
// HistorySeeder.cs - DEVELOPMENT ONLY. Creates about two years of fake
// but realistic data. Called by DbSeeder when Seed__HistoricalData=true.
// Order of work: scholars -> compliance -> payments
// -> notifications -> activity logs. See the summary on the class below.
// =====================================================================
using System.Text;
using IskolarAid.Core.Rules;
using IskolarAid.Core.Services;
using IskolarAid.Data;
using IskolarAid.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace IskolarAid.Api.Infrastructure;

/// <summary>
/// Development-only: fills an empty-ish database with two years of believable history
/// (scholars, compliance, monthly payroll, notifications, activity logs).
/// Idempotent: does nothing if seeded scholars already exist. Deterministic (fixed random seed).
/// All seeded scholars share the password "Scholar#123" and an email ending in @seed.iskolaraid.test.
/// </summary>
public static class HistorySeeder
{
    public const string EmailSuffix = "@seed.iskolaraid.test";
    public const string Password = "Scholar#123";

    private static readonly string[] FirstNames =
    [
        "Maria",
        "Juan",
        "Ana",
        "Pedro",
        "Jose",
        "Rosa",
        "Carlos",
        "Liza",
        "Miguel",
        "Grace",
        "Paolo",
        "Angelica",
        "Ramon",
        "Cristina",
        "Joshua",
        "Kristine",
        "Mark",
        "Jasmine",
        "Daniel",
        "Patricia",
        "Rafael",
        "Bianca",
        "Nathan",
        "Camille",
        "Vincent",
        "Danica",
        "Gabriel",
        "Erika",
        "Lorenzo",
        "Mylene",
        "Christian",
        "Shiela",
        "Adrian",
        "Joy",
        "Francis",
        "Hazel",
        "Jerome",
        "Kimberly",
        "Albert",
        "Trisha",
    ];
    private static readonly string[] LastNames =
    [
        "Santos",
        "Reyes",
        "Cruz",
        "Bautista",
        "Ocampo",
        "Garcia",
        "Mendoza",
        "Torres",
        "Tomas",
        "Andres",
        "Castillo",
        "Flores",
        "Villanueva",
        "Ramos",
        "Aquino",
        "Dela Cruz",
        "Navarro",
        "Salazar",
        "Domingo",
        "Soriano",
        "Lim",
        "Tan",
        "Gonzales",
        "Pascual",
        "Rivera",
        "Valdez",
        "Mercado",
        "Diaz",
        "Aguilar",
        "Padilla",
    ];
    private static readonly string[] Courses =
    [
        "Bachelor of Science in Information Technology",
        "Bachelor of Science in Criminology",
        "Bachelor of Elementary Education (Generalist)",
        "Bachelor of Science in Tourism Management",
        "Bachelor of Science in Business Administration (Major in Marketing Management)",
        "Bachelor of Science in Business Administration (Major in Financial Management)",
        "Bachelor of Secondary Education (Major in English)",
        "Bachelor of Secondary Education (Major in Social Studies)",
    ];
    private static readonly string[] Banks =
    [
        "BDO Unibank",
        "Land Bank of the Philippines",
        "BPI",
        "Metrobank",
        "GCash",
        "Maya",
        "PNB",
    ];
    private static readonly string[] Puroks =
    [
        "Poblacion",
        "Ngan",
        "Mapaca",
        "Osmeña",
        "Gabi",
        "Bango",
        "Lagab",
    ];
    private static readonly string[] Methods =
    [
        "Bank Transfer",
        "Bank Transfer",
        "Bank Transfer",
        "Mobile Wallet",
        "Cash",
    ];

    public static async Task SeedAsync(IServiceProvider sp, ILogger log)
    {
        var db = sp.GetRequiredService<IskolarDbContext>();
        var passwords = sp.GetRequiredService<PasswordService>();
        // Already seeded before? Then stop, so we never add the data twice.
        if (await db.Scholars.AnyAsync(s => s.Email != null && s.Email.EndsWith(EmailSuffix)))
        {
            log.LogInformation("Historical demo data already present; skipping.");
            return;
        }

        // Fixed seed (42) = the same "random" data every time.
        var rng = new Random(42);
        var today = DateTime.Today;
        var thisMonth = new DateTime(today.Year, today.Month, 1);
        var start = thisMonth.AddMonths(-24);

        var admin = await db
            .Users.OrderBy(u => u.Id)
            .FirstOrDefaultAsync(u => u.Role == Roles.Admin && u.Username == "Adachi")
            ?? await db.Users.OrderBy(u => u.Id).FirstOrDefaultAsync(u => u.Role == Roles.Admin);
        if (admin is null)
        {
            log.LogWarning("No admin user; cannot seed history.");
            return;
        }

        // scholarship programs (reuse existing ones)
        var types = await db
            .ScholarshipTypes.Where(t => t.IsActive)
            .OrderBy(t => t.Id)
            .ToListAsync();
        if (types.Count == 0)
        {
            types =
            [
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
                },
            ];
            db.ScholarshipTypes.AddRange(types);
            await db.SaveChangesAsync();
        }

        var hash = passwords.Hash(Password);
        var existingNumbers = await db.Scholars.Select(s => s.ScholarNumber).ToListAsync();
        var usedStudentIds = (await db.Users.Select(u => u.Username).ToListAsync()).ToHashSet();

        const int scholarCount = 64;
        var scholars = new List<(Scholar S, User U, DateTime Joined, DateTime? Ends)>();
        for (var i = 0; i < scholarCount; i++)
        {
            // most scholars joined in the first year; the rest trickle in
            var joinMonth = i < 40 ? rng.Next(0, 6) : rng.Next(6, 23);
            var joined = start.AddMonths(joinMonth).AddDays(rng.Next(0, 20));
            var first = FirstNames[rng.Next(FirstNames.Length)];
            var last = LastNames[rng.Next(LastNames.Length)];
            var type = types[rng.Next(types.Count)];
            var number = ScholarRules.NextScholarNumber(joined.Year, existingNumbers);
            existingNumbers.Add(number);
            var studentId = ScholarRules.GeneratedStudentId(
                joined.Year,
                ScholarRules.SequenceOf(number)
            );
            while (!usedStudentIds.Add(studentId))
                studentId += "x";
            var startYear = rng.Next(1, 4);
            var yearsElapsed = (int)((thisMonth - joined).TotalDays / 365.25);
            var yearNow = startYear + yearsElapsed;

            // lifecycle: graduated after year 4, a few drop out / go inactive
            DateTime? ends = null;
            var status = "Active";
            if (yearNow > 4)
            {
                status = "Graduated";
                ends = joined.AddYears(4 - startYear + 1);
                if (ends > thisMonth)
                {
                    ends = null;
                    status = "Active";
                    yearNow = 4;
                }
            }
            else if (i % 17 == 3)
            {
                status = "Inactive";
                ends = thisMonth.AddMonths(-rng.Next(2, 9));
                if (ends < joined.AddMonths(2))
                {
                    ends = null;
                    status = "Active";
                }
            }
            else if (i % 23 == 5)
            {
                status = "Dropped";
                ends = thisMonth.AddMonths(-rng.Next(3, 12));
                if (ends < joined.AddMonths(2))
                {
                    ends = null;
                    status = "Active";
                }
            }
            else if (i % 11 == 7)
                status = "Probation";
            if (yearNow > 5)
                yearNow = 5;

            var course = Courses[rng.Next(Courses.Length)];
            var user = new User
            {
                Username = studentId,
                Password = hash,
                Role = Roles.Scholar,
                Name = $"{first} {last}",
                AccountStatus = status is "Inactive" or "Dropped" or "Graduated"
                    ? "Inactive"
                    : "Active",
                CreatedAt = joined,
                UpdatedAt = joined,
            };
            var scholar = new Scholar
            {
                User = user,
                StudentId = studentId,
                ScholarNumber = number,
                FirstName = first,
                LastName = last,
                MiddleName = rng.Next(3) == 0 ? LastNames[rng.Next(LastNames.Length)] : null,
                Email = $"{first}.{last}.{i}{EmailSuffix}".ToLowerInvariant().Replace(' ', '-'),
                ContactNumber = "09" + rng.Next(100000000, 999999999),
                DateOfBirth = new DateTime(rng.Next(1999, 2006), rng.Next(1, 13), rng.Next(1, 28)),
                Gender = rng.Next(2) == 0 ? "Male" : "Female",
                Address =
                    $"Purok {rng.Next(1, 8)}, {Puroks[rng.Next(Puroks.Length)]}, Compostela, Davao de Oro",
                Program = "Undergraduate",
                Hei = "Legacy College of Compostela",
                DegreeProgram = course,
                Course = course,
                YearLevel =
                    status == "Graduated" ? "4th Year" : $"{yearNow}{Ordinal(yearNow)} Year",
                ScholarshipTypeId = type.Id,
                ScholarshipType = type,
                StipendAmount = type.StipendAmount,
                StipendFrequency = type.PaymentFrequency,
                ScholarshipFundSource = type.FundSource ?? "Government",
                RenewalConditions = type.RenewalConditions,
                BankName = Banks[rng.Next(Banks.Length)],
                BankAccountNumber = rng.NextInt64(1_000_000_000, 9_999_999_999).ToString(),
                EnrollmentDate = joined,
                ExpectedGraduation = joined.AddYears(5 - startYear),
                Status = status,
                CreatedAt = joined,
                UpdatedAt = ends ?? joined,
            };
            scholars.Add((scholar, user, joined, ends));
        }
        db.Scholars.AddRange(scholars.Select(x => x.S));
        await db.SaveChangesAsync();

        // compliance: five requirements each, status depending on how long ago the scholar joined
        foreach (var (s, _, joined, ends) in scholars)
        {
            for (var k = 0; k < ComplianceRules.DefaultTypes.Length; k++)
            {
                var due = joined.AddMonths(1).Date;
                var ageDays = (today - due).TotalDays;
                string st;
                if (ends is not null && k > 2)
                    st = ageDays > 0 ? "Overdue" : "Pending";
                else if (k <= 2)
                    st =
                        ageDays > 20 ? "Approved"
                        : ageDays > 0 ? "Submitted"
                        : "Pending";
                else
                    st =
                        ageDays > 60 && rng.Next(4) != 0 ? "Approved"
                        : ageDays > 0 ? (rng.Next(3) == 0 ? "Overdue" : "Submitted")
                        : "Pending";
                if (s.Status == "Probation" && k == 3)
                    st = "Rejected";
                var rec = new ComplianceRecord
                {
                    Scholar = s,
                    RequirementType = ComplianceRules.DefaultTypes[k],
                    Description = ComplianceRules.DefaultDescriptions[k],
                    DueDate = due,
                    Status = st,
                    CreatedAt = joined,
                    UpdatedAt = joined.AddDays(rng.Next(1, 25)),
                };
                if (st is "Approved" or "Submitted" or "Rejected")
                {
                    rec.DateSubmitted = joined.AddDays(rng.Next(1, 20));
                    rec.FilePath =
                        $"{ComplianceRules.DocKeys[k].ToLowerInvariant()}-{s.StudentId}.pdf";
                    if (st != "Submitted")
                        rec.CheckedBy = admin.Id;
                    if (st == "Rejected")
                        rec.Remarks =
                            "Document is blurry or incomplete. Please upload a clearer copy.";
                    db.ComplianceRecords.Add(rec); // the document itself is attached by SampleDocuments
                }
                else
                    db.ComplianceRecords.Add(rec);
            }
        }
        await db.SaveChangesAsync();
        // payroll: one payment per scholar per due month; everything before this month is released
        var refSeq = 0;
        var paymentCount = 0;
        var releasedByMonth = new SortedDictionary<DateTime, (int Count, decimal Total)>();
        foreach (var (s, _, joined, ends) in scholars)
        {
            var stipend = s.StipendAmount ?? 0;
            for (
                var m = new DateTime(joined.Year, joined.Month, 1).AddMonths(1);
                m < thisMonth;
                m = m.AddMonths(1)
            )
            {
                if (ends is not null && m > ends)
                    break;
                var semiAnnual = s.StipendFrequency == "Semi-Annual";
                if (semiAnnual && m.Month is not (1 or 7))
                    continue;
                var computed = m.AddDays(rng.Next(0, 4));
                var release = PayrollRules.CalculateReleaseDate(computed);
                var created = computed.AddHours(9 + rng.Next(0, 6));
                db.Payments.Add(
                    new Payment
                    {
                        Scholar = s,
                        PaymentPeriod = PayrollRules.PeriodLabel(m),
                        Amount = stipend,
                        ComputationDate = computed,
                        ReleaseDate = release,
                        Status = "Released",
                        PaymentMethod = Methods[rng.Next(Methods.Length)],
                        ReferenceNumber = $"PAY-{computed:yyyyMMdd}-{s.Id:D4}-{++refSeq:D9}",
                        ProcessedBy = admin.Id,
                        CreatedAt = created,
                        UpdatedAt = release.AddHours(10),
                    }
                );
                paymentCount++;
                releasedByMonth[m] = releasedByMonth.TryGetValue(m, out var v)
                    ? (v.Count + 1, v.Total + stipend)
                    : (1, stipend);
                db.Notifications.Add(
                    new Notification
                    {
                        SenderId = admin.Id,
                        Recipient = s,
                        Title = "Payment Released!",
                        NotificationType = "Update",
                        DateCreated = release.AddHours(10),
                        Message =
                            $"Your stipend for {PayrollRules.PeriodLabel(m)} has been RELEASED.\nAmount: ₱{stipend:N2}\nMethod: Bank Transfer\n\nThe funds should reflect in your account within 1-3 business days.",
                        IsRead = (thisMonth - m).TotalDays > 62 || rng.Next(3) != 0,
                        ReadAt = release.AddDays(1),
                    }
                );
            }
            db.Notifications.Add(
                new Notification
                {
                    SenderId = admin.Id,
                    Recipient = s,
                    Title = "Welcome to IskolarAid",
                    NotificationType = "Announcement",
                    DateCreated = joined,
                    Message =
                        $"Welcome, {s.FirstName}! Your scholarship account is ready. Please submit your documents under Compliance.",
                    IsRead = true,
                    ReadAt = joined.AddDays(1),
                }
            );
        }
        await db.SaveChangesAsync();

        // activity log: payroll batches, new scholars, and logins spread across the two years
        var logs = new List<ActivityLog>();
        void Log(DateTime at, string action, string? table, string details, User u) =>
            logs.Add(
                new ActivityLog
                {
                    UserId = u.Id,
                    UserName = u.Name,
                    ActionType = action,
                    TableAffected = table,
                    Details = details,
                    IpAddress = $"192.168.1.{rng.Next(10, 60)}",
                    CreatedAt = at,
                }
            );
        foreach (var (m, (count, total)) in releasedByMonth)
        {
            var at = m.AddDays(2).AddHours(10);
            Log(
                at,
                "CREATE",
                "payments",
                $"Processed payroll for {PayrollRules.PeriodLabel(m)}: {count} scholars, ₱{total:N2}",
                admin
            );
            Log(
                at.AddDays(4),
                "UPDATE",
                "payments",
                $"Released {count} payments. Total: ₱{total:N2}",
                admin
            );
        }
        foreach (var (s, u, joined, _) in scholars)
        {
            Log(
                joined.AddHours(11),
                "CREATE",
                "scholars",
                $"Created new scholar: {s.FullName}",
                admin
            );
            var logins = rng.Next(6, 40);
            for (var n = 0; n < logins; n++)
            {
                var at = joined
                    .AddDays(rng.Next(1, Math.Max(2, (int)(today - joined).TotalDays)))
                    .AddHours(rng.Next(7, 21))
                    .AddMinutes(rng.Next(0, 59));
                Log(at, "LOGIN", "users", $"{s.FullName} logged into the system", u);
            }
        }
        for (var d = start; d < today; d = d.AddDays(rng.Next(2, 5)))
            Log(
                d.AddHours(8 + rng.Next(0, 4)),
                "LOGIN",
                "users",
                $"{admin.Name} logged into the system",
                admin
            );
        db.ActivityLogs.AddRange(logs);
        await db.SaveChangesAsync();

        log.LogInformation(
            "Seeded {Scholars} scholars, {Payments} payments and {Logs} log entries covering {From:MMM yyyy} – {To:MMM yyyy}.",
            scholars.Count,
            paymentCount,
            logs.Count,
            start,
            today
        );
    }

    private static string Ordinal(int n) =>
        n switch
        {
            1 => "st",
            2 => "nd",
            3 => "rd",
            _ => "th",
        };
}
