using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SkolarAid.Data;

/// <summary>Used by `dotnet ef` only. No database connection is needed to add a migration.</summary>
public class DesignTimeFactory : IDesignTimeDbContextFactory<SkolarDbContext>
{
    public SkolarDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
                 ?? "Server=localhost;Port=3306;Database=iskolaraid;User=root;Password=;";
        var options = new DbContextOptionsBuilder<SkolarDbContext>()
            .UseMySql(cs, new MySqlServerVersion(new Version(8, 0, 36)))
            .Options;
        return new SkolarDbContext(options);
    }
}
