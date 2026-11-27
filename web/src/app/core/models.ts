// =====================================================================
// models.ts - TypeScript shapes of the data the API sends and receives.
// Each one matches a C# DTO in api/src/IskolarAid.Core/Dtos/Dtos.cs.
// If you add a field there, add it here too.
// =====================================================================
// Interfaces mirror the API DTOs (camelCase JSON).
export interface UserInfo { id: number; username: string; role: 'ADMIN' | 'SCHOLAR'; name: string; scholarId: number | null; scholarNumber: string | null; }
export interface LoginResponse { token: string; expiresAt: string; user: UserInfo; }
/** Sign-up for a scholar already in the system (POST /api/auth/signup). */
export interface SignUpRequest { scholarNumber: string; studentIdOrEmail: string; password: string; }
export interface Option { id: number; name: string; }
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number; }

export interface ScholarshipType { id: number; name: string; description: string | null; stipendAmount: number; paymentFrequency: string; fundSource: string | null; renewalConditions: string | null; isActive: boolean; scholarCount: number; }
export interface ScholarListItem { id: number; scholarNumber: string; studentId: string | null; fullName: string; course: string | null; yearLevel: string | null; scholarship: string | null; status: string; }
export interface ScholarDocument { key: string; label: string; complianceId: number; status: string; fileName: string | null; hasFile: boolean; }
export interface ScholarDetail {
  id: number; userId: number | null; scholarNumber: string; studentId: string | null; firstName: string; middleName: string | null; lastName: string;
  email: string | null; contactNumber: string | null; dateOfBirth: string | null; gender: string | null; address: string | null; course: string | null;
  yearLevel: string | null; scholarshipTypeId: number | null; scholarshipName: string | null; stipendAmount: number; stipendFrequency: string | null;
  scholarshipFundSource: string | null; renewalConditions: string | null; bankName: string | null; bankAccountNumber: string | null;
  enrollmentDate: string | null; expectedGraduation: string | null; status: string; createdAt: string;
  paymentCount: number; totalReceived: number; pendingCompliance: number; approvedCompliance: number; totalCompliance: number; documents: ScholarDocument[];
}
export interface ScholarSave {
  studentId: string | null; firstName: string; middleName: string | null; lastName: string; suffix: string | null; email: string; contactNumber: string | null;
  dateOfBirth: string | null; gender: string | null; address: string | null; course: string; yearLevel: string;
  /** Pick an existing type (id) OR type its name; a new name creates a new type. */
  scholarshipTypeId: number | null; scholarshipTypeName: string | null;
  stipendAmount: number; stipendFrequency: string | null; scholarshipFundSource: string | null; renewalConditions: string | null;
  bankName: string | null; bankAccountNumber: string | null; enrollmentDate: string | null; expectedGraduation: string | null; status: string | null;
}
export interface ScholarCreated { id: number; scholarNumber: string; studentId: string; fullName: string; email: string; username: string; emailSent: boolean; }
export interface ScholarFilters { statuses: string[]; scholarships: Option[]; courses: string[]; }

/** One row of the admin "show all" compliance list: a requirement plus whose it is. */
export interface ComplianceOverviewItem { id: number; scholarId: number; scholarName: string; scholarNumber: string; requirementType: string; description: string | null; dueDate: string; dateSubmitted: string | null; status: string; remarks: string | null; checkedBy: string | null; fileCount: number; fileName: string | null; }
export interface ComplianceItem { id: number; requirementType: string; description: string | null; dueDate: string; dateSubmitted: string | null; status: string; remarks: string | null; checkedBy: string | null; fileCount: number; fileName: string | null; }
export interface ComplianceScholarInfo { id: number; fullName: string; scholarNumber: string; course: string | null; yearLevel: string | null; scholarship: string | null; items: ComplianceItem[]; overall: string; }
export interface ComplianceScholarOption { id: number; label: string; }

export interface RegistrationListItem { id: number; fullName: string; email: string; contactNumber: string; course: string | null; yearLevel: string | null; status: string; rejectionReason: string | null; createdAt: string; }
export interface RegistrationDetail {
  id: number; studentId: string | null; firstName: string; middleName: string | null; lastName: string; suffix: string | null; email: string; contactNumber: string;
  dateOfBirth: string | null; gender: string | null; address: string | null; program: string | null; hei: string | null; degreeProgram: string | null; yearLevel: string | null;
  scholarshipTypeId: number | null; scholarshipName: string | null; stipendAmount: number | null; stipendFrequency: string | null; scholarshipFundSource: string | null;
  renewalConditions: string | null; enrollmentDate: string | null; expectedGraduation: string | null; bankName: string | null; bankAccountNumber: string | null;
  files: string[]; notes: string | null; status: string; rejectionReason: string | null; createdAt: string;
}
export interface RegistrationApproved { scholarId: number; scholarNumber: string; studentId: string; fullName: string; emailSent: boolean; }

