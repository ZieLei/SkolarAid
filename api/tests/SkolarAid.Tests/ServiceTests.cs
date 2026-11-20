using Microsoft.EntityFrameworkCore;
using SkolarAid.Core.Common;
using SkolarAid.Core.Dtos;
using SkolarAid.Core.Services;
using SkolarAid.Data.Entities;

namespace SkolarAid.Tests;

public class PasswordAndAuthTests
{
    [Fact]
    public void Hash_round_trips_and_is_not_plaintext()
    {
        var p = new PasswordService();
        var h = p.Hash("S3cret!");
        Assert.NotEqual("S3cret!", h);
        Assert.True(PasswordService.IsHash(h));
        Assert.True(p.Verify(h, "S3cret!").Ok);
        Assert.False(p.Verify(h, "wrong").Ok);
    }

    [Fact]
    public async Task Legacy_plaintext_password_logs_in_once_and_is_rehashed()
    {
        using var f = new Fixture();
        var u = await f.AddUserAsync("admin", "plain-legacy", hashed: false);
        var r = await f.Auth.LoginAsync("admin", "plain-legacy");
        Assert.Equal(u.Id, r.User.Id);
        await f.Db.Entry(u).ReloadAsync();
        Assert.True(PasswordService.IsHash(u.Password));
        Assert.NotNull(u.LastLogin);
        await f.Auth.LoginAsync("admin", "plain-legacy"); // still works after rehash
    }

    [Fact]
    public async Task Wrong_password_and_unknown_user_give_the_same_401()
    {
        using var f = new Fixture();
        await f.AddUserAsync("admin", "right");
        var a = await Assert.ThrowsAsync<AppException>(() => f.Auth.LoginAsync("admin", "nope"));
        var b = await Assert.ThrowsAsync<AppException>(() => f.Auth.LoginAsync("ghost", "nope"));
        Assert.Equal(401, a.StatusCode);
        Assert.Equal(a.Message, b.Message);
    }

    [Fact]
    public async Task Inactive_account_is_blocked()
    {
        using var f = new Fixture();
        await f.AddUserAsync("old", "pw", status: "Inactive");
        var ex = await Assert.ThrowsAsync<AppException>(() => f.Auth.LoginAsync("old", "pw"));
        Assert.Equal(403, ex.StatusCode);
    }

    [Fact]
    public async Task Scholar_login_needs_an_active_scholar_profile()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var u = await f.AddUserAsync("2026-000001", "pw", "SCHOLAR");
        var s = await f.AddScholarAsync(t.Id);
        await Assert.ThrowsAsync<AppException>(() => f.Auth.LoginAsync("2026-000001", "pw")); // not linked yet
        s.UserId = u.Id; await f.Db.SaveChangesAsync();
        Assert.Equal(s.Id, (await f.Auth.LoginAsync("2026-000001", "pw")).Scholar!.Id);
        s.Status = "Inactive"; await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<AppException>(() => f.Auth.LoginAsync("2026-000001", "pw"));
    }
}

public class ScholarServiceTests
{
    private static ScholarSaveDto Dto(int typeId, string? studentId = null) => new()
    {
        StudentId = studentId, FirstName = "Maria", LastName = "Reyes", Suffix = "Jr.", Email = "maria@x.ph", ContactNumber = "09170000000",
        Course = "Bachelor of Science in Criminology", YearLevel = "1st Year", ScholarshipTypeId = typeId, StipendAmount = 5000
    };

