using System.ComponentModel.DataAnnotations;

namespace SkolarAid.Core.Dtos;

// ---- Auth ----
public record LoginRequest([Required, StringLength(100)] string Username, [Required, StringLength(200)] string Password);
public record UserInfoDto(int Id, string Username, string Role, string Name, int? ScholarId, string? ScholarNumber);
public record LoginResponse(string Token, DateTime ExpiresAt, UserInfoDto User);

// ---- Shared ----
public record OptionDto(int Id, string Name);

// ---- Scholarship types ----
public record ScholarshipTypeDto(int Id, string Name, string? Description, decimal StipendAmount, string PaymentFrequency,
    string? FundSource, string? RenewalConditions, bool IsActive, int ScholarCount);

public class ScholarshipTypeSaveDto
{
    [Required, StringLength(150)] public string Name { get; set; } = "";
    [Range(0.01, 10_000_000)] public decimal StipendAmount { get; set; }
    [Required, RegularExpression("^(Monthly|Quarterly|Semi-Annual|Annual)$")] public string PaymentFrequency { get; set; } = "Monthly";
    [StringLength(100)] public string? FundSource { get; set; }
    [StringLength(1000)] public string? RenewalConditions { get; set; }
    [StringLength(1000)] public string? Description { get; set; }
}

// ---- Scholars ----
public record ScholarListItemDto(int Id, string ScholarNumber, string? StudentId, string FullName, string? Course,
    string? YearLevel, string? Scholarship, string Status);

public record ScholarDocumentDto(string Key, string Label, int ComplianceId, string Status, string? FileName, bool HasFile);

public record ScholarDetailDto(int Id, int? UserId, string ScholarNumber, string? StudentId, string FirstName, string? MiddleName,
    string LastName, string? Email, string? ContactNumber, DateTime? DateOfBirth, string? Gender, string? Address, string? Course,
    string? YearLevel, int? ScholarshipTypeId, string? ScholarshipName, decimal StipendAmount, string? StipendFrequency,
    string? ScholarshipFundSource, string? RenewalConditions, string? BankName, string? BankAccountNumber,
    DateTime? EnrollmentDate, DateTime? ExpectedGraduation, string Status, DateTime CreatedAt,
    int PaymentCount, decimal TotalReceived, int PendingCompliance, int ApprovedCompliance, int TotalCompliance,
    IReadOnlyList<ScholarDocumentDto> Documents);

public class ScholarSaveDto
{
    [StringLength(50)] public string? StudentId { get; set; }
    [Required, StringLength(100)] public string FirstName { get; set; } = "";
    [StringLength(100)] public string? MiddleName { get; set; }
    [Required, StringLength(100)] public string LastName { get; set; } = "";
    [StringLength(30)] public string? Suffix { get; set; }
    [Required, EmailAddress, StringLength(150)] public string Email { get; set; } = "";
    [StringLength(30)] public string? ContactNumber { get; set; }
    public DateTime? DateOfBirth { get; set; }
    [StringLength(20)] public string? Gender { get; set; }
    [StringLength(500)] public string? Address { get; set; }
    [Required, StringLength(200)] public string Course { get; set; } = "";
    [Required, StringLength(30)] public string YearLevel { get; set; } = "";
    [Required, Range(1, int.MaxValue, ErrorMessage = "Please select a scholarship type.")] public int ScholarshipTypeId { get; set; }
    [Range(0, 10_000_000)] public decimal StipendAmount { get; set; }
    [StringLength(30)] public string? StipendFrequency { get; set; }
    [StringLength(100)] public string? ScholarshipFundSource { get; set; }
    [StringLength(1000)] public string? RenewalConditions { get; set; }
    [StringLength(100)] public string? BankName { get; set; }
    [StringLength(50)] public string? BankAccountNumber { get; set; }
    public DateTime? EnrollmentDate { get; set; }
    public DateTime? ExpectedGraduation { get; set; }
    [StringLength(20)] public string? Status { get; set; }
}

public record ScholarCreatedDto(int Id, string ScholarNumber, string StudentId, string FullName, string Email, string Username,
    string TemporaryPassword, bool EmailSent, bool SmsSent);

public record ScholarFiltersDto(IReadOnlyList<string> Statuses, IReadOnlyList<OptionDto> Scholarships, IReadOnlyList<string> Courses);

// ---- Compliance ----
public record ComplianceItemDto(int Id, string RequirementType, string? Description, DateTime DueDate, DateTime? DateSubmitted,
    string Status, string? Remarks, string? CheckedBy, int FileCount, string? FileName);

public class ComplianceStatusDto
{
    [Required, RegularExpression("^(Pending|Submitted|Approved|Rejected|Overdue)$")] public string Status { get; set; } = "";
    [StringLength(1000)] public string? Remarks { get; set; }
}

