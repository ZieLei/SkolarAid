// =====================================================================
// Rules.cs - small, pure business rules (no database, no HTTP).
// They take values in and give a result back, so they are easy to test
// (see api/tests/IskolarAid.Tests/RulesTests.cs).
// ComplianceRules -> which documents a scholar must submit, and "is it complete?"
// PayrollRules    -> period names, release dates, reference numbers, who can be paid
// ScholarRules    -> names, scholar numbers, student ids, passwords, phone numbers
// AmountWords     -> 5000.50 -> "Five Thousand Pesos and 50/100 Centavos" (receipts)
// =====================================================================
using System.Globalization;
using System.Security.Cryptography;

namespace IskolarAid.Core.Rules;

/// <summary>Business rules ported from the WinForms code-behind, as pure functions.</summary>
public static class ComplianceRules
{
    // The five documents every new scholar must submit.
    public static readonly string[] DefaultTypes =
        ["PSA Birth Certificate", "Enrollment Form", "COR", "Grades", "Scholarship Contract"];

    // Text shown under each of the five documents above (same order).
    public static readonly string[] DefaultDescriptions =
    [
        "Submit PSA Birth Certificate",
        "Certificate of Enrollment (current semester)",
        "Certificate of Registration",
        "Latest grades and transcript of records",
        "Signed and notarized scholarship contract"
    ];

    /// <summary>Document keys used at creation/registration, in the same order as <see cref="DefaultTypes"/>.</summary>
    public static readonly string[] DocKeys = ["PSA", "COE", "COR", "Grades", "Contract"];

    public static readonly string[] Statuses = ["Pending", "Submitted", "Approved", "Rejected", "Overdue"];

    /// <summary>Payroll eligibility (strict, as enforced when processing): every record must be Approved.</summary>
    // Examples: all Approved -> "Complete"; none Approved -> "Pending Approval"; some -> "Incomplete".
    public static string Summarize(IReadOnlyCollection<string> statuses)
    {
        if (statuses.Count == 0) return "No Records";
        if (statuses.All(s => s == "Approved")) return "Complete";
        if (!statuses.Any(s => s == "Approved")) return "Pending Approval";
        return "Incomplete";
    }

    public static bool IsComplete(IReadOnlyCollection<string> statuses) => Summarize(statuses) == "Complete";

    /// <summary>Scholar view: Pending items past their due date become Overdue.</summary>
    public static bool ShouldBecomeOverdue(string status, DateTime dueDate, DateTime today)
        => status == "Pending" && dueDate.Date < today.Date;

    // Percent of requirements done, e.g. 3 of 5 -> 60.
    public static int ComplianceRate(int total, int completed) => total > 0 ? completed * 100 / total : 0;
}

public static class PayrollRules
{
    public static readonly string[] Methods = ["Bank Transfer", "Cash", "Mobile Wallet"];

    // Old payments used a whole month as their period, written like "March 2026".
    public static string PeriodLabel(DateTime date) => date.ToString("MMMM yyyy", CultureInfo.InvariantCulture);

    // A payment period is a date range picked on the payroll page. Its label:
    //   a whole month         -> "March 2026" (same as old payments, so they still match)
    //   inside one month      -> "Mar 01-15, 2026"
    //   across months / years -> "Mar 16 - Apr 15, 2026" / "Dec 16, 2026 - Jan 15, 2027"
    public static string PeriodLabel(DateTime start, DateTime end)
    {
        var ci = CultureInfo.InvariantCulture;
        start = start.Date; end = end.Date;
        if (start.Day == 1 && end == start.AddMonths(1).AddDays(-1)) return PeriodLabel(start);
        if (start.Year == end.Year && start.Month == end.Month) return $"{start.ToString("MMM dd", ci)}-{end:dd}, {end.Year}";
        if (start.Year == end.Year) return $"{start.ToString("MMM dd", ci)} - {end.ToString("MMM dd", ci)}, {end.Year}";
        return $"{start.ToString("MMM dd, yyyy", ci)} - {end.ToString("MMM dd, yyyy", ci)}";
    }

    // Checks the range picked on the payroll page. Returns what is wrong, or null.
    public static string? PeriodProblem(DateTime start, DateTime end)
    {
        if (end.Date < start.Date) return "The period end date must be on or after the start date.";
        if ((end.Date - start.Date).TotalDays > 366) return "A payment period cannot be longer than one year.";
        return null;
    }

