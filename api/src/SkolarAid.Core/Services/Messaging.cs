using System.Net.Http.Json;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace SkolarAid.Core.Services;

public class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string User { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "";
    public string FromName { get; set; } = "Legacy College of Compostela - ScholarAid";
    public string LoginUrl { get; set; } = "http://localhost:4200/login";
    public bool Enabled => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(FromAddress);
}

public class SmsOptions
{
    public string Url { get; set; } = "https://api.semaphore.co/api/v4/messages";
    public string ApiKey { get; set; } = "";
    public string SenderName { get; set; } = "";
    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey);
}

public interface IEmailSender
{
    Task<bool> SendAsync(string toAddress, string toName, string subject, string htmlBody, CancellationToken ct = default);
}

public interface ISmsSender
{
    Task<bool> SendAsync(string phoneNumber, string message, CancellationToken ct = default);
}

/// <summary>SMTP sender. Credentials come only from configuration; with no host configured it logs and returns false.</summary>
public class SmtpEmailSender(IOptions<SmtpOptions> options, ILogger<SmtpEmailSender> log) : IEmailSender
{
    public async Task<bool> SendAsync(string toAddress, string toName, string subject, string htmlBody, CancellationToken ct = default)
    {
        var o = options.Value;
        if (!o.Enabled || string.IsNullOrWhiteSpace(toAddress))
        {
            log.LogInformation("Email disabled or no recipient; skipped '{Subject}'", subject);
            return false;
        }
        try
        {
            var msg = new MimeMessage();
            msg.From.Add(new MailboxAddress(o.FromName, o.FromAddress));
            msg.To.Add(new MailboxAddress(toName, toAddress));
            msg.Subject = subject;
            msg.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();
            using var client = new SmtpClient();
            await client.ConnectAsync(o.Host, o.Port, SecureSocketOptions.StartTls, ct);
            if (!string.IsNullOrEmpty(o.User)) await client.AuthenticateAsync(o.User, o.Password, ct);
            await client.SendAsync(msg, ct);
            await client.DisconnectAsync(true, ct);
            return true;
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Failed to send email '{Subject}'", subject);
            return false;
        }
    }
}

public class SemaphoreSmsSender(HttpClient http, IOptions<SmsOptions> options, ILogger<SemaphoreSmsSender> log) : ISmsSender
{
    public async Task<bool> SendAsync(string phoneNumber, string message, CancellationToken ct = default)
    {
        var o = options.Value;
        if (!o.Enabled || string.IsNullOrWhiteSpace(phoneNumber))
        {
            log.LogInformation("SMS disabled or no recipient; skipped");
            return false;
        }
        try
        {
            var form = new Dictionary<string, string>
            {
                ["apikey"] = o.ApiKey,
                ["number"] = Rules.ScholarRules.NormalizePhone(phoneNumber),
                ["message"] = message
            };
            if (!string.IsNullOrWhiteSpace(o.SenderName)) form["sendername"] = o.SenderName;
            using var res = await http.PostAsync(o.Url, new FormUrlEncodedContent(form), ct);
            return res.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Failed to send SMS");
            return false;
        }
    }
}

public static class MessageTemplates
{
    private static string Wrap(string title, string inner) => $@"<!DOCTYPE html><html><body style=""font-family:'Century Gothic',Arial,sans-serif;background:#f4f6f8;padding:20px"">
<div style=""max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)"">
<div style=""background:linear-gradient(135deg,#00444F,#006875);padding:28px;text-align:center;color:#fff""><h1 style=""margin:0;font-size:22px"">{System.Net.WebUtility.HtmlEncode(title)}</h1></div>
<div style=""padding:28px;color:#333;line-height:1.5"">{inner}</div>
<div style=""background:#f0f7f8;padding:14px;text-align:center;font-size:12px;color:#666"">Legacy College of Compostela - ScholarAid</div></div></body></html>";

    private static string E(string? s) => System.Net.WebUtility.HtmlEncode(s ?? "");

    public static (string subject, string body) Welcome(string fullName, string scholarNumber, string studentId, string password, string loginUrl)
        => ($"ScholarAid - Welcome New Scholar - {fullName}", Wrap("Welcome to ScholarAid!",
            $@"<p>Dear <b>{E(fullName)}</b>,</p><p>Your scholar account has been created.</p>
<p><b>Scholar Number:</b> {E(scholarNumber)}<br/><b>Username (Student ID):</b> {E(studentId)}<br/><b>Temporary password:</b> <code>{E(password)}</code></p>
<p>Log in at <a href=""{E(loginUrl)}"">{E(loginUrl)}</a> and keep this password safe.</p>"));

    public static (string subject, string body) Rejection(string name, string reason)
        => ("ScholarAid - Registration Update", Wrap("Registration Update",
            $@"<p>Dear <b>{E(name)}</b>,</p><p>We regret to inform you that your scholarship registration was not approved.</p><p><b>Reason:</b> {E(reason)}</p><p>You may contact the Scholarship Office for more information.</p>"));

    public static (string subject, string body) PaymentProcessed(string name, string period, decimal amount, string method, string scholarNumber, string reference, DateTime releaseDate)
        => ($"ScholarAid - Stipend Processed ({period})", Wrap("Stipend Processed",
            $@"<p>Dear <b>{E(name)}</b> ({E(scholarNumber)}),</p><p>Your stipend for <b>{E(period)}</b> has been processed.</p>
<p><b>Amount:</b> ₱{amount:N2}<br/><b>Method:</b> {E(method)}<br/><b>Reference:</b> {E(reference)}<br/><b>Expected release:</b> {releaseDate:MMM dd, yyyy}</p>"));

    public static (string subject, string body) PaymentReleased(string name, string period, decimal amount, string method, string reference)
        => ($"ScholarAid - Stipend Released ({period})", Wrap("Payment Released!",
            $@"<p>Dear <b>{E(name)}</b>,</p><p>Your stipend for <b>{E(period)}</b> has been <b>released</b>.</p>
<p><b>Amount:</b> ₱{amount:N2}<br/><b>Method:</b> {E(method)}<br/><b>Reference:</b> {E(reference)}</p><p>Funds should reflect within 1-3 business days.</p>"));

    public static (string subject, string body) Notification(string name, string title, string message)
        => ($"ScholarAid - {title}", Wrap(title, $"<p>Dear <b>{E(name)}</b>,</p><p>{E(message).Replace("\n", "<br/>")}</p>"));
}
