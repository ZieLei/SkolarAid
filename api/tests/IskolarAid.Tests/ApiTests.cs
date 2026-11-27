using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using IskolarAid.Core.Dtos;
using IskolarAid.Core.Services;
using IskolarAid.Data;

namespace IskolarAid.Tests;

public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _conn = new("DataSource=:memory:");

    public ApiFactory()
    {
        // Program.cs reads configuration while building, before test overrides apply, so use environment variables.
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", "Server=unused;Database=unused");
        Environment.SetEnvironmentVariable("Jwt__Key", "integration-test-key-integration-test-key-123456");
        Environment.SetEnvironmentVariable("Seed__AdminUsername", "admin");
        Environment.SetEnvironmentVariable("Seed__AdminPassword", "Adm1n!Pass");
        Environment.SetEnvironmentVariable("Uploads__Directory", Path.Combine(Path.GetTempPath(), "skolar-tests"));
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _conn.Open();
        builder.UseEnvironment("Development");
        builder.ConfigureServices(s =>
        {
            s.RemoveAll<DbContextOptions<IskolarDbContext>>();
            s.RemoveAll<IDbContextOptionsConfiguration<IskolarDbContext>>(); // EF Core 9 keeps the original provider config here
            s.RemoveAll<IskolarDbContext>();
            s.AddDbContext<IskolarDbContext>(o => o.UseSqlite(_conn));
            s.RemoveAll<IEmailSender>();
            s.AddScoped<IEmailSender, FakeEmail>();
            using var sp = s.BuildServiceProvider();
            using var scope = sp.CreateScope();
            scope.ServiceProvider.GetRequiredService<IskolarDbContext>().Database.EnsureCreated();
        });
    }

    protected override void Dispose(bool disposing) { base.Dispose(disposing); _conn.Dispose(); }
}