    [Fact]
    public async Task Create_makes_user_five_compliance_records_and_numbers_sequentially()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var a = await f.Scholars.CreateAsync(Dto(t.Id));
        var b = await f.Scholars.CreateAsync(Dto(t.Id));
        var year = DateTime.Now.Year;
        Assert.Equal($"SCH-{year}-001", a.ScholarNumber);
        Assert.Equal($"SCH-{year}-002", b.ScholarNumber);
        Assert.Equal($"{year}-000001", a.StudentId);
        Assert.Equal(5, await f.Db.ComplianceRecords.CountAsync(c => c.ScholarId == a.Id && c.Status == "Pending"));
        var user = await f.Db.Users.SingleAsync(u => u.Username == a.StudentId);
        Assert.Equal("SCHOLAR", user.Role);
        Assert.True(PasswordService.IsHash(user.Password));
        Assert.Equal(12, a.TemporaryPassword.Length);
        Assert.Contains(f.Email.Sent, e => e.StartsWith("maria@x.ph"));
        Assert.Equal("Reyes Jr.", (await f.Db.Scholars.FindAsync(a.Id))!.LastName);
    }

    [Fact]
    public async Task Duplicate_student_id_is_rejected()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        await f.Scholars.CreateAsync(Dto(t.Id, "2024-1111"));
        var ex = await Assert.ThrowsAsync<AppException>(() => f.Scholars.CreateAsync(Dto(t.Id, "2024-1111")));
        Assert.Equal(409, ex.StatusCode);
    }

    [Fact]
    public async Task Toggle_status_switches_between_active_and_inactive()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id);
        Assert.Equal("Inactive", await f.Scholars.ToggleStatusAsync(s.Id));
        Assert.Equal("Active", await f.Scholars.ToggleStatusAsync(s.Id));
    }
}

public class ComplianceServiceTests
{
    [Fact]
    public async Task Opening_compliance_creates_the_five_default_requirements_once()
    {
        using var f = new Fixture();
        var s = new Scholar { FirstName = "A", LastName = "B", ScholarNumber = "SCH-2026-001" };
        f.Db.Scholars.Add(s); await f.Db.SaveChangesAsync();
        await f.Compliance.EnsureDefaultsAsync(s.Id);
        await f.Compliance.EnsureDefaultsAsync(s.Id);
        Assert.Equal(5, await f.Db.ComplianceRecords.CountAsync(c => c.ScholarId == s.Id));
    }

    [Fact]
    public async Task Upload_replaces_file_and_marks_submitted_then_delete_resets_to_pending()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id, "Pending");
        var rec = await f.Db.ComplianceRecords.FirstAsync(c => c.ScholarId == s.Id);
        await f.Compliance.UploadAsync(rec.Id, "a.pdf", [1, 2, 3]);
        await f.Compliance.UploadAsync(rec.Id, "b.pdf", [4, 5]);
        Assert.Equal(1, await f.Db.FileAttachments.CountAsync(x => x.ComplianceId == rec.Id));
        await f.Db.Entry(rec).ReloadAsync();
        Assert.Equal("Submitted", rec.Status);
        Assert.Equal("b.pdf", (await f.Compliance.DownloadAsync(rec.Id)).Name);
        await f.Compliance.DeleteFileAsync(rec.Id);
        await f.Db.Entry(rec).ReloadAsync();
        Assert.Equal("Pending", rec.Status);
        Assert.Null(rec.FilePath);
    }

    [Fact]
    public async Task Disallowed_file_types_are_rejected()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id, "Pending");
        var rec = await f.Db.ComplianceRecords.FirstAsync(c => c.ScholarId == s.Id);
        await Assert.ThrowsAsync<AppException>(() => f.Compliance.UploadAsync(rec.Id, "evil.exe", [1]));
    }

    [Fact]
    public async Task Approving_sets_date_submitted_and_checker()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id, "Pending");
        var rec = await f.Db.ComplianceRecords.FirstAsync(c => c.ScholarId == s.Id);
        f.Current.UserId = null;
        await f.Compliance.UpdateStatusAsync(rec.Id, "Approved", "ok");
        await f.Db.Entry(rec).ReloadAsync();
        Assert.Equal("Approved", rec.Status);
        Assert.Equal(DateTime.Today, rec.DateSubmitted);
    }

    [Fact]
    public async Task Scholar_view_marks_past_due_pending_as_overdue()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id, "Pending");
        foreach (var c in f.Db.ComplianceRecords.Where(c => c.ScholarId == s.Id)) c.DueDate = DateTime.Today.AddDays(-2);
        await f.Db.SaveChangesAsync();
        var r = await f.Compliance.ListForSelfAsync(s.Id);
        Assert.Equal(5, r.Overdue);
    }

    [Fact]
    public async Task Scholar_cannot_upload_to_someone_elses_requirement()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var mine = await f.AddScholarAsync(t.Id, "Pending");
        var other = await f.AddScholarAsync(t.Id, "Pending", number: "SCH-2026-002");
        var theirs = await f.Db.ComplianceRecords.FirstAsync(c => c.ScholarId == other.Id);
        var ex = await Assert.ThrowsAsync<AppException>(() => f.Compliance.UploadForSelfAsync(mine.Id, theirs.Id, "a.pdf", [1]));
        Assert.Equal(404, ex.StatusCode);
    }
}

