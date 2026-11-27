using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Services;
using IskolarAid.Data.Entities;

namespace IskolarAid.Tests;

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
        Assert.Equal("Pending", user.AccountStatus); // activated later by sign-up
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
    private static PayrollRequestDto Req(params int[] ids) => new() { PeriodStart = new DateTime(2026, 3, 1), PeriodEnd = new DateTime(2026, 3, 31), Method = "Bank Transfer", ScholarIds = [.. ids] };

    [Fact]
    public async Task Only_scholars_with_fully_approved_compliance_are_eligible_and_amount_comes_from_the_type()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync(amount: 4200);
        var ok = await f.AddScholarAsync(t.Id, "Approved");
        var no = await f.AddScholarAsync(t.Id, "Pending", number: "SCH-2026-002");
        var list = await f.Payroll.CandidatesAsync(new DateTime(2026, 3, 1), new DateTime(2026, 3, 31), null, null, null);
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
    public async Task Newly_processed_payment_appears_in_reports_ending_today_even_though_it_releases_later()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync(amount: 5000);
        var s = await f.AddScholarAsync(t.Id, "Approved");
        await f.Payroll.ProcessAsync(Req(s.Id));
        Assert.True((await f.Db.Payments.SingleAsync()).ReleaseDate > DateTime.Today);

        var reports = new ReportService(f.Db, f.Log);
        foreach (var type in new[] { "Payment History Report", "Payroll Summary Report" })
        {
            var r = await reports.GenerateAsync(new ReportQuery { Type = type, From = DateTime.Today.AddDays(-30), To = DateTime.Today });
            Assert.Single(r.Rows);
        }
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

public class SignUpAndPeriodTests
{
    [Fact]
    public async Task Sign_up_matches_scholar_id_with_student_id_or_email_and_activates_once()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var created = await f.Scholars.CreateAsync(new ScholarSaveDto
        {
            FirstName = "Ana", LastName = "Lim", Email = "ana@x.ph", Course = "Bachelor of Science in Criminology", YearLevel = "1st Year", ScholarshipTypeId = t.Id
        });
        // Pending accounts cannot log in yet.
        await Assert.ThrowsAsync<AppException>(() => f.Auth.LoginAsync(created.StudentId, "anything1"));
        // Wrong Student ID / email -> not found.
        Assert.Equal(404, (await Assert.ThrowsAsync<AppException>(() => f.Auth.SignUpAsync(created.ScholarNumber, "nope@x.ph", "Scholar2026"))).StatusCode);

