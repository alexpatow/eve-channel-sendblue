import { put } from "@vercel/blob";
import type { SendbluePersistMedia } from "eve-channel-sendblue";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/webp": "webp",
};

/**
 * Persist inbound Sendblue media to public Vercel Blob and hand the model the
 * durable URL. Sendblue's own media URLs expire after ~30 days; Blob URLs do
 * not, so the model can still see the image on any later turn. Sendblue media is
 * already public and unguessable, so public Blob is no privacy change.
 *
 * Requires a Blob store connected to the project (Vercel injects
 * `BLOB_READ_WRITE_TOKEN`). Without the token, the Sendblue URL is kept as-is.
 */
export const persistMediaToBlob: SendbluePersistMedia = async (media) => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return media.url;

  const res = await fetch(media.url);
  if (!res.ok) return media.url;

  const ext = EXT[media.mediaType] ?? "bin";
  const blob = await put(`sendblue/${media.messageHandle}.${ext}`, await res.arrayBuffer(), {
    access: "public",
    contentType: media.mediaType,
    addRandomSuffix: true,
    token,
  });
  return blob.url;
};