export interface PayrollCandidate { id: number; scholarNumber: string; fullName: string; course: string | null; yearLevel: string | null; scholarshipType: string; stipendAmount: number; complianceStatus: string; paymentStatus: string; isEligible: boolean; }
export interface PayrollPreview { period: string; method: string; selected: number; alreadyPaid: number; new: number; totalAmount: number; lines: { scholarId: number; fullName: string; amount: number; alreadyPaid: boolean }[]; }
export interface PayrollResult { period: string; method: string; processed: number; skipped: number; total: number; emailsSent: number; }
export interface ProcessedPayment { paymentId: number; scholarId: number; scholarName: string; scholarNumber: string; period: string; amount: number; releaseDate: string | null; paymentMethod: string | null; referenceNumber: string | null; }
export interface ReleaseResult { released: number; emailsSent: number; total: number; }
export interface DisbursementHistory { id: number; scholarName: string; scholarNumber: string; period: string; amount: number; status: string; releaseDate: string | null; paymentMethod: string | null; referenceNumber: string | null; }
export interface PayrollStats { processedToday: number; readyForRelease: number; readyAmount: number; }

export interface NotificationItem { id: number; title: string; message: string; type: string; dateCreated: string; isRead: boolean; readAt: string | null; senderName: string; recipientName: string | null; scholarNumber: string | null; }
export interface NotificationStats { total: number; unread: number; read: number; pendingRegistrations: number; }
export interface ComposeResult { created: number; emailsSent: number; }
export interface ScholarNotification { id: number; title: string; message: string; type: string; dateCreated: string; isRead: boolean; readAt: string | null; senderName: string; }
export interface ScholarNotifications { items: ScholarNotification[]; total: number; unread: number; payment: number; alert: number; }

export interface ActivityLog { id: number; createdAt: string; userName: string | null; role: string; actionType: string; tableAffected: string | null; recordId: number | null; details: string | null; ipAddress: string; }
export interface ActivityStats { total: number; today: number; activeUsers: number; }
export interface ActivityFilters { users: string[]; actions: string[]; }

export interface DashboardStats { totalScholars: number; activeScholarships: number; totalDisbursed: number; pendingPayments: number; queuedAmount: number; }
export interface RecentActivity { userName: string; details: string; createdAt: string; }
export interface UpcomingPayment { scholarName: string; scholarNumber: string; amount: number; releaseDate: string | null; status: string; period: string; }
export interface ChartPoint { label: string; value: number; }
export interface Analytics { stats: DashboardStats; byScholarship: ChartPoint[]; byCourse: ChartPoint[]; monthlyDisbursement: ChartPoint[]; }
export interface ReportResult { title: string; columns: string[]; rows: (string | null)[][]; }
export interface ReleasedPayment { id: number; scholarNumber: string; scholarName: string; period: string; amount: number; releaseDate: string | null; }
export interface Receipt { paymentId: number; scholarName: string; scholarNumber: string; studentId: string | null; course: string | null; period: string; amount: number; amountInWords: string; status: string; releaseDate: string | null; paymentMethod: string | null; referenceNumber: string | null; processedBy: string | null; bankName: string | null; bankAccountNumber: string | null; computationDate: string; }

export interface PaymentItem { id: number; period: string; amount: number; status: string; releaseDate: string | null; paymentMethod: string | null; referenceNumber: string | null; processedBy: string | null; }
export interface ScholarPayments { items: PaymentItem[]; totalReceived: number; pendingAmount: number; lastPayment: number; lastPaymentDate: string | null; totalPayments: number; }
export interface ScholarDashboard { scholarName: string; scholarNumber: string; scholarshipName: string; scholarshipStipend: number; nextPaymentDate: string; totalStipend: number; complianceRate: number; recentPayments: PaymentItem[]; compliance: ComplianceItem[]; notifications: ScholarNotification[]; nextPaymentNote: string; nextPaymentAmount: number | null; documentsDue: number; documentsDueDate: string | null; }
export interface ScholarProfile { firstName: string; middleName: string | null; lastName: string; email: string | null; contactNumber: string | null; address: string | null; dateOfBirth: string | null; gender: string | null; bankName: string | null; bankAccountNumber: string | null; studentId: string | null; hei: string | null; course: string | null; yearLevel: string | null; scholarNumber: string; scholarshipType: string | null; enrollmentDate: string | null; expectedGraduation: string | null; status: string; stipendAmount: number; fundSource: string | null; renewalConditions: string | null; }
export interface ScholarCompliance { items: ComplianceItem[]; total: number; completed: number; pending: number; overdue: number; rate: number; }