        var r = await f.Auth.SignUpAsync(created.ScholarNumber.ToLowerInvariant(), created.StudentId, "Scholar2026");
        Assert.Equal("Active", r.User.AccountStatus);
        Assert.Equal(created.Id, (await f.Auth.LoginAsync(created.StudentId, "Scholar2026")).Scholar!.Id);
        // A second sign-up for the same scholar is refused.
        Assert.Equal(409, (await Assert.ThrowsAsync<AppException>(() => f.Auth.SignUpAsync(created.ScholarNumber, "ana@x.ph", "Other2026"))).StatusCode);
    }

    [Fact]
    public async Task Old_scholars_without_a_login_get_one_on_sign_up()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id);
        var r = await f.Auth.SignUpAsync(s.ScholarNumber, "JUAN@x.ph", "Scholar2026");
        Assert.Equal(s.ScholarNumber, r.User.Username); // no Student ID on file -> Scholar ID is the username
        Assert.Equal(r.User.Id, (await f.Db.Scholars.FindAsync(s.Id))!.UserId);
    }

    [Fact]
    public async Task A_payment_covering_part_of_the_period_counts_as_already_paid()
    {
        using var f = new Fixture();
        var s = await f.AddScholarAsync((await f.AddTypeAsync()).Id);
        // An old payment that only has a month label.
        f.Db.Payments.Add(new Payment { ScholarId = s.Id, PaymentPeriod = "March 2026", Amount = 5000, Status = "Released" });
        await f.Db.SaveChangesAsync();

        var march2nd = await f.Payroll.CandidatesAsync(new DateTime(2026, 3, 16), new DateTime(2026, 3, 31), null, null, null);
        Assert.False(march2nd.Single().IsEligible);
        var april = await f.Payroll.CandidatesAsync(new DateTime(2026, 4, 1), new DateTime(2026, 4, 15), null, null, null);
        Assert.True(april.Single().IsEligible);

        var result = await f.Payroll.ProcessAsync(new PayrollRequestDto { PeriodStart = new DateTime(2026, 4, 1), PeriodEnd = new DateTime(2026, 4, 15), Method = "Cash", ScholarIds = [s.Id] });
        Assert.Equal("Apr 01-15, 2026", result.Period);
        var p = await f.Db.Payments.SingleAsync(x => x.PaymentPeriod == result.Period);
        Assert.Equal((new DateTime(2026, 4, 1), new DateTime(2026, 4, 15)), (p.PeriodStart, p.PeriodEnd));
        // The second half of April does not overlap, the whole of April does.
        Assert.True((await f.Payroll.CandidatesAsync(new DateTime(2026, 4, 16), new DateTime(2026, 4, 30), null, null, null)).Single().IsEligible);
        Assert.False((await f.Payroll.CandidatesAsync(new DateTime(2026, 4, 1), new DateTime(2026, 4, 30), null, null, null)).Single().IsEligible);
    }

    [Fact]
    public async Task Scholarship_catalog_is_added_once()
    {
        using var f = new Fixture();
        await f.AddTypeAsync("Tulong Dunong Program");
        var first = await ScholarshipTypeService.EnsureCatalogAsync(f.Db);
        Assert.Equal(ScholarshipCatalog.Entries.Length - 1, first); // the TDP entry matches the older short name
        Assert.Equal(0, await ScholarshipTypeService.EnsureCatalogAsync(f.Db));
    }

    [Fact]
    public void Word_export_is_a_valid_docx_package()
    {
        var bytes = Docx.Table("Test <Report> & more", ["A", "B"], [["1", "x & y"]]);
        using var zip = new System.IO.Compression.ZipArchive(new MemoryStream(bytes));
        Assert.NotNull(zip.GetEntry("[Content_Types].xml"));
        using var doc = new StreamReader(zip.GetEntry("word/document.xml")!.Open());
        var xml = System.Xml.Linq.XDocument.Parse(doc.ReadToEnd()); // throws if the XML is broken
        Assert.Contains("Test <Report> & more", xml.Root!.Value);
    }
}