public class AddRequirementDto
{
    [Required, StringLength(150)] public string RequirementType { get; set; } = "";
    [StringLength(1000)] public string? Description { get; set; }
    [Required] public DateTime DueDate { get; set; }
}

public record ComplianceScholarOptionDto(int Id, string Label);
public record ComplianceScholarInfoDto(int Id, string FullName, string ScholarNumber, string? Course, string? YearLevel, string? Scholarship,
    IReadOnlyList<ComplianceItemDto> Items, string Overall);

// ---- Registration ----
public class RegistrationSubmitDto
{
    [Required, StringLength(50)] public string StudentId { get; set; } = "";
    [Required, StringLength(100)] public string FirstName { get; set; } = "";
    [StringLength(100)] public string? MiddleName { get; set; }
    [Required, StringLength(100)] public string LastName { get; set; } = "";
    [StringLength(30)] public string? Suffix { get; set; }
    [Required, EmailAddress, StringLength(150)] public string Email { get; set; } = "";
    [Required, StringLength(30)] public string ContactNumber { get; set; } = "";
    public DateTime? DateOfBirth { get; set; }
    [Required, StringLength(20)] public string Gender { get; set; } = "";
    [StringLength(500)] public string? Address { get; set; }
    [StringLength(50)] public string? Program { get; set; }
    [StringLength(200)] public string? Hei { get; set; }
    [Required, StringLength(200)] public string DegreeProgram { get; set; } = "";
    [Required, StringLength(30)] public string YearLevel { get; set; } = "";
    [Required, Range(1, int.MaxValue, ErrorMessage = "Please select a Scholarship Type.")] public int ScholarshipTypeId { get; set; }
    public DateTime? EnrollmentDate { get; set; }
    public DateTime? ExpectedGraduation { get; set; }
    [StringLength(100)] public string? BankName { get; set; }
    [StringLength(50)] public string? BankAccountNumber { get; set; }
    [StringLength(2000)] public string? Notes { get; set; }
}

public class RegistrationFile
{
    public required string Key { get; init; }
    public required string FileName { get; init; }
    public required Stream Content { get; init; }
}

public record RegistrationListItemDto(int Id, string FullName, string Email, string ContactNumber, string? Course, string? YearLevel,
    string Status, string? RejectionReason, DateTime CreatedAt);

public record RegistrationDetailDto(int Id, string? StudentId, string FirstName, string? MiddleName, string LastName, string? Suffix,
    string Email, string ContactNumber, DateTime? DateOfBirth, string? Gender, string? Address, string? Program, string? Hei,
    string? DegreeProgram, string? YearLevel, int? ScholarshipTypeId, string? ScholarshipName, decimal? StipendAmount,
    string? StipendFrequency, string? ScholarshipFundSource, string? RenewalConditions, DateTime? EnrollmentDate,
    DateTime? ExpectedGraduation, string? BankName, string? BankAccountNumber, IReadOnlyList<string> Files, string? Notes,
    string Status, string? RejectionReason, DateTime CreatedAt);

public class RejectRegistrationDto
{
    [Required, StringLength(1000)] public string Reason { get; set; } = "";
    public bool SendEmail { get; set; } = true;
}

public record RegistrationApprovedDto(int ScholarId, string ScholarNumber, string StudentId, string FullName, bool EmailSent);

// ---- Payroll ----
public record PayrollCandidateDto(int Id, string ScholarNumber, string FullName, string? Course, string? YearLevel,
    string ScholarshipType, decimal StipendAmount, string ComplianceStatus, string PaymentStatus, bool IsEligible);

public class PayrollRequestDto
{
    [Required] public DateTime PeriodDate { get; set; }
    [Required, RegularExpression("^(Bank Transfer|Cash|Mobile Wallet)$")] public string Method { get; set; } = "Bank Transfer";
    [Required, MinLength(1, ErrorMessage = "Please select at least one eligible scholar.")] public List<int> ScholarIds { get; set; } = [];
}

public record PayrollPreviewDto(string Period, string Method, int Selected, int AlreadyPaid, int New, decimal TotalAmount,
    IReadOnlyList<PayrollPreviewLine> Lines);
public record PayrollPreviewLine(int ScholarId, string FullName, decimal Amount, bool AlreadyPaid);
public record PayrollResultDto(string Period, string Method, int Processed, int Skipped, decimal Total, int EmailsSent, int SmsSent);

public record ProcessedPaymentDto(int PaymentId, int ScholarId, string ScholarName, string ScholarNumber, string Period, decimal Amount,
    DateTime? ReleaseDate, string? PaymentMethod, string? ReferenceNumber);
public record ReleaseResultDto(int Released, int EmailsSent, decimal Total);
public record DisbursementHistoryDto(int Id, string ScholarName, string ScholarNumber, string Period, decimal Amount, string Status,
    DateTime? ReleaseDate, string? PaymentMethod, string? ReferenceNumber);
