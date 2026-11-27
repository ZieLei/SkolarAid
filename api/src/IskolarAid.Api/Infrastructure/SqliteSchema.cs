// =====================================================================
// SqliteSchema.cs - DEMO ONLY. Checks whether the SQLite demo database
// still matches the C# model (every table and column exists).
// EnsureCreated() never changes an existing file, so after an update
// that adds a table or column, the old demo file would break pages.
// Program.cs recreates the demo database when this returns true.
// (The real MySQL database is updated with migrations instead.)
// =====================================================================
using IskolarAid.Data;
using Microsoft.EntityFrameworkCore;

namespace IskolarAid.Api.Infrastructure;

public static class SqliteSchema
{
    public static bool IsOutdated(IskolarDbContext db)
    {
        var conn = db.Database.GetDbConnection();
        conn.Open();
        // Close again afterwards: an open connection would keep the old file in use
        // when Program.cs deletes and recreates it.
        try
        {
            return Check(db, conn);
        }
        finally
        {
            conn.Close();
        }
    }

    private static bool Check(IskolarDbContext db, System.Data.Common.DbConnection conn)
    {
        foreach (var entity in db.Model.GetEntityTypes())
        {
            var table = entity.GetTableName();
            if (table is null)
                continue;
            var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $"PRAGMA table_info(\"{table}\")";
                using var r = cmd.ExecuteReader();
                while (r.Read())
                    columns.Add(r.GetString(1));
            }
            if (columns.Count == 0)
                return true; // table missing
            var store = Microsoft.EntityFrameworkCore.Metadata.StoreObjectIdentifier.Table(
                table,
                entity.GetSchema()
            );
            if (
                entity
                    .GetProperties()
                    .Any(p => p.GetColumnName(store) is { } c && !columns.Contains(c))
            )
                return true;
        }
        return false;
    }
}
