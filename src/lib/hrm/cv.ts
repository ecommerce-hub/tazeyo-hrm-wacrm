import { extensionForMime, sanitizeFilename } from "@/lib/media/filename";

// What the HRM's CV endpoint accepts (its own limits — mirrored here so
// a doomed upload fails fast with a local message instead of a round
// trip): 10 MB, PDF/Word/image only.

export const CV_MAX_BYTES = 10 * 1024 * 1024;

export const CV_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
] as const;

/**
 * Filename to send the HRM for a CV sourced from a chat message. The
 * HRM renames the file to `First_Last_CV.<ext>` anyway, so only the
 * extension really matters — it's taken from the message's filename
 * (`content_text`) when it carries an accepted one, else derived from
 * the MIME type. Returns null when neither source yields an accepted
 * extension (e.g. a .xlsx document), so the caller can reject early.
 */
export function cvFilename(
  rawName: string | null | undefined,
  mimeType?: string | null,
): string | null {
  const name = sanitizeFilename(rawName ?? "");
  const dot = name.lastIndexOf(".");
  const nameExt = dot > 0 ? name.slice(dot).toLowerCase() : "";
  if ((CV_ALLOWED_EXTENSIONS as readonly string[]).includes(nameExt)) {
    return name;
  }

  const mimeExt = `.${extensionForMime(mimeType)}`;
  if ((CV_ALLOWED_EXTENSIONS as readonly string[]).includes(mimeExt)) {
    return name ? `${name}${mimeExt}` : `cv${mimeExt}`;
  }
  return null;
}