    // The dates a payment covers. Old payments only have a "March 2026" label, so we read that as the whole month.
    // Returns null when the label cannot be read (then it is only compared by label).
    public static (DateTime Start, DateTime End)? RangeOf(DateTime? start, DateTime? end, string label)
    {
        if (start is { } s && end is { } e) return (s.Date, e.Date);
        if (DateTime.TryParseExact(label, "MMMM yyyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var m))
            return (m, m.AddMonths(1).AddDays(-1));
        return null;
    }

    // True when two date ranges share at least one day.
    public static bool Overlaps((DateTime Start, DateTime End) a, (DateTime Start, DateTime End) b)
        => a.Start <= b.End && b.Start <= a.End;

    /// <summary>Expected release = today + 3 days, moved forward past Saturday/Sunday.</summary>
    public static DateTime CalculateReleaseDate(DateTime today)
    {
        var d = today.Date.AddDays(3);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d;
    }

    // Unique payment reference, e.g. PAY-20260301-0042-093015123 (date, scholar id, time).
    public static string ReferenceNumber(DateTime now, int scholarId)
        => $"PAY-{now:yyyyMMdd}-{scholarId:D4}-{now:HHmmssfff}";

    // A scholar can be paid when: Active + all documents Approved + has a stipend + not paid yet this period.
    public static bool IsEligible(string scholarStatus, IReadOnlyCollection<string> complianceStatuses, decimal stipend, bool alreadyPaid)
        => scholarStatus == "Active" && ComplianceRules.IsComplete(complianceStatuses) && stipend > 0 && !alreadyPaid;
}

public static class ScholarRules
{
    // "Juan", "Santos", "Cruz" -> "Juan Santos Cruz" (empty parts are skipped).
    public static string FullName(string first, string? middle, string last, string? suffix = null)
        => $"{first} {middle} {last} {suffix}".Replace("  ", " ").Trim();

    /// <summary>The suffix is stored appended to the last name ("Reyes Jr.").</summary>
    public static string LastNameWithSuffix(string last, string? suffix)
        => string.IsNullOrWhiteSpace(suffix) ? last.Trim() : $"{last.Trim()} {suffix.Trim()}";

    /// <summary>Next scholar number: SCH-{year}-{max suffix + 1}. Uses MAX, not COUNT, so deletions can't cause duplicates.</summary>
    public static string NextScholarNumber(int year, IEnumerable<string> existing)
    {
        var prefix = $"SCH-{year}-";
        var max = existing
            .Where(n => n.StartsWith(prefix, StringComparison.Ordinal))
            .Select(n => int.TryParse(n[prefix.Length..], out var v) ? v : 0)
            .DefaultIfEmpty(0).Max();
        return $"{prefix}{max + 1:D3}";
    }

    // Student id made from year + sequence, e.g. 2026-000042. Also used as the login username.
    public static string GeneratedStudentId(int year, int sequence) => $"{year}-{sequence:D6}";

    // "SCH-2026-042" -> 42.
    public static int SequenceOf(string scholarNumber)
        => int.TryParse(scholarNumber[(scholarNumber.LastIndexOf('-') + 1)..], out var v) ? v : 0;

    /// <summary>Random 12 character temporary password (replaces the legacy guessable Name+symbol pattern).</summary>
    public static string GeneratePassword()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
        return string.Create(12, chars, (span, c) =>
        {
            for (var i = 0; i < span.Length; i++) span[i] = c[RandomNumberGenerator.GetInt32(c.Length)];
        });
    }

    // "+63 912-345-6789" -> "09123456789" (one format for every stored mobile number).
    // Password rule for sign-up: at least 8 characters with a letter and a number.
    // Returns what is wrong, or null when the password is fine.
    public static string? PasswordProblem(string password)
    {
        if (password.Length < 8) return "Your password must be at least 8 characters long.";
        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit)) return "Your password must contain at least one letter and one number.";
        return null;
    }

    public static string NormalizePhone(string phone)
    {
        var p = phone.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "").Replace("+", "");
        return p.StartsWith("63") ? "0" + p[2..] : p;
    }

    // Next expected payment date, based on how often the scholarship pays.
    public static string NextPaymentDate(string? frequency, DateTime now)
    {
        const string f = "MMM dd, yyyy";
        var ci = CultureInfo.InvariantCulture;
        switch ((frequency ?? "Monthly").ToLowerInvariant())
        {
            case "weekly": return now.AddDays(7).ToString(f, ci);
            case "bi-weekly": return now.AddDays(14).ToString(f, ci);
            case "quarterly":
            {
                var q = (now.Month - 1) / 3 + 1;
                var month = q * 3 + 1;
                var d = month > 12 ? new DateTime(now.Year + 1, 1, 1) : new DateTime(now.Year, month, 1);
                return d.ToString(f, ci);
            }
            case "semester":
            case "semi-annual":
                return (now.Month <= 6 ? new DateTime(now.Year, 7, 1) : new DateTime(now.Year + 1, 1, 1)).ToString(f, ci);
            case "annual":
            case "yearly":
                return new DateTime(now.Year + 1, 1, 1).ToString(f, ci);
            default:
                return new DateTime(now.Year, now.Month, 1).AddMonths(1).ToString(f, ci);
        }
    }
}

// Writes a peso amount in words for printed receipts.
public static class AmountWords
{
    private static readonly string[] Ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    private static readonly string[] Teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    private static readonly string[] Tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    private static readonly string[] Scales = ["", "Thousand", "Million", "Billion"];

    public static string ToWords(decimal amount)
    {
        if (amount == 0) return "Zero Pesos Only";
        var whole = (long)amount;
        var centavos = (int)Math.Round((amount - whole) * 100);
        var words = "";
        if (whole == 0) words = "Zero";
        else
        {
            var idx = 0;
            // Work in groups of three digits: ones, then thousands, then millions...
            while (whole > 0)
            {
                var part = (int)(whole % 1000);
                if (part > 0)
                {
                    var pw = "";
                    if (part >= 100) { pw += Ones[part / 100] + " Hundred "; part %= 100; }
                    if (part is >= 10 and < 20) pw += Teens[part - 10] + " ";
                    else
                    {
                        if (part >= 20) pw += Tens[part / 10] + " ";
                        if (part % 10 > 0) pw += Ones[part % 10] + " ";
                    }
                    words = (pw + Scales[idx] + " " + words).Trim() + " ";
                }
                whole /= 1000; idx++;
            }
        }
        words = words.Trim() + " Pesos";
        return centavos > 0 ? $"{words} and {centavos}/100 Centavos" : $"{words} Only";
    }
}
