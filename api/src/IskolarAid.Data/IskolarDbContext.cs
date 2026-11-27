// =====================================================================
// IskolarDbContext.cs - the bridge between C# code and the database.
//
// Services ask for this class and use it like:
// db.Scholars.Where(...)  -> SELECT ... FROM scholars
// db.Payments.Add(p); await db.SaveChangesAsync();  -> INSERT
//
// Each DbSet below is one table. The tables were made by the old desktop
// app, so this file maps C# names to the old snake_case names.
// =====================================================================
using System.Text;
using Microsoft.EntityFrameworkCore;
using IskolarAid.Data.Entities;

namespace IskolarAid.Data;

/// <summary>EF Core context mapped to the legacy MySQL schema (snake_case tables/columns).</summary>
public class IskolarDbContext(DbContextOptions<IskolarDbContext> options) : DbContext(options)
{
    // One property per table.
    public DbSet<User> Users => Set<User>();
    public DbSet<Scholar> Scholars => Set<Scholar>();
    public DbSet<ScholarshipType> ScholarshipTypes => Set<ScholarshipType>();
    public DbSet<ScholarRegistration> ScholarRegistrations => Set<ScholarRegistration>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<ProfilePicture> ProfilePictures => Set<ProfilePicture>();
    public DbSet<ComplianceRecord> ComplianceRecords => Set<ComplianceRecord>();
    public DbSet<FileAttachment> FileAttachments => Set<FileAttachment>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<ActivityLog> ActivityLogs => Set<ActivityLog>();

    // "ScholarNumber" -> "scholar_number" (C# property name -> database column name).
    public static string ToSnake(string name)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            if (char.IsUpper(name[i]) && i > 0 && (!char.IsUpper(name[i - 1]) || (i + 1 < name.Length && char.IsLower(name[i + 1]))))
                sb.Append('_');
            sb.Append(char.ToLowerInvariant(name[i]));
        }
        return sb.ToString();
    }

    // Describe the tables: names, column sizes, unique indexes and links between tables.
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().ToTable("users");
        b.Entity<Scholar>().ToTable("scholars");
        b.Entity<ScholarshipType>().ToTable("scholarship_types");
        b.Entity<ScholarRegistration>().ToTable("scholar_registrations");
        b.Entity<Payment>().ToTable("payments");
        b.Entity<ProfilePicture>().ToTable("profile_pictures");
        b.Entity<ComplianceRecord>().ToTable("compliance_records");
        b.Entity<FileAttachment>().ToTable("file_attachments");
        b.Entity<Notification>().ToTable("notifications");
        b.Entity<ActivityLog>().ToTable("activity_logs");

        // snake_case columns for every mapped property
        foreach (var entity in b.Model.GetEntityTypes())
            foreach (var p in entity.GetProperties())
                p.SetColumnName(ToSnake(p.Name));

        // FullName is worked out in C#, it is not a column.
        b.Entity<Scholar>().Ignore(s => s.FullName);
        b.Entity<Scholar>().Property(s => s.Hei).HasColumnName("hei");

        b.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.Username).HasMaxLength(100);
            e.Property(u => u.Password).HasMaxLength(255);
            e.Property(u => u.Role).HasMaxLength(20);
            e.Property(u => u.Name).HasMaxLength(200);
            e.Property(u => u.AccountStatus).HasMaxLength(20);
        });

        b.Entity<ScholarshipType>(e =>
        {
            e.Property(s => s.Name).HasMaxLength(150);
            e.Property(s => s.StipendAmount).HasPrecision(12, 2);
            e.Property(s => s.PaymentFrequency).HasMaxLength(30);
        });

        b.Entity<Scholar>(e =>
        {
            e.HasIndex(s => s.ScholarNumber).IsUnique();
            e.Property(s => s.ScholarNumber).HasMaxLength(30);
            e.Property(s => s.StudentId).HasMaxLength(50);
            e.Property(s => s.StipendAmount).HasPrecision(12, 2);
            e.Property(s => s.Status).HasMaxLength(20);
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(s => s.ScholarshipType).WithMany().HasForeignKey(s => s.ScholarshipTypeId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ScholarRegistration>(e =>
        {
            e.Property(s => s.StipendAmount).HasPrecision(12, 2);
            e.Property(s => s.Status).HasMaxLength(20);
        });

        b.Entity<Payment>(e =>
        {
            e.Property(p => p.Amount).HasPrecision(12, 2);
            e.Property(p => p.PaymentPeriod).HasMaxLength(50);
            e.Property(p => p.Status).HasMaxLength(20);
            e.Property(p => p.PaymentMethod).HasMaxLength(30);
            e.Property(p => p.ReferenceNumber).HasMaxLength(60);
            e.HasIndex(p => new { p.ScholarId, p.PaymentPeriod });
            e.Property(p => p.PeriodStart).HasColumnType("date");
            e.Property(p => p.PeriodEnd).HasColumnType("date");
            e.HasOne(p => p.Scholar).WithMany().HasForeignKey(p => p.ScholarId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(p => p.Processor).WithMany().HasForeignKey(p => p.ProcessedBy).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ComplianceRecord>(e =>
        {
            e.Property(c => c.RequirementType).HasMaxLength(150);
            e.Property(c => c.Status).HasMaxLength(20);
            e.Property(c => c.DueDate).HasColumnType("date");
            e.Property(c => c.DateSubmitted).HasColumnType("date");
            e.HasOne(c => c.Scholar).WithMany().HasForeignKey(c => c.ScholarId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(c => c.Checker).WithMany().HasForeignKey(c => c.CheckedBy).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<FileAttachment>(e =>
        {
            e.Property(f => f.FileData).HasColumnType("longblob");
            e.HasOne(f => f.Compliance).WithMany().HasForeignKey(f => f.ComplianceId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Notification>(e =>
        {
            e.Property(n => n.NotificationType).HasMaxLength(30);
            e.HasOne(n => n.Recipient).WithMany().HasForeignKey(n => n.RecipientId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(n => n.Sender).WithMany().HasForeignKey(n => n.SenderId).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ProfilePicture>(e =>
        {
            e.HasKey(p => p.UserId);
            e.Property(p => p.ContentType).HasMaxLength(50);
            e.Property(p => p.Data).HasColumnType("longblob");
            e.HasOne(p => p.User).WithOne().HasForeignKey<ProfilePicture>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ActivityLog>(e =>
        {
            e.Property(a => a.ActionType).HasMaxLength(50);
            e.HasOne(a => a.User).WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.SetNull);
        });
    }

    // Every save fills in CreatedAt / UpdatedAt automatically (see Stamp below),
    // so services never have to set these dates themselves.
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        Stamp();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        Stamp();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    // New rows get a created date; changed rows get a new updated date.
    private void Stamp()
    {
        var now = DateTime.Now;
        foreach (var e in ChangeTracker.Entries())
        {
            if (e.State == EntityState.Added)
            {
                if (e.Entity is ITimestamped t && t.CreatedAt == default) t.CreatedAt = now;
                if (e.Entity is IUpdatable u && u.UpdatedAt == default) u.UpdatedAt = now;
                if (e.Entity is Notification n && n.DateCreated == default) n.DateCreated = now;
                if (e.Entity is FileAttachment f && f.UploadedAt == default) f.UploadedAt = now;
            }
            else if (e.State == EntityState.Modified && e.Entity is IUpdatable m)
            {
                m.UpdatedAt = now;
            }
        }
    }
}