public class PayrollServiceTests
{
    private static PayrollRequestDto Req(params int[] ids) => new() { PeriodDate = new DateTime(2026, 3, 1), Method = "Bank Transfer", ScholarIds = [.. ids] };

    [Fact]
    public async Task Only_scholars_with_fully_approved_compliance_are_eligible_and_amount_comes_from_the_type()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync(amount: 4200);
        var ok = await f.AddScholarAsync(t.Id, "Approved");
        var no = await f.AddScholarAsync(t.Id, "Pending", number: "SCH-2026-002");
        var list = await f.Payroll.CandidatesAsync(new DateTime(2026, 3, 1), null, null, null);
        Assert.True(list.Single(c => c.Id == ok.Id).IsEligible);
        Assert.Equal(4200, list.Single(c => c.Id == ok.Id).StipendAmount);
        Assert.False(list.Single(c => c.Id == no.Id).IsEligible);
    }

    [Fact]
    public async Task Process_creates_processed_payment_notification_and_skips_ineligible_and_duplicates()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync(amount: 5000);
        var ok = await f.AddScholarAsync(t.Id, "Approved");
        var no = await f.AddScholarAsync(t.Id, "Pending", number: "SCH-2026-002");

        var r = await f.Payroll.ProcessAsync(Req(ok.Id, no.Id));
        Assert.Equal((1, 1, 5000m, "March 2026"), (r.Processed, r.Skipped, r.Total, r.Period));
        var pay = await f.Db.Payments.SingleAsync();
        Assert.Equal("Processed", pay.Status);
        Assert.StartsWith("PAY-", pay.ReferenceNumber);
        Assert.True(pay.ReleaseDate > DateTime.Today);
        Assert.Equal(1, await f.Db.Notifications.CountAsync(n => n.RecipientId == ok.Id && n.Title == "Payment Processed"));
        Assert.Single(f.Email.Sent);

        var again = await f.Payroll.ProcessAsync(Req(ok.Id)); // double disbursement guard
        Assert.Equal(0, again.Processed);
        Assert.Equal(1, await f.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task Release_only_pays_out_processed_payments_whose_release_date_has_arrived()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var s = await f.AddScholarAsync(t.Id);
        await f.Payroll.ProcessAsync(Req(s.Id));
        await Assert.ThrowsAsync<AppException>(() => f.Payroll.ReleaseAsync(null)); // release date is days away

        var pay = await f.Db.Payments.SingleAsync();
        pay.ReleaseDate = DateTime.Today.AddDays(-1); await f.Db.SaveChangesAsync();
        var r = await f.Payroll.ReleaseAsync(null);
        Assert.Equal(1, r.Released);
        await f.Db.Entry(pay).ReloadAsync();
        Assert.Equal("Released", pay.Status);
        Assert.Equal(DateTime.Today, pay.ReleaseDate);
        Assert.Equal(1, await f.Db.Notifications.CountAsync(n => n.Title.Contains("Payment Released")));
        await Assert.ThrowsAsync<AppException>(() => f.Payroll.ReleaseAsync(null)); // cannot release twice
    }

    [Fact]
    public async Task Inactive_scholar_is_never_paid()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id, status: "Inactive");
        Assert.Equal(0, (await f.Payroll.ProcessAsync(Req(s.Id))).Processed);
    }
}

public class RegistrationServiceTests
{
    private static RegistrationSubmitDto Dto(int typeId) => new()
    {
        StudentId = "2026-777", FirstName = "Ana", LastName = "Lim", Email = "ana@x.ph", ContactNumber = "0917", Gender = "Female",
        DegreeProgram = "Bachelor of Science in Criminology", YearLevel = "1st Year", ScholarshipTypeId = typeId
    };

    private static List<RegistrationFile> Files(params string[] keys) =>
        keys.Select(k => new RegistrationFile { Key = k, FileName = $"{k}.pdf", Content = new MemoryStream([1, 2, 3]) }).ToList();

