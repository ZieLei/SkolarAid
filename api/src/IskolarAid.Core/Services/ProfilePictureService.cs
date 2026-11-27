// =====================================================================
// ProfilePictureService.cs - profile pictures (one per user).
//
// Stored in the profile_pictures table (not on disk). Called by
// ProfilePictureController:
//   GET/PUT/DELETE /api/me/picture             -> your own picture
//   GET /api/admin/scholars/{id}/picture        -> admin sees a scholar's picture
// =====================================================================
using IskolarAid.Core.Common;
using IskolarAid.Data;
using IskolarAid.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace IskolarAid.Core.Services;

public class ProfilePictureService(IskolarDbContext db, ActivityLogService log)
{
    public const long MaxBytes = 5 * 1024 * 1024;

    // The picture of a user, or null if they have none.
    public async Task<(byte[] Data, string ContentType)?> GetAsync(int userId)
    {
        var p = await db
            .ProfilePictures.AsNoTracking()
            .FirstOrDefaultAsync(x => x.UserId == userId);
        return p is null ? null : (p.Data, p.ContentType);
    }

    // The picture of a scholar (looked up through their login account).
    public async Task<(byte[] Data, string ContentType)?> GetForScholarAsync(int scholarId)
    {
        var userId = await db
            .Scholars.Where(s => s.Id == scholarId)
            .Select(s => s.UserId)
            .FirstOrDefaultAsync();
        return userId is null ? null : await GetAsync(userId.Value);
    }

    // [ENTRY] PUT /api/me/picture (ProfilePictureController.Upload). [VALIDATION] size and real image type are checked below.
    // Save (or replace) a user's picture. Only JPG, PNG and WebP images up to 5 MB.
    public async Task SetAsync(int userId, byte[] data)
    {
        // [VALIDATION] rejects with 400: "The image is empty."
        if (data.Length == 0)
            throw new AppException("The image is empty.");
        // [VALIDATION] rejects with 400: "The picture is too large (max 5 MB)."
        if (data.Length > MaxBytes)
            throw new AppException("The picture is too large (max 5 MB).");
        // Check the file's first bytes, not its name, so only real images are accepted.
        // [VALIDATION] rejects with 400: "Please choose a JPG, PNG or WebP image."
        var type = ImageType(data)
            ?? throw new AppException("Please choose a JPG, PNG or WebP image.");

        var p = await db.ProfilePictures.FirstOrDefaultAsync(x => x.UserId == userId);
        if (p is null)
            db.ProfilePictures.Add(p = new ProfilePicture { UserId = userId });
        p.Data = data;
        p.ContentType = type;
        p.UpdatedAt = DateTime.Now;
        await db.SaveChangesAsync();
        await log.LogUpdate("users", userId, "Changed profile picture");
    }

    public async Task DeleteAsync(int userId)
    {
        var p = await db.ProfilePictures.FirstOrDefaultAsync(x => x.UserId == userId);
        if (p is null)
            return;
        db.ProfilePictures.Remove(p);
        await db.SaveChangesAsync();
        await log.LogDelete("users", userId, "Removed profile picture");
    }

    // JPG starts with FF D8 FF, PNG with 89 'PNG', WebP with 'RIFF' .... 'WEBP'.
    private static string? ImageType(byte[] d)
    {
        if (d.Length > 3 && d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF)
            return "image/jpeg";
        if (d.Length > 8 && d[0] == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47)
            return "image/png";
        if (
            d.Length > 12
            && d[0] == 0x52
            && d[1] == 0x49
            && d[2] == 0x46
            && d[3] == 0x46
            && d[8] == 0x57
            && d[9] == 0x45
            && d[10] == 0x42
            && d[11] == 0x50
        )
            return "image/webp";
        return null;
    }
}
