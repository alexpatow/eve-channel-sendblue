import type { FilePart, UserContent } from "ai";
import type { SendblueInboundMedia, SendbluePersistMedia } from "./types.js";

const IMAGE_EXTS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  heic: "image/heic",
  webp: "image/webp",
};

/** Best-effort MIME type from a URL's file extension. */
export function guessMediaType(url: string): string {
  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS[ext] ?? "application/octet-stream";
}

/**
 * Resolve the URL to hand the model for an inbound attachment. With no
 * `persistMedia` hook, the Sendblue URL is used as-is. Otherwise the hook's
 * result is used, falling back to the original URL if it returns nothing or
 * throws, so media handling can never fail a turn.
 */
export async function resolveInboundMediaUrl(
  persistMedia: SendbluePersistMedia | null,
  media: SendblueInboundMedia,
  log: (message: string, detail?: unknown) => void,
): Promise<string> {
  if (!persistMedia) return media.url;
  try {
    const url = await persistMedia(media);
    return url || media.url;
  } catch (error) {
    log("[sendblue] persistMedia failed; using the Sendblue URL", {
      error: error instanceof Error ? error.message : String(error),
    });
    return media.url;
  }
}

/** Combine inbound text with an optional media file part into eve `UserContent`. */
export function buildUserContent(
  text: string,
  media?: { url: string; mediaType: string },
): string | UserContent {
  if (!media) return text;
  const filePart: FilePart = {
    type: "file",
    data: new URL(media.url),
    mediaType: media.mediaType,
  };
  return [{ type: "text", text }, filePart];
}