    [Fact]
    public async Task Required_documents_are_enforced()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        await Assert.ThrowsAsync<AppException>(() => f.Registrations().SubmitAsync(Dto(t.Id), Files("PSA", "COE")));
    }

    [Fact]
    public async Task Submit_copies_stipend_from_type_and_keeps_student_id()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync(amount: 6100);
        var id = await f.Registrations().SubmitAsync(Dto(t.Id), Files("PSA", "COE", "COR"));
        var r = await f.Db.ScholarRegistrations.FindAsync(id);
        Assert.Equal("Pending", r!.Status);
        Assert.Equal(6100, r.StipendAmount);
        Assert.Equal("2026-777", r.StudentId);
    }

    [Fact]
    public async Task Approve_creates_account_with_documents_and_cannot_be_repeated()
    {
        using var f = new Fixture();
        var store = new MemoryFileStore();
        var t = await f.AddTypeAsync();
        var svc = f.Registrations(store);
        var id = await svc.SubmitAsync(Dto(t.Id), Files("PSA", "COE", "COR"));

        var res = await svc.ApproveAsync(id);
        Assert.Equal("2026-777", res.StudentId);
        Assert.True(res.EmailSent);
        Assert.Equal("Approved", (await f.Db.ScholarRegistrations.FindAsync(id))!.Status);
        var scholar = await f.Db.Scholars.SingleAsync();
        Assert.NotNull(scholar.UserId);
        Assert.Equal(3, await f.Db.ComplianceRecords.CountAsync(c => c.ScholarId == scholar.Id && c.Status == "Submitted"));
        Assert.Equal(2, await f.Db.ComplianceRecords.CountAsync(c => c.ScholarId == scholar.Id && c.Status == "Pending"));
        Assert.Equal(3, await f.Db.FileAttachments.CountAsync());

        var ex = await Assert.ThrowsAsync<AppException>(() => svc.ApproveAsync(id));
        Assert.Equal(409, ex.StatusCode);
        Assert.Equal(1, await f.Db.Scholars.CountAsync());
    }

    [Fact]
    public async Task Reject_stores_reason_and_blocks_later_approval()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var svc = f.Registrations();
        var id = await svc.SubmitAsync(Dto(t.Id), Files("PSA", "COE", "COR"));
        Assert.True(await svc.RejectAsync(id, "Incomplete documents", true));
        var r = await f.Db.ScholarRegistrations.FindAsync(id);
        Assert.Equal(("Rejected", "Incomplete documents"), (r!.Status, r.RejectionReason));
        await Assert.ThrowsAsync<AppException>(() => svc.ApproveAsync(id));
    }
}

public class ReportAndCsvTests
{
    [Fact]
    public void Csv_escapes_commas_quotes_and_formula_injection()
    {
        var bytes = Csv.Write(["A", "B"], [["x,y", "say \"hi\""], ["=cmd()", "5"]]);
        var text = System.Text.Encoding.UTF8.GetString(bytes).TrimStart('﻿');
        Assert.Contains("\"x,y\",\"say \"\"hi\"\"\"", text);
        Assert.Contains("'=cmd()", text);
    }

    [Fact]
    public async Task Activity_log_filters_by_date_and_user()
    {
        using var f = new Fixture();
        await f.Log.LogAsync("LOGIN", "x logged in", userName: "x");
        await f.Log.LogAsync("CREATE", "made a thing", userName: "y");
        var q = new ActivityLogQueryService(f.Db, f.Log);
        var all = await q.ListAsync(DateTime.Today, DateTime.Today, null, null, null, 1);
        Assert.Equal(2, all.Total);
        var one = await q.ListAsync(DateTime.Today, DateTime.Today, "login", "x", null, 1);
        Assert.Equal(1, one.Total);
    }

    [Fact]
    public async Task Dashboard_counts_active_scholars_and_released_total()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var s = await f.AddScholarAsync(t.Id);
        f.Db.Payments.Add(new Payment { ScholarId = s.Id, PaymentPeriod = "March 2026", Amount = 1500, Status = "Released", ReleaseDate = DateTime.Today });
        f.Db.Payments.Add(new Payment { ScholarId = s.Id, PaymentPeriod = "April 2026", Amount = 900, Status = "Processed" });
        await f.Db.SaveChangesAsync();
        var d = await new DashboardService(f.Db).StatsAsync();
        Assert.Equal((1, 1, 1500m, 1), (d.TotalScholars, d.ActiveScholarships, d.TotalDisbursed, d.PendingPayments));
    }
}