public class ScholarImportTests
{
    // Builds a tiny .xlsx in memory (same structure Excel writes: shared strings + one sheet).
    private static MemoryStream Xlsx(string[] header, string[][] rows)
    {
        var strings = new List<string>();
        string Cell(string col, int row, string v)
        {
            if (double.TryParse(v, out _) && !v.Contains('-') && !v.Contains('/')) return $"<c r=\"{col}{row}\"><v>{v}</v></c>";
            strings.Add(v); return $"<c r=\"{col}{row}\" t=\"s\"><v>{strings.Count - 1}</v></c>";
        }
        var sb = new System.Text.StringBuilder();
        var all = new[] { header }.Concat(rows).ToArray();
        for (var r = 0; r < all.Length; r++)
            sb.Append($"<row r=\"{r + 1}\">" + string.Concat(all[r].Select((v, c) => v == "" ? "" : Cell(((char)('A' + c)).ToString(), r + 1, v))) + "</row>");
        var ms = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
        {
            void Add(string n, string x) { using var w = new StreamWriter(zip.CreateEntry(n).Open()); w.Write(x); }
            Add("xl/workbook.xml", "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"S\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            Add("xl/_rels/workbook.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
            Add("xl/sharedStrings.xml", "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" + string.Concat(strings.Select(s => $"<si><t>{System.Security.SecurityElement.Escape(s)}</t></si>")) + "</sst>");
            Add("xl/worksheets/sheet1.xml", "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>" + sb + "</sheetData></worksheet>");
        }
        ms.Position = 0; return ms;
    }

    private static readonly string[] Header = ["SEQ.", "AWARD NUMBER", "LAST NAME", "FIRST NAME", "EXTENSION NAME", "MIDDLE NAME", "COURSE", "YEAR LEVEL", "SEX", "BIRTH DATE (YYYY/MM/DD)", "EMAIL ADDRESS", "CONTACT NUMBER", "STATUS", "REMARKS", "BILLED AMOUNT"];
    private static string[] Row(string seq, string last, string first, string ext, string email, string status = "ACTIVE")
        => [seq, "TES-" + seq, last, first, ext, "DE VERA", "BACHELOR OF SCIENCE MAJOR IN CRIMINOLOGY", "2nd Year", "Male", "2003/08/06", email, "9913730753", status, "", "13500"];

    [Fact]
    public async Task Imports_cleans_names_phone_course_and_marks_inactive_but_skips_existing_on_rerun()
    {
        using var f = new Fixture();
        var rows = ScholarImporter.ParseRows(XlsxReader.ReadFirstSheet(Xlsx(Header, [
            Row("1", "ABILAY", "FRANK AUGUSTIN", "JR.", "Frank@X.ph"),
            Row("2", "SANTOS", "ANA", "NONE", "ana@x.ph", "Not enrolled with LOA")])));
        var r = await ScholarImporter.ImportAsync(f.Db, f.Passwords, rows, purgeSeed: false, year: 2026);

        Assert.Equal((2, 0, 1), (r.Created, r.Skipped, r.Inactive));
        var a = await f.Db.Scholars.Include(s => s.User).SingleAsync(s => s.ScholarNumber == "SCH-2026-001");
        Assert.Equal(("Frank Augustin", "Abilay Jr.", "frank@x.ph", "09913730753"), (a.FirstName, a.LastName, a.Email, a.ContactNumber));
        Assert.Equal("Bachelor of Science in Criminology", a.Course);
        Assert.Equal("Pending", a.User!.AccountStatus);
        Assert.Equal(13500, (await f.Db.ScholarshipTypes.SingleAsync()).StipendAmount);
        Assert.Equal("Inactive", (await f.Db.Scholars.SingleAsync(s => s.Email == "ana@x.ph")).Status);
        Assert.Equal(10, await f.Db.ComplianceRecords.CountAsync());
        Assert.Empty(f.Email.Sent); // no emails during an import

        // Running it again adds nobody; the new scholar can sign up with Scholar ID + email.
        Assert.Equal((0, 2), ((await ScholarImporter.ImportAsync(f.Db, f.Passwords, rows, false, 2026)) is var again ? (again.Created, again.Skipped) : default));
        Assert.Equal("Active", (await f.Auth.SignUpAsync("SCH-2026-001", "frank@x.ph", "Scholar2026")).User.AccountStatus);
    }

    [Fact]
    public async Task Purge_removes_only_the_fake_seeded_scholars()
    {
        using var f = new Fixture();
        var t = await f.AddTypeAsync();
        var fake = await f.AddScholarAsync(t.Id, "Approved");
        fake.Email = "x@seed.iskolaraid.test";
        var real = await f.AddScholarAsync(t.Id, "Approved", number: "SCH-2026-002");
        real.Email = "real@x.ph";
        await f.Db.SaveChangesAsync();

        Assert.Equal(1, await ScholarImporter.PurgeSeedDataAsync(f.Db));
        Assert.Equal(["real@x.ph"], await f.Db.Scholars.Select(s => s.Email!).ToListAsync());
        Assert.Equal(5, await f.Db.ComplianceRecords.CountAsync()); // only the real scholar's
    }
}
