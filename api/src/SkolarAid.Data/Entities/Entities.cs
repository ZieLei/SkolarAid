namespace SkolarAid.Data.Entities;

public interface ITimestamped
{
    DateTime CreatedAt { get; set; }
}

public interface IUpdatable : ITimestamped
{
    DateTime UpdatedAt { get; set; }
}

public static class Roles
{
    public const string Admin = "ADMIN";
    public const string Scholar = "SCHOLAR";
}

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

public class Payment : IUpdatable
{
    public int Id { get; set; }
    public int ScholarId { get; set; }
    public Scholar? Scholar { get; set; }
    public string PaymentPeriod { get; set; } = "";
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