public record PayrollStatsDto(int ProcessedToday, int ReadyForRelease, decimal ReadyAmount);

// ---- Notifications ----
public record NotificationDto(int Id, string Title, string Message, string Type, DateTime DateCreated, bool IsRead, DateTime? ReadAt,
    string SenderName, string? RecipientName, string? ScholarNumber);
public record NotificationStatsDto(int Total, int Unread, int Read, int PendingRegistrations);

public class ComposeNotificationDto
{
    /// <summary>Null = every active scholar.</summary>
    public int? RecipientId { get; set; }
    [Required, RegularExpression("^(Reminder|Alert|Update|Announcement)$")] public string Type { get; set; } = "Update";
    [Required, StringLength(200)] public string Title { get; set; } = "";
    [Required, StringLength(4000)] public string Message { get; set; } = "";
    public bool SendEmail { get; set; }
    public bool SendSms { get; set; }
}
public record ComposeResultDto(int Created, int EmailsSent, int SmsSent);

public record ScholarNotificationDto(int Id, string Title, string Message, string Type, DateTime DateCreated, bool IsRead, DateTime? ReadAt, string SenderName);
public record ScholarNotificationsDto(IReadOnlyList<ScholarNotificationDto> Items, int Total, int Unread, int Payment, int Alert);

// ---- Activity logs ----
public record ActivityLogDto(int Id, DateTime CreatedAt, string? UserName, string Role, string ActionType, string? TableAffected,
    int? RecordId, string? Details, string IpAddress);
public record ActivityStatsDto(int Total, int Today, int ActiveUsers);
public record ActivityFiltersDto(IReadOnlyList<string> Users, IReadOnlyList<string> Actions);

// ---- Dashboard / reports ----
public record DashboardStatsDto(int TotalScholars, int ActiveScholarships, decimal TotalDisbursed, int PendingPayments, decimal QueuedAmount = 0);
public record RecentActivityDto(string UserName, string Details, DateTime CreatedAt);
public record UpcomingPaymentDto(string ScholarName, string ScholarNumber, decimal Amount, DateTime? ReleaseDate, string Status);
public record ChartPointDto(string Label, decimal Value);
public record AnalyticsDto(DashboardStatsDto Stats, IReadOnlyList<ChartPointDto> ByScholarship, IReadOnlyList<ChartPointDto> ByCourse,
    IReadOnlyList<ChartPointDto> MonthlyDisbursement);

public class ReportQuery
{
    public string Type { get; set; } = "Scholar Census Report";
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public string? Status { get; set; }
    public string? Scholarship { get; set; }
    public string? Course { get; set; }
}

public record ReportResultDto(string Title, IReadOnlyList<string> Columns, IReadOnlyList<IReadOnlyList<string?>> Rows);
public record ReleasedPaymentDto(int Id, string ScholarNumber, string ScholarName, string Period, decimal Amount, DateTime? ReleaseDate);
public record ReceiptDto(int PaymentId, string ScholarName, string ScholarNumber, string? StudentId, string? Course, string Period,
    decimal Amount, string AmountInWords, string Status, DateTime? ReleaseDate, string? PaymentMethod, string? ReferenceNumber,
    string? ProcessedBy, string? BankName, string? BankAccountNumber, DateTime ComputationDate);

// ---- Scholar portal ----
public record ScholarDashboardDto(string ScholarName, string ScholarNumber, string ScholarshipName, decimal ScholarshipStipend,
    string NextPaymentDate, decimal TotalStipend, int ComplianceRate, IReadOnlyList<PaymentItemDto> RecentPayments,
    IReadOnlyList<ComplianceItemDto> Compliance, IReadOnlyList<ScholarNotificationDto> Notifications,
    string NextPaymentNote = "", decimal? NextPaymentAmount = null, int DocumentsDue = 0, DateTime? DocumentsDueDate = null);
public record PaymentItemDto(int Id, string Period, decimal Amount, string Status, DateTime? ReleaseDate, string? PaymentMethod,
    string? ReferenceNumber, string? ProcessedBy);
public record ScholarPaymentsDto(IReadOnlyList<PaymentItemDto> Items, decimal TotalReceived, decimal PendingAmount,
    decimal LastPayment, DateTime? LastPaymentDate, int TotalPayments);
public record ScholarProfileDto(string FirstName, string? MiddleName, string LastName, string? Email, string? ContactNumber,
    string? Address, DateTime? DateOfBirth, string? Gender, string? BankName, string? BankAccountNumber, string? StudentId, string? Hei,
    string? Course, string? YearLevel, string ScholarNumber, string? ScholarshipType, DateTime? EnrollmentDate,
    DateTime? ExpectedGraduation, string Status, decimal StipendAmount, string? FundSource, string? RenewalConditions);
public record ScholarComplianceDto(IReadOnlyList<ComplianceItemDto> Items, int Total, int Completed, int Pending, int Overdue, int Rate);
