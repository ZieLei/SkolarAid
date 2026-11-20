using Microsoft.EntityFrameworkCore;
using IskolarAid.Core.Common;
using IskolarAid.Core.Dtos;
using IskolarAid.Data;
using IskolarAid.Data.Entities;

namespace IskolarAid.Core.Services;

public class NotificationService(IskolarDbContext db, ICurrentUser current, ActivityLogService log, IEmailSender email, ISmsSender sms)
{
    // ---------- Admin ----------
    public async Task<List<NotificationDto>> ListAsync(string? type, bool unreadOnly, string? search, int? recipientId)
    {
        var q = db.Notifications.AsNoTracking().Include(n => n.Sender).Include(n => n.Recipient).AsQueryable();
        if (!string.IsNullOrWhiteSpace(type) && !type.StartsWith("All")) q = q.Where(n => n.NotificationType == type);
        if (unreadOnly) q = q.Where(n => !n.IsRead);
        if (recipientId is > 0) q = q.Where(n => n.RecipientId == recipientId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var t = search.Trim();
            q = q.Where(n => n.Title.Contains(t) || n.Message.Contains(t) || n.Recipient!.FirstName.Contains(t) || n.Recipient.LastName.Contains(t));
        }
        var rows = await q.OrderByDescending(n => n.DateCreated).ThenByDescending(n => n.Id).Take(100).ToListAsync();
        return rows.Select(n => new NotificationDto(n.Id, n.Title, n.Message, n.NotificationType, n.DateCreated, n.IsRead, n.ReadAt,
            n.Sender?.Name ?? "System", n.Recipient?.FullName, n.Recipient?.ScholarNumber)).ToList();
    }

    public async Task<NotificationStatsDto> StatsAsync()
    {
        var total = await db.Notifications.CountAsync();
        var unread = await db.Notifications.CountAsync(n => !n.IsRead);
        var pending = await db.ScholarRegistrations.CountAsync(r => r.Status == "Pending");
        return new NotificationStatsDto(total, unread, total - unread, pending);
    }

    public async Task<ComposeResultDto> ComposeAsync(ComposeNotificationDto dto)
    {
        List<Scholar> recipients;
        if (dto.RecipientId is null)
            recipients = await db.Scholars.Where(s => s.Status == "Active").ToListAsync();
        else
            recipients = [await db.Scholars.FindAsync(dto.RecipientId) ?? throw AppException.NotFound("Recipient")];

        foreach (var s in recipients)
            db.Notifications.Add(new Notification
            {
                SenderId = current.UserId, RecipientId = s.Id, Title = dto.Title.Trim(), Message = dto.Message.Trim(), NotificationType = dto.Type
            });
        await db.SaveChangesAsync();
        await log.LogCreate("notifications", dto.RecipientId ?? 0, $"Sent '{dto.Title}' to {(dto.RecipientId is null ? "all active scholars" : recipients[0].FullName)}");

        int emails = 0, texts = 0;
        foreach (var s in recipients)
        {
            if (dto.SendEmail && !string.IsNullOrEmpty(s.Email))
            {
                var (subject, body) = MessageTemplates.Notification(s.FullName, dto.Title, dto.Message);
                if (await email.SendAsync(s.Email, s.FullName, subject, body)) emails++;
            }
            if (dto.SendSms && !string.IsNullOrEmpty(s.ContactNumber) &&
                await sms.SendAsync(s.ContactNumber, $"IskolarAid: {dto.Title} - {dto.Message}")) texts++;
        }
        return new ComposeResultDto(recipients.Count, emails, texts);
    }

    public async Task MarkReadAsync(int id)
    {
        var n = await db.Notifications.FindAsync(id) ?? throw AppException.NotFound("Notification");
        if (n.IsRead) return;
        n.IsRead = true; n.ReadAt = DateTime.Now;
        await db.SaveChangesAsync();
    }

    public async Task<int> MarkAllReadAsync()
    {
        var unread = await db.Notifications.Where(n => !n.IsRead).ToListAsync();
        foreach (var n in unread) { n.IsRead = true; n.ReadAt = DateTime.Now; }
        await db.SaveChangesAsync();
        return unread.Count;
    }

    public async Task DeleteAsync(int id)
    {
        var n = await db.Notifications.FindAsync(id) ?? throw AppException.NotFound("Notification");
        db.Notifications.Remove(n);
        await db.SaveChangesAsync();
    }

    public async Task<int> DeleteAllReadAsync()
    {
        var read = await db.Notifications.Where(n => n.IsRead).ToListAsync();
        db.Notifications.RemoveRange(read);
        await db.SaveChangesAsync();
        return read.Count;
    }

    public async Task<List<OptionDto>> RecipientsAsync()
    {
        var rows = await db.Scholars.Where(s => s.Status == "Active").OrderBy(s => s.FirstName)
            .Select(s => new { s.Id, s.FirstName, s.LastName, s.ScholarNumber }).ToListAsync();
        return rows.Select(s => new OptionDto(s.Id, $"{s.FirstName} {s.LastName} ({s.ScholarNumber})")).ToList();
    }

    // ---------- Scholar (own only) ----------
    public async Task<ScholarNotificationsDto> ListForScholarAsync(int scholarId, string? type, bool unreadOnly)
    {
        var all = await db.Notifications.AsNoTracking().Include(n => n.Sender).Where(n => n.RecipientId == scholarId)
            .OrderByDescending(n => n.DateCreated).ThenByDescending(n => n.Id).ToListAsync();
        var filtered = all.Where(n => (string.IsNullOrWhiteSpace(type) || type.StartsWith("All") || n.NotificationType == type) && (!unreadOnly || !n.IsRead));
        var items = filtered.Select(ToScholarDto).ToList();
        return new ScholarNotificationsDto(items, all.Count, all.Count(n => !n.IsRead),
            all.Count(n => n.NotificationType == "Payment" || n.Title.Contains("Payment")), all.Count(n => n.NotificationType == "Alert"));
    }

    public static ScholarNotificationDto ToScholarDto(Notification n)
        => new(n.Id, n.Title, n.Message, n.NotificationType, n.DateCreated, n.IsRead, n.ReadAt, n.Sender?.Name ?? "System");

    public async Task MarkReadForScholarAsync(int scholarId, int id)
    {
        var n = await db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.RecipientId == scholarId) ?? throw AppException.NotFound("Notification");
        if (n.IsRead) return;
        n.IsRead = true; n.ReadAt = DateTime.Now;
        await db.SaveChangesAsync();
    }

    public async Task<int> MarkAllReadForScholarAsync(int scholarId)
    {
        var unread = await db.Notifications.Where(n => n.RecipientId == scholarId && !n.IsRead).ToListAsync();
        foreach (var n in unread) { n.IsRead = true; n.ReadAt = DateTime.Now; }
        await db.SaveChangesAsync();
        return unread.Count;
    }
}
