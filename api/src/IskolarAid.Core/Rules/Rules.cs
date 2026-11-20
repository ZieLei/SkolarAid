using System.Globalization;
using System.Security.Cryptography;

namespace IskolarAid.Core.Rules;

/// <summary>Business rules ported from the WinForms code-behind, as pure functions.</summary>
public static class ComplianceRules
{
    public static readonly string[] DefaultTypes =
        ["PSA Birth Certificate", "Enrollment Form", "COR", "Grades", "Scholarship Contract"];

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

    public static int ComplianceRate(int total, int completed) => total > 0 ? completed * 100 / total : 0;
}

public static class PayrollRules
{
    public static readonly string[] Methods = ["Bank Transfer", "Cash", "Mobile Wallet"];

    public static string PeriodLabel(DateTime date) => date.ToString("MMMM yyyy", CultureInfo.InvariantCulture);

    /// <summary>Expected release = today + 3 days, moved forward past Saturday/Sunday.</summary>
    public static DateTime CalculateReleaseDate(DateTime today)
    {
        var d = today.Date.AddDays(3);
        while (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) d = d.AddDays(1);
        return d;
    }

    public static string ReferenceNumber(DateTime now, int scholarId)
        => $"PAY-{now:yyyyMMdd}-{scholarId:D4}-{now:HHmmssfff}";

    public static bool IsEligible(string scholarStatus, IReadOnlyCollection<string> complianceStatuses, decimal stipend, bool alreadyPaid)
        => scholarStatus == "Active" && ComplianceRules.IsComplete(complianceStatuses) && stipend > 0 && !alreadyPaid;
}

public static class ScholarRules
{
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

    public static string GeneratedStudentId(int year, int sequence) => $"{year}-{sequence:D6}";

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

    public static string NormalizePhone(string phone)
    {
        var p = phone.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "").Replace("+", "");
        return p.StartsWith("63") ? "0" + p[2..] : p;
    }

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
