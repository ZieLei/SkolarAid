using Microsoft.Extensions.Options;
using IskolarAid.Core.Common;

namespace IskolarAid.Core.Services;

public class UploadOptions
{
    public string Directory { get; set; } = "uploads";
    public long MaxBytes { get; set; } = 10 * 1024 * 1024;
}

public interface IFileStore
{
    Task<string> SaveAsync(string key, string originalName, Stream content);
    Task<byte[]?> ReadAsync(string relativePath);
}

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

    public static string Validate(string fileName, long length, long maxBytes)
    {
        var name = Path.GetFileName(fileName);
        var ext = Path.GetExtension(name).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext)) throw new AppException("Only PDF, Word and image (JPG/PNG) files are allowed.");
        if (length <= 0) throw new AppException("The file is empty.");
        if (length > maxBytes) throw new AppException($"File is too large (max {maxBytes / 1024 / 1024} MB).");
        return name;
    }
}

/// <summary>Stores registration uploads on disk under a configured directory using generated file names.</summary>
public class LocalFileStore(IOptions<UploadOptions> options) : IFileStore
{
    private string Root => Path.GetFullPath(options.Value.Directory);

    public async Task<string> SaveAsync(string key, string originalName, Stream content)
    {
        var ext = Path.GetExtension(originalName).ToLowerInvariant();
        var safe = $"{key}_{DateTime.Now:yyyyMMddHHmmss}_{Guid.NewGuid():N}{ext}";
        var dir = Path.Combine(Root, "registrations");
        Directory.CreateDirectory(dir);
        await using var fs = File.Create(Path.Combine(dir, safe));
        await content.CopyToAsync(fs);
        return $"registrations/{safe}";
    }

    public async Task<byte[]?> ReadAsync(string relativePath)
    {
        var full = Path.GetFullPath(Path.Combine(Root, relativePath));
        if (!full.StartsWith(Root, StringComparison.Ordinal) || !File.Exists(full)) return null; // no path traversal
        return await File.ReadAllBytesAsync(full);
    }
}
