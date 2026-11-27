// =====================================================================
// UploadRules.cs - which uploaded files are accepted (type and size).
// Used by ComplianceService for the documents scholars and admins upload.
// =====================================================================
using IskolarAid.Core.Common;

namespace IskolarAid.Core.Services;

// Settings from the "Uploads" config section: the max file size (default 10 MB).
// (Files themselves are stored in the database, in file_attachments.)
public class UploadOptions
{
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;
}

// Which files are allowed, and which content type to send back when downloading.
public static class UploadRules
{
    public static readonly string[] AllowedExtensions = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

    public static string ContentType(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".doc" => "application/msword",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        _ => "application/octet-stream"
    };

    // [VALIDATION] the ONE place that decides which uploaded documents are accepted (called by ComplianceService.AttachFileAsync).
    // Checks extension and size. Returns the clean file name, or throws a friendly AppException.
    public static string Validate(string fileName, long length, long maxBytes)
    {
        var name = Path.GetFileName(fileName);
        var ext = Path.GetExtension(name).ToLowerInvariant();
        // [VALIDATION] rejects with 400: "Only PDF, Word and image (JPG/PNG) files are allowed."
        if (!AllowedExtensions.Contains(ext)) throw new AppException("Only PDF, Word and image (JPG/PNG) files are allowed.");
        // [VALIDATION] rejects with 400: "The file is empty."
        if (length <= 0) throw new AppException("The file is empty.");
        // [VALIDATION] rejects with 400: "File is too large (max {maxBytes / 1024 / 1024} MB)."
        if (length > maxBytes) throw new AppException($"File is too large (max {maxBytes / 1024 / 1024} MB).");
        return name;
    }
}
