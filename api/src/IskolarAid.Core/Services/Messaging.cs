// =====================================================================
// Messaging.cs - sending email, plus the email templates.
//
// Sending is "best effort": if not configured or the send fails,
// it logs it and returns false. It never crashes the request.
// Email: any SMTP server (Mailpit while developing).
// =====================================================================
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace IskolarAid.Core.Services;

// Email settings from the "Smtp" config section. Enabled only when Host and FromAddress are set.
public class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string User { get; set; } = "";
    public string Password { get; set; } = "";
    public string FromAddress { get; set; } = "";
    public string FromName { get; set; } = "Legacy College of Compostela - IskolarAid";
    public string LoginUrl { get; set; } = "http://localhost:4200/login";
    // The sign-up page sits next to the login page: ".../login" -> ".../signup".
    public string SignUpUrl => LoginUrl.EndsWith("/login") ? LoginUrl[..^"/login".Length] + "/signup" : LoginUrl.TrimEnd('/') + "/signup";
    public bool Enabled => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(FromAddress);
}

public interface IEmailSender
{
    Task<bool> SendAsync(string toAddress, string toName, string subject, string htmlBody, CancellationToken ct = default);
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
            await client.ConnectAsync(o.Host, o.Port, TlsMode(o), ct);
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

    /// <summary>
    /// Port 465 is implicit TLS. Any other port must upgrade with STARTTLS, so credentials never cross the network in plain text.
    /// The one exception is a mail server on this machine (e.g. Mailpit for local dev), which may not offer TLS at all.
    /// </summary>
    public static SecureSocketOptions TlsMode(SmtpOptions o) =>
        o.Port == 465 ? SecureSocketOptions.SslOnConnect
        : IsLoopback(o.Host) ? SecureSocketOptions.StartTlsWhenAvailable
        : SecureSocketOptions.StartTls;

    private static bool IsLoopback(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || (System.Net.IPAddress.TryParse(host, out var ip) && System.Net.IPAddress.IsLoopback(ip));
}

// Ready-made HTML emails. Wrap() adds the shared header and footer.
// E() HTML-encodes user text so names cannot inject HTML into the email.
public static class MessageTemplates
{
    private static string Wrap(string title, string inner) => $@"<!DOCTYPE html><html><body style=""font-family:'Century Gothic',Arial,sans-serif;background:#f4f6f8;padding:20px"">
<div style=""max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)"">
<div style=""background:linear-gradient(135deg,#00444F,#006875);padding:28px;text-align:center;color:#fff""><h1 style=""margin:0;font-size:22px"">{System.Net.WebUtility.HtmlEncode(title)}</h1></div>
<div style=""padding:28px;color:#333;line-height:1.5"">{inner}</div>
<div style=""background:#f0f7f8;padding:14px;text-align:center;font-size:12px;color:#666"">Legacy College of Compostela - IskolarAid</div></div></body></html>";

    private static string E(string? s) => System.Net.WebUtility.HtmlEncode(s ?? "");

    // Sent when an admin adds a scholar (or approves an old application). The scholar then
    // signs up on the website with their Scholar ID and chooses their own password.
    public static (string subject, string body) SignUpInvite(string fullName, string scholarNumber, string studentId, string signUpUrl)
        => ($"IskolarAid - Activate your scholar account - {fullName}", Wrap("Welcome to IskolarAid!",
            $@"<p>Dear <b>{E(fullName)}</b>,</p><p>The Scholarship Office has added you to IskolarAid.</p>
<p><b>Your Scholar ID:</b> {E(scholarNumber)}<br/><b>Your Student ID (username):</b> {E(studentId)}</p>
<p>To start, open <a href=""{E(signUpUrl)}"">{E(signUpUrl)}</a>, enter your Scholar ID and your Student ID or this email address, then choose your password.</p>"));

    public static (string subject, string body) Rejection(string name, string reason)
        => ("IskolarAid - Registration Update", Wrap("Registration Update",
            $@"<p>Dear <b>{E(name)}</b>,</p><p>We regret to inform you that your scholarship registration was not approved.</p><p><b>Reason:</b> {E(reason)}</p><p>You may contact the Scholarship Office for more information.</p>"));

    public static (string subject, string body) PaymentProcessed(string name, string period, decimal amount, string method, string scholarNumber, string reference, DateTime releaseDate)
        => ($"IskolarAid - Stipend Processed ({period})", Wrap("Stipend Processed",
            $@"<p>Dear <b>{E(name)}</b> ({E(scholarNumber)}),</p><p>Your stipend for <b>{E(period)}</b> has been processed.</p>
<p><b>Amount:</b> ₱{amount:N2}<br/><b>Method:</b> {E(method)}<br/><b>Reference:</b> {E(reference)}<br/><b>Expected release:</b> {releaseDate:MMM dd, yyyy}</p>"));

    public static (string subject, string body) PaymentReleased(string name, string period, decimal amount, string method, string reference)
        => ($"IskolarAid - Stipend Released ({period})", Wrap("Payment Released!",
            $@"<p>Dear <b>{E(name)}</b>,</p><p>Your stipend for <b>{E(period)}</b> has been <b>released</b>.</p>
<p><b>Amount:</b> ₱{amount:N2}<br/><b>Method:</b> {E(method)}<br/><b>Reference:</b> {E(reference)}</p><p>Funds should reflect within 1-3 business days.</p>"));

    public static (string subject, string body) Notification(string name, string title, string message)
        => ($"IskolarAid - {title}", Wrap(title, $"<p>Dear <b>{E(name)}</b>,</p><p>{E(message).Replace("\n", "<br/>")}</p>"));
}
