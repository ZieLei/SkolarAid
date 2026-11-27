// =====================================================================
// ScholarImportService.cs - loads the REAL scholar list into the database
// from the Excel file the scholarship office works with (the CHED/UniFAST
// "Working File" sheet: LAST NAME, FIRST NAME, COURSE, EMAIL ADDRESS ...).
//
// Run it with:  ./run.sh import "<file.xlsx>" [--purge-seed]
//
// For every row it creates (like ScholarService.CreateAsync does):
//   - a Scholar with number SCH-<year>-001, 002 ... in the order of the sheet
//   - a login account in "Pending" state (the scholar activates it on the
//     Sign up page with their Scholar ID + the email from the sheet)
//   - the five default compliance requirements (Pending)
// No emails are sent (152 people must not get mail from a test run).
//
// Safe to run again: rows whose email already exists are skipped.
// --purge-seed first removes the fake development data (HistorySeeder).
// =====================================================================
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Rules;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public sealed record ImportRow(
    int Seq, string LastName, string FirstName, string? MiddleName, string? Suffix, string Course, string YearLevel, string Gender,
    DateTime? BirthDate, string Email, string? Contact, string SheetStatus, string? Remarks, string AwardNumber, string Category, decimal Amount);

public sealed record ImportResult(int Created, int Skipped, int Inactive, int Purged, decimal TypeAmount, List<(string Number, string Name, string Email, string Award)> Rows);

public static class ScholarImporter
{
    // ---- Reading and cleaning the sheet ----

