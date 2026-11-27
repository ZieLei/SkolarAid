using IskolarAid.Core.Rules;

namespace IskolarAid.Tests;

public class ComplianceRulesTests
{
    [Fact] public void No_records_is_not_complete() => Assert.Equal("No Records", ComplianceRules.Summarize([]));
    [Fact] public void All_approved_is_complete() => Assert.True(ComplianceRules.IsComplete(["Approved", "Approved"]));
    [Theory]
    [InlineData("Approved", "Pending")]
    [InlineData("Approved", "Submitted")]
    [InlineData("Approved", "Overdue")]
    [InlineData("Approved", "Rejected")] // strict rule: a rejected record blocks payroll
    public void Any_non_approved_record_blocks_payroll(string a, string b) => Assert.False(ComplianceRules.IsComplete([a, b]));
    [Fact] public void None_approved_is_pending_approval() => Assert.Equal("Pending Approval", ComplianceRules.Summarize(["Pending", "Submitted"]));

    [Fact]
    public void Only_pending_items_past_due_become_overdue()
    {
        var today = new DateTime(2026, 5, 10);
        Assert.True(ComplianceRules.ShouldBecomeOverdue("Pending", today.AddDays(-1), today));
        Assert.False(ComplianceRules.ShouldBecomeOverdue("Pending", today, today));
        Assert.False(ComplianceRules.ShouldBecomeOverdue("Submitted", today.AddDays(-30), today));
    }

    [Theory] [InlineData(0, 0, 0)] [InlineData(5, 2, 40)] [InlineData(3, 3, 100)]
    public void Compliance_rate(int total, int done, int expected) => Assert.Equal(expected, ComplianceRules.ComplianceRate(total, done));
}

public class PayrollRulesTests
{
    [Fact] public void Period_label_is_month_name_and_year() => Assert.Equal("March 2026", PayrollRules.PeriodLabel(new DateTime(2026, 3, 15)));

    [Theory]
    [InlineData("2026-05-04", "2026-05-07")] // Mon -> Thu
    [InlineData("2026-05-06", "2026-05-11")] // Wed -> Sat -> Mon
    [InlineData("2026-05-07", "2026-05-11")] // Thu -> Sun -> Mon
    [InlineData("2026-05-08", "2026-05-11")] // Fri -> Mon
    public void Release_date_is_three_days_out_and_skips_weekends(string today, string expected)
        => Assert.Equal(DateTime.Parse(expected), PayrollRules.CalculateReleaseDate(DateTime.Parse(today)));

    [Fact]
    public void Reference_number_has_legacy_format()
        => Assert.Equal("PAY-20260315-0042-093005123", PayrollRules.ReferenceNumber(new DateTime(2026, 3, 15, 9, 30, 5, 123), 42));

    [Theory]
    [InlineData("Active", true, 5000, false, true)]
    [InlineData("Inactive", true, 5000, false, false)]
    [InlineData("Active", false, 5000, false, false)]
    [InlineData("Active", true, 0, false, false)]
    [InlineData("Active", true, 5000, true, false)]
    public void Eligibility(string status, bool complete, decimal stipend, bool paid, bool expected)
        => Assert.Equal(expected, PayrollRules.IsEligible(status, complete ? ["Approved"] : ["Pending"], stipend, paid));
}

public class ScholarRulesTests
{
    [Fact] public void First_scholar_of_the_year_is_001() => Assert.Equal("SCH-2026-001", ScholarRules.NextScholarNumber(2026, []));

    [Fact]
    public void Next_number_uses_max_not_count()
        => Assert.Equal("SCH-2026-008", ScholarRules.NextScholarNumber(2026, ["SCH-2026-001", "SCH-2026-007", "SCH-2025-050"]));

    [Fact] public void Suffix_is_appended_to_last_name() => Assert.Equal("Reyes Jr.", ScholarRules.LastNameWithSuffix("Reyes", "Jr."));
    [Fact] public void No_suffix_keeps_last_name() => Assert.Equal("Reyes", ScholarRules.LastNameWithSuffix(" Reyes ", " "));
    [Fact] public void Full_name_collapses_blank_middle_name() => Assert.Equal("Ana Lim", ScholarRules.FullName("Ana", "", "Lim"));
    [Fact] public void Generated_student_id_format() => Assert.Equal("2026-000012", ScholarRules.GeneratedStudentId(2026, 12));
    [Fact] public void Sequence_is_read_from_scholar_number() => Assert.Equal(7, ScholarRules.SequenceOf("SCH-2026-007"));

