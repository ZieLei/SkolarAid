// =====================================================================
// Entities.cs - one C# class per database table.
// Each property is one column (column names are set in IskolarDbContext).
//
// Main tables and how they link:
// User (login)  1 --- 1  Scholar (profile)  --- ScholarshipType
// Scholar 1 --- many  Payment, ComplianceRecord, Notification
// ComplianceRecord 1 --- many  FileAttachment (the uploaded documents)
// ScholarRegistration = an application that is not a scholar yet
// ActivityLog = the audit trail ("who did what")
// =====================================================================
namespace IskolarAid.Data.Entities;

// Tables with a CreatedAt date (filled in automatically on save).
public interface ITimestamped
{
    DateTime CreatedAt { get; set; }
}

// Tables that also have an UpdatedAt date.
public interface IUpdatable : ITimestamped
{
    DateTime UpdatedAt { get; set; }
}

// The two kinds of accounts. Stored in users.role.
public static class Roles
{
    public const string Admin = "ADMIN";
    public const string Scholar = "SCHOLAR";
}

// Values of users.account_status.
public static class AccountStatuses
{
    public const string Active = "Active";
    public const string Inactive = "Inactive";
    // Created by an admin, but the scholar has not signed up (chosen a password) yet. Cannot log in.
    public const string Pending = "Pending";
}

// A login account (admin or scholar). Username for scholars = Student ID.
// Password holds a hash, never the real password.
public class User : IUpdatable
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string Role { get; set; } = Roles.Scholar;
    public string Name { get; set; } = "";
    public string AccountStatus { get; set; } = "Active";
    public DateTime? LastLogin { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

// A scholarship program: name, stipend amount and how often it pays.
public class ScholarshipType : IUpdatable
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public decimal StipendAmount { get; set; }
    public string PaymentFrequency { get; set; } = "Monthly";
    public string? FundSource { get; set; }
    public string? RenewalConditions { get; set; }
    public string? Requirements { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

// A scholar's profile: personal info, course, scholarship, bank details, status.
public class Scholar : IUpdatable
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public User? User { get; set; }
    public string? StudentId { get; set; }
    public string ScholarNumber { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = "";
    public string? Email { get; set; }
    public string? ContactNumber { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? Address { get; set; }
    public string? Program { get; set; }
    public string? Hei { get; set; }
    public string? DegreeProgram { get; set; }
    public string? Course { get; set; }
    public string? YearLevel { get; set; }
    public int? ScholarshipTypeId { get; set; }
    public ScholarshipType? ScholarshipType { get; set; }
    public decimal? StipendAmount { get; set; }
    public string? StipendFrequency { get; set; }
    public string? ScholarshipFundSource { get; set; }
    public string? RenewalConditions { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountNumber { get; set; }
    public DateTime? EnrollmentDate { get; set; }
    public DateTime? ExpectedGraduation { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public string FullName => $"{FirstName} {MiddleName} {LastName}".Replace("  ", " ").Trim();
}

// An application sent from the Register page. Status: Pending, Approved or Rejected.
// The File* columns hold paths to the uploaded documents on disk.
public class ScholarRegistration : ITimestamped
{
    public int Id { get; set; }
    public string? StudentId { get; set; }
    public string FirstName { get; set; } = "";
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = "";
    public string? Suffix { get; set; }
    public string Email { get; set; } = "";
    public string ContactNumber { get; set; } = "";
    public DateTime? DateOfBirth { get; set; }
    public string? Gender { get; set; }
    public string? Address { get; set; }
    public string? Program { get; set; }
    public string? Hei { get; set; }
    public string? DegreeProgram { get; set; }
    public string? Course { get; set; }
    public string? YearLevel { get; set; }
    public int? ScholarshipTypeId { get; set; }
    public decimal? StipendAmount { get; set; }
    public string? StipendFrequency { get; set; }
    public string? ScholarshipFundSource { get; set; }
    public string? RenewalConditions { get; set; }
    public DateTime? EnrollmentDate { get; set; }
    public DateTime? ExpectedGraduation { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountNumber { get; set; }
    public string? FilePsa { get; set; }
    public string? FileCoe { get; set; }
    public string? FileCor { get; set; }
    public string? FileGrades { get; set; }
    public string? FileContract { get; set; }
    public string? Notes { get; set; }
    public string Status { get; set; } = "Pending";
    public string? RejectionReason { get; set; }
    public DateTime CreatedAt { get; set; }
}

// One stipend payment for one month. Status: Processed (queued) -> Released (paid).
public class Payment : IUpdatable
{
    public int Id { get; set; }
    public int ScholarId { get; set; }
    public Scholar? Scholar { get; set; }
    public string PaymentPeriod { get; set; } = "";
    // First and last day the payment covers. Null on old rows that only have a "March 2026" style label.
    public DateTime? PeriodStart { get; set; }
    public DateTime? PeriodEnd { get; set; }
    public decimal Amount { get; set; }
    public DateTime ComputationDate { get; set; }
    public DateTime? ReleaseDate { get; set; }
    public string Status { get; set; } = "Pending";
    public string? PaymentMethod { get; set; }
    public string? ReferenceNumber { get; set; }
    public int? ProcessedBy { get; set; }
    public User? Processor { get; set; }
    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

// One required document for a scholar.
// Status: Pending, Submitted, Approved, Rejected or Overdue.
public class ComplianceRecord : IUpdatable
{
    public int Id { get; set; }
    public int ScholarId { get; set; }
    public Scholar? Scholar { get; set; }
    public string RequirementType { get; set; } = "";
    public string? Description { get; set; }
    public DateTime DueDate { get; set; }
    public DateTime? DateSubmitted { get; set; }
    public string Status { get; set; } = "Pending";
    public string? Remarks { get; set; }
    public int? CheckedBy { get; set; }
    public User? Checker { get; set; }
    public string? FilePath { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

// An uploaded file for a compliance record. The file bytes are stored in FileData.
public class FileAttachment
{
    public int Id { get; set; }
    public int ScholarId { get; set; }
    public int ComplianceId { get; set; }
    public ComplianceRecord? Compliance { get; set; }
    public string FileName { get; set; } = "";
    public string? OriginalName { get; set; }
    public string? FileType { get; set; }
    public long FileSize { get; set; }
    public byte[] FileData { get; set; } = [];
    public int? UploadedBy { get; set; }
    public DateTime UploadedAt { get; set; }
}

// An in-app message to one scholar (RecipientId = scholar id).
public class Notification
{
    public int Id { get; set; }
    public int? SenderId { get; set; }
    public User? Sender { get; set; }
    public int RecipientId { get; set; }
    public Scholar? Recipient { get; set; }
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public string NotificationType { get; set; } = "Update";
    public DateTime DateCreated { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
}

// One audit log line: who, what action, which table/record, when, from which IP.
public class ActivityLog : ITimestamped
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public User? User { get; set; }
    public string? UserName { get; set; }
    public string ActionType { get; set; } = "";
    public string? TableAffected { get; set; }
    public int? RecordId { get; set; }
    public string? Details { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}

// A user's profile picture. Kept in its own table so loading users never loads the image bytes.
public class ProfilePicture
{
    public int UserId { get; set; }
    public User? User { get; set; }
    public byte[] Data { get; set; } = [];
    public string ContentType { get; set; } = "image/jpeg";
    public DateTime UpdatedAt { get; set; }
}