    public static List<ImportRow> ParseRows(IEnumerable<Dictionary<string, string>> sheet)
    {
        var rows = new List<ImportRow>();
        var n = 0;
        foreach (var r in sheet)
        {
            string G(string k) => r.GetValueOrDefault(k, "").Trim();
            if (G("LAST NAME") == "" && G("FIRST NAME") == "") continue; // blank line
            n++;
            if (G("EMAIL ADDRESS") == "") throw new InvalidDataException($"Row {n}: {G("LAST NAME")}, {G("FIRST NAME")} has no email address.");
            rows.Add(new ImportRow(
                int.TryParse(G("SEQ."), out var seq) ? seq : n, Name(G("LAST NAME")), Name(G("FIRST NAME")), Name(G("MIDDLE NAME")) is { Length: > 0 } m ? m : null,
                Suffix(G("EXTENSION NAME")), CourseName(G("COURSE")), G("YEAR LEVEL"), Title(G("SEX")),
                DateTime.TryParseExact(G("BIRTH DATE (YYYY/MM/DD)"), ["yyyy/MM/dd", "yyyy-MM-dd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null,
                G("EMAIL ADDRESS").ToLowerInvariant(), Phone(G("CONTACT NUMBER")), G("STATUS"), G("REMARKS") is { Length: > 0 } rem ? rem : null,
                G("AWARD NUMBER"), G("CATEGORY"), decimal.TryParse(G("BILLED AMOUNT"), NumberStyles.Any, CultureInfo.InvariantCulture, out var amt) ? amt : 0));
        }
        return rows;
    }

    // "ABAO-ABO" / "DE VERA" / "O'BRIEN" / "SIARA GRACE" -> normal capital letters.
    public static string Name(string s) => Title(s.Trim());
    public static string Title(string s) => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(s.Trim().ToLowerInvariant());

    // JR, JR., Jr -> "Jr."; III -> "III"; "NONE", "1", "" -> nothing.
    public static string? Suffix(string s)
    {
        var t = s.Trim().TrimEnd('.').ToUpperInvariant();
        return t switch { "JR" => "Jr.", "SR" => "Sr.", "II" or "III" or "IV" or "V" => t, _ => null };
    }

    // The sheet stores 9913730753 (leading 0 lost). -> 09913730753.
    public static string? Phone(string s)
    {
        var digits = new string(s.Where(char.IsDigit).ToArray());
        if (digits.Length == 0) return null;
        if (digits.Length == 10 && digits[0] == '9') digits = "0" + digits;
        return ScholarRules.NormalizePhone(digits);
    }

    // The sheet writes courses in capitals and with its own wording; use the same names as the app's course list.
    public static string CourseName(string s)
    {
        // Compare without "MAJOR", "IN", brackets and spacing, so "...SCIENCE MAJOR IN CRIMINOLOGY" == "...Science in Criminology".
        static string Key(string x) => string.Join(' ', x.ToUpperInvariant().Replace("(", " ").Replace(")", " ").Replace(",", " ")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(w => w is not ("MAJOR" or "IN")));
        var key = Key(s);
        return ScholarService.Courses.FirstOrDefault(known => Key(known) == key) ?? Title(s);
    }

    // The sheet's status -> the app's scholar status.
    public static string AppStatus(string sheetStatus) => sheetStatus.Trim().ToUpperInvariant() switch { "ACTIVE" or "ENROLLED" => "Active", _ => "Inactive" };

    // ---- Importing ----

    // Adds every row that is not in the database yet. Returns what happened.
    public static async Task<ImportResult> ImportAsync(IskolarDbContext db, PasswordService passwords, IReadOnlyList<ImportRow> rows, bool purgeSeed, int? year = null)
    {
        var purged = purgeSeed ? await PurgeSeedDataAsync(db) : 0;
        year ??= DateTime.Now.Year;

        // The scholarship type of the sheet's CATEGORY ("CHED-TES").
        var type = await EnsureTypeAsync(db, rows);

        var existingEmails = (await db.Scholars.Where(s => s.Email != null).Select(s => s.Email!).ToListAsync()).Select(e => e.ToLowerInvariant()).ToHashSet();
        var numbers = await db.Scholars.Where(s => s.ScholarNumber.StartsWith($"SCH-{year}-")).Select(s => s.ScholarNumber).ToListAsync();
        var created = new List<(string, string, string, string)>();
        var skipped = 0; var inactive = 0;

        await using var tx = await db.Database.BeginTransactionAsync();
        foreach (var r in rows)
        {
            if (!existingEmails.Add(r.Email)) { skipped++; continue; }
            var number = ScholarRules.NextScholarNumber(year.Value, numbers);
            numbers.Add(number);
            var fullName = ScholarRules.FullName(r.FirstName, r.MiddleName, r.LastName, r.Suffix);
            var status = AppStatus(r.SheetStatus);
            // The sheet has no school Student ID, so the login name is the Scholar ID. The scholar proves who they are
            // with the Scholar ID + their email (AuthService.SignUpAsync) and chooses their own password.
            var user = new User { Username = number, Password = passwords.Hash(ScholarRules.GeneratePassword()), Role = Roles.Scholar, Name = fullName, AccountStatus = AccountStatuses.Pending };
            var scholar = new Scholar
            {
                User = user, StudentId = null, ScholarNumber = number, FirstName = r.FirstName, MiddleName = r.MiddleName,
                LastName = ScholarRules.LastNameWithSuffix(r.LastName, r.Suffix), Email = r.Email, ContactNumber = r.Contact,
                DateOfBirth = r.BirthDate, Gender = r.Gender, Program = "Undergraduate", Hei = "Legacy College of Compostela",
                DegreeProgram = r.Course, Course = r.Course, YearLevel = r.YearLevel, ScholarshipTypeId = type.Id,
                StipendAmount = type.StipendAmount, StipendFrequency = type.PaymentFrequency, ScholarshipFundSource = type.FundSource, Status = status
            };
            db.Scholars.Add(scholar);
            await db.SaveChangesAsync();
            for (var i = 0; i < ComplianceRules.DefaultTypes.Length; i++) db.ComplianceRecords.Add(ComplianceService.NewDefault(scholar.Id, i, "Pending"));
            var note = status == "Active" ? "" : $" Sheet status: {r.SheetStatus}{(r.Remarks is null ? "" : " / " + r.Remarks)}.";
            db.ActivityLogs.Add(new ActivityLog { UserName = "Import", ActionType = "CREATE", TableAffected = "scholars", RecordId = scholar.Id,
                Details = $"Imported from spreadsheet: {fullName} ({number}), award {r.AwardNumber}.{note}" });
            if (status != "Active") inactive++;
            created.Add((number, fullName, r.Email, r.AwardNumber));
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return new ImportResult(created.Count, skipped, inactive, purged, type.StipendAmount, created);
    }

    // The sheet says CHED-TES with a billed amount per grantee: make sure that scholarship type exists with that amount.
    private static async Task<ScholarshipType> EnsureTypeAsync(IskolarDbContext db, IReadOnlyList<ImportRow> rows)
    {
        var amount = rows.Select(r => r.Amount).Where(a => a > 0).DefaultIfEmpty(0).Max();
        var t = await db.ScholarshipTypes.FirstOrDefaultAsync(x => x.Name.StartsWith("Tertiary Education Subsidy"));
        if (t is null)
        {
            t = new ScholarshipType { Name = "Tertiary Education Subsidy (TES)", FundSource = "Government", PaymentFrequency = "Semi-Annual", IsActive = true,
                                      Description = "CHED UniFAST Tertiary Education Subsidy." };
            db.ScholarshipTypes.Add(t);
        }
        if (amount > 0) t.StipendAmount = amount; // the sheet is the real figure (per semester)
        await db.SaveChangesAsync();
        return t;
    }

    // Removes the fake development data made by HistorySeeder (scholars with a "@seed.iskolaraid.test" email),
    // together with their login accounts, applications, payments, requirements, files, notifications and logs.
    public static async Task<int> PurgeSeedDataAsync(IskolarDbContext db)
    {
        const string suffix = "@seed.iskolaraid.test";
        var seeded = await db.Scholars.Where(s => s.Email != null && s.Email.EndsWith(suffix)).ToListAsync();
        var userIds = seeded.Where(s => s.UserId != null).Select(s => s.UserId!.Value).ToList();
        // Seeded log lines all carry a 192.168.1.x address (real ones are 127.0.0.1 / ::1).
        db.ActivityLogs.RemoveRange(db.ActivityLogs.Where(a => (a.IpAddress != null && a.IpAddress.StartsWith("192.168.1.")) || (a.UserId != null && userIds.Contains(a.UserId.Value))));
        db.ScholarRegistrations.RemoveRange(db.ScholarRegistrations.Where(r => r.Email.EndsWith(suffix))); // left by older versions of the seeder
        await db.SaveChangesAsync();
        db.Scholars.RemoveRange(seeded); // payments, requirements, files and notifications go with them (cascade)
        await db.SaveChangesAsync();
        db.Users.RemoveRange(db.Users.Where(u => userIds.Contains(u.Id)));
        await db.SaveChangesAsync();
        return seeded.Count;
    }
}