    [Theory]
    [InlineData("+63 917-123-4567", "09171234567")]
    [InlineData("09171234567", "09171234567")]
    public void Phone_normalisation(string input, string expected) => Assert.Equal(expected, ScholarRules.NormalizePhone(input));

    [Fact]
    public void Generated_passwords_are_12_chars_and_differ()
    {
        var a = ScholarRules.GeneratePassword(); var b = ScholarRules.GeneratePassword();
        Assert.Equal(12, a.Length);
        Assert.NotEqual(a, b);
    }

    [Theory]
    [InlineData("Monthly", "2026-05-15", "Jun 01, 2026")]
    [InlineData("Quarterly", "2026-05-15", "Jul 01, 2026")]
    [InlineData("Quarterly", "2026-11-15", "Jan 01, 2027")]
    [InlineData("Semi-Annual", "2026-03-01", "Jul 01, 2026")]
    [InlineData("Semi-Annual", "2026-09-01", "Jan 01, 2027")]
    [InlineData("Annual", "2026-09-01", "Jan 01, 2027")]
    [InlineData("Weekly", "2026-05-15", "May 22, 2026")]
    public void Next_payment_date(string freq, string now, string expected)
        => Assert.Equal(expected, ScholarRules.NextPaymentDate(freq, DateTime.Parse(now)));
}

public class AmountWordsTests
{
    [Theory]
    [InlineData(0, "Zero Pesos Only")]
    [InlineData(5000, "Five Thousand Pesos Only")]
    [InlineData(1234.50, "One Thousand Two Hundred Thirty Four Pesos and 50/100 Centavos")]
    [InlineData(15, "Fifteen Pesos Only")]
    [InlineData(2000000, "Two Million Pesos Only")]
    public void Words(double amount, string expected) => Assert.Equal(expected, AmountWords.ToWords((decimal)amount));
}

public class SmtpTlsModeTests
{
    [Theory]
    [InlineData("smtp.gmail.com", 587, MailKit.Security.SecureSocketOptions.StartTls)]
    [InlineData("smtp.gmail.com", 465, MailKit.Security.SecureSocketOptions.SslOnConnect)]
    [InlineData("127.0.0.1", 1025, MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable)]
    [InlineData("localhost", 1025, MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable)]
    [InlineData("::1", 1025, MailKit.Security.SecureSocketOptions.StartTlsWhenAvailable)]
    [InlineData("10.0.0.5", 25, MailKit.Security.SecureSocketOptions.StartTls)]
    public void Only_a_local_server_may_skip_tls(string host, int port, MailKit.Security.SecureSocketOptions expected) =>
        Assert.Equal(expected, IskolarAid.Core.Services.SmtpEmailSender.TlsMode(new() { Host = host, Port = port }));
}

public class PaymentPeriodRulesTests
{
    [Theory]
    [InlineData("2026-03-01", "2026-03-31", "March 2026")]          // whole month: same label as old payments
    [InlineData("2026-03-01", "2026-03-15", "Mar 01-15, 2026")]
    [InlineData("2026-03-16", "2026-04-15", "Mar 16 - Apr 15, 2026")]
    [InlineData("2026-12-16", "2027-01-15", "Dec 16, 2026 - Jan 15, 2027")]
    public void Period_label(string start, string end, string expected)
        => Assert.Equal(expected, PayrollRules.PeriodLabel(DateTime.Parse(start), DateTime.Parse(end)));

    [Fact]
    public void Old_month_labels_are_read_as_the_whole_month()
        => Assert.Equal((new DateTime(2026, 2, 1), new DateTime(2026, 2, 28)), PayrollRules.RangeOf(null, null, "February 2026"));

    [Fact]
    public void Ranges_overlap_when_they_share_a_day()
    {
        var march = (new DateTime(2026, 3, 1), new DateTime(2026, 3, 31));
        Assert.True(PayrollRules.Overlaps(march, (new DateTime(2026, 3, 31), new DateTime(2026, 4, 15))));
        Assert.False(PayrollRules.Overlaps(march, (new DateTime(2026, 4, 1), new DateTime(2026, 4, 15))));
    }

    [Fact]
    public void End_before_start_is_refused() => Assert.NotNull(PayrollRules.PeriodProblem(new DateTime(2026, 3, 2), new DateTime(2026, 3, 1)));

    [Theory]
    [InlineData("short1", false)]
    [InlineData("onlyletters", false)]
    [InlineData("12345678", false)]
    [InlineData("Scholar2026", true)]
    public void Sign_up_password_rule(string password, bool ok) => Assert.Equal(ok, ScholarRules.PasswordProblem(password) is null);
}
