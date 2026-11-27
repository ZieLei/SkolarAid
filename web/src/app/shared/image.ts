// =====================================================================
// image.ts - shrink a photo in the browser before uploading it.
//
// Phone photos are often 3-8 MB and 4000+ pixels wide, but a profile
// picture is shown at 96 px at most. Uploading the original is slow over
// Wi-Fi, and every <app-avatar> would download those megabytes again on
// every page. So we redraw it at most 512 x 512 px as a JPEG (~50-150 KB).
// If the browser cannot read the image (an unusual format), the original
// file is returned unchanged and the API decides (JPG, PNG or WebP only).
// =====================================================================

export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** Returns a smaller JPEG of `file` (longest side <= maxSide), or `file` itself when shrinking is not possible or not needed. */
export async function shrinkImage(file: File, maxSide = 512, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the EXIF rotation, so portrait phone photos are not turned sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    // Already small (in pixels and bytes): keep the original, no quality loss.
    if (scale === 1 && file.size <= 300 * 1024) return file;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff'; // JPEG has no transparency: put transparent PNG areas on white, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } finally {
    bitmap.close();
  }
}