public class ApiTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<HttpClient> LoginAsync(string user, string pass)
    {
        var c = factory.CreateClient();
        var res = await c.PostAsJsonAsync("/api/auth/login", new LoginRequest(user, pass));
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<LoginResponse>();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.Token);
        return c;
    }

    [Fact]
    public async Task Anonymous_gets_401_on_protected_endpoints_but_can_read_active_types()
    {
        var c = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/admin/dashboard/stats")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/scholar/dashboard")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/scholarship-types/active")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task Bad_login_returns_401_problem_details()
    {
        var res = await factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest("admin", "wrong"));
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Contains("Invalid Student ID or Password", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Validation_errors_return_400()
    {
        var admin = await LoginAsync("admin", "Adm1n!Pass");
        var res = await admin.PostAsJsonAsync("/api/admin/scholarship-types", new { name = "", stipendAmount = 0, paymentFrequency = "Hourly" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Admin_to_scholar_end_to_end_with_role_separation()
    {
        var admin = await LoginAsync("admin", "Adm1n!Pass");
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/dashboard/stats")).StatusCode);

        var type = await (await admin.PostAsJsonAsync("/api/admin/scholarship-types",
            new ScholarshipTypeSaveDto { Name = "E2E Grant", StipendAmount = 4000, PaymentFrequency = "Monthly" })).Content.ReadFromJsonAsync<ScholarshipTypeDto>();

        var create = await admin.PostAsJsonAsync("/api/admin/scholars", new ScholarSaveDto
        {
            FirstName = "Eve", LastName = "Tester", Email = "eve@x.ph", Course = "Bachelor of Science in Criminology",
            YearLevel = "2nd Year", ScholarshipTypeId = type!.Id, StipendAmount = 4000
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<ScholarCreatedDto>();

        // The new account is "Pending": no login until the scholar signs up with their Scholar ID.
        var anon = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PostAsJsonAsync("/api/auth/login", new LoginRequest(created!.Username, "whatever1"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.PostAsJsonAsync("/api/auth/signup", new SignUpRequest(created.ScholarNumber, "wrong@x.ph", "Scholar2026"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await anon.PostAsJsonAsync("/api/auth/signup", new SignUpRequest(created.ScholarNumber, "eve@x.ph", "short"))).StatusCode);
        var signUp = await anon.PostAsJsonAsync("/api/auth/signup", new SignUpRequest(created.ScholarNumber, "EVE@x.ph", "Scholar2026"));
        Assert.Equal(HttpStatusCode.OK, signUp.StatusCode);
        Assert.Equal(created.Username, (await signUp.Content.ReadFromJsonAsync<LoginResponse>())!.User.Username);
        Assert.Equal(HttpStatusCode.Conflict, (await anon.PostAsJsonAsync("/api/auth/signup", new SignUpRequest(created.ScholarNumber, "eve@x.ph", "Scholar2027"))).StatusCode);
        var scholar = await LoginAsync(created.Username, "Scholar2026");
        var dash = await scholar.GetFromJsonAsync<ScholarDashboardDto>("/api/scholar/dashboard");
        Assert.Equal(created.ScholarNumber, dash!.ScholarNumber);

        // role separation both ways
        Assert.Equal(HttpStatusCode.Forbidden, (await scholar.GetAsync("/api/admin/scholars")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/scholar/dashboard")).StatusCode);

        // scholar uploads a document to their own requirement, admin sees it
        var comp = await scholar.GetFromJsonAsync<ScholarComplianceDto>("/api/scholar/compliance");
        var item = comp!.Items.First();
        using var form = new MultipartFormDataContent { { new ByteArrayContent([1, 2, 3]), "file", "doc.pdf" } };
        Assert.Equal(HttpStatusCode.NoContent, (await scholar.PostAsync($"/api/scholar/compliance/{item.Id}/file", form)).StatusCode);
        var adminView = await admin.GetFromJsonAsync<ComplianceScholarInfoDto>($"/api/admin/scholars/{created.Id}/compliance");
        Assert.Equal("Submitted", adminView!.Items.First(i => i.Id == item.Id).Status);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/admin/compliance/{item.Id}/file")).StatusCode);

        // scholar can update only their own contact/bank details
        var upd = await scholar.PutAsJsonAsync("/api/scholar/profile", new ScholarProfileUpdateDto("+63 917 123 4567", "1 Main St", "BDO Unibank", "0012345678"));
        Assert.Equal(HttpStatusCode.OK, upd.StatusCode);
        var profile = await scholar.GetFromJsonAsync<ScholarProfileDto>("/api/scholar/profile");
        Assert.Equal("09171234567", profile!.ContactNumber);
        Assert.Equal("BDO Unibank", profile.BankName);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsJsonAsync("/api/scholar/profile", new ScholarProfileUpdateDto(null, null, null, null))).StatusCode);
    }

    [Fact]
    public async Task New_admin_tools_word_exports_and_profile_pictures_work()
    {
        var admin = await LoginAsync("admin", "Adm1n!Pass");
        var type = await (await admin.PostAsJsonAsync("/api/admin/scholarship-types",
            new ScholarshipTypeSaveDto { Name = "Reg Grant", StipendAmount = 3000, PaymentFrequency = "Monthly" })).Content.ReadFromJsonAsync<ScholarshipTypeDto>();

        // Public scholarship applications were removed (scholars sign up instead).
        var anon = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.PostAsync("/api/registrations", new MultipartFormDataContent())).StatusCode);

        // Edit a type's stipend.
        var edited = await (await admin.PutAsJsonAsync($"/api/admin/scholarship-types/{type!.Id}",
            new ScholarshipTypeSaveDto { Name = "Reg Grant", StipendAmount = 3500, PaymentFrequency = "Semi-Annual" })).Content.ReadFromJsonAsync<ScholarshipTypeDto>();
        Assert.Equal(3500, edited!.StipendAmount);

        // Typing a new scholarship name in the scholar form creates that type.
        var created = await (await admin.PostAsJsonAsync("/api/admin/scholars", new ScholarSaveDto
        {
            FirstName = "Tess", LastName = "Typed", Email = "tess@x.ph", Course = "Bachelor of Science in Criminology",
            YearLevel = "1st Year", ScholarshipTypeName = "Barangay Grant", StipendAmount = 1500
        })).Content.ReadFromJsonAsync<ScholarCreatedDto>();
        var types = await admin.GetFromJsonAsync<List<ScholarshipTypeDto>>("/api/admin/scholarship-types");
        Assert.Contains(types!, t => t.Name == "Barangay Grant" && t.StipendAmount == 1500);

        // "Show all" compliance lists every scholar's requirements.
        var all = await admin.GetFromJsonAsync<List<ComplianceOverviewItemDto>>("/api/admin/compliance");
        Assert.Equal(5, all!.Count(c => c.ScholarId == created!.Id));

        // Every export has a Word copy (a .docx is a zip, so it starts with "PK").
        foreach (var url in new[] { "/api/admin/reports/docx?type=Scholarship%20Masterlist", "/api/admin/activity-logs/docx" })
        {
            var res = await admin.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, res.StatusCode);
            Assert.Equal("application/vnd.openxmlformats-officedocument.wordprocessingml.document", res.Content.Headers.ContentType!.MediaType);
            Assert.Equal("PK"u8.ToArray(), (await res.Content.ReadAsByteArrayAsync())[..2]);
        }
        var tpl = await admin.PostAsJsonAsync("/api/admin/reports/template-docx", new TemplateDocxRequest { Title = "Voucher", Columns = ["Payee", "Amount"] });
        Assert.Equal(HttpStatusCode.OK, tpl.StatusCode);

        // Profile picture: none yet -> upload -> admin can see it; non-images are refused.
        Assert.Equal(HttpStatusCode.NoContent, (await admin.GetAsync("/api/me/picture")).StatusCode);
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
        using (var bad = new MultipartFormDataContent { { new ByteArrayContent([1, 2, 3]), "file", "x.png" } })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync("/api/me/picture", bad)).StatusCode);
        using (var good = new MultipartFormDataContent { { new ByteArrayContent(png), "file", "me.png" } })
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsync("/api/me/picture", good)).StatusCode);
        var mine = await admin.GetAsync("/api/me/picture");
        Assert.Equal("image/png", mine.Content.Headers.ContentType!.MediaType);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.GetAsync($"/api/admin/scholars/{created!.Id}/picture")).StatusCode);
    }
}
