import { describe, expect, test } from "bun:test";
import { buildUserContent, guessMediaType, resolveInboundMediaUrl } from "../media.js";
import type { SendblueInboundMedia } from "../types.js";

const media: SendblueInboundMedia = {
  url: "https://cdn.sendblue.co/abc.jpg",
  mediaType: "image/jpeg",
  messageHandle: "h1",
  fromNumber: "+15557654321",
};

const noop = () => {};

describe("guessMediaType", () => {
  test("maps known extensions and ignores query strings", () => {
    expect(guessMediaType("https://x/y.png")).toBe("image/png");
    expect(guessMediaType("https://x/y.JPG?token=1")).toBe("image/jpeg");
    expect(guessMediaType("https://x/y.bin")).toBe("application/octet-stream");
  });
});

describe("resolveInboundMediaUrl", () => {
  test("returns the original URL when there is no hook", async () => {
    expect(await resolveInboundMediaUrl(null, media, noop)).toBe(media.url);
  });

  test("uses the hook's URL when it returns one", async () => {
    const persisted = "https://blob.vercel-storage.com/sendblue/h1.jpg";
    expect(await resolveInboundMediaUrl(() => persisted, media, noop)).toBe(persisted);
  });

  test("falls back to the original URL when the hook returns empty", async () => {
    expect(await resolveInboundMediaUrl(() => "", media, noop)).toBe(media.url);
  });

  test("falls back and logs when the hook throws", async () => {
    const logs: string[] = [];
    const url = await resolveInboundMediaUrl(
      () => {
        throw new Error("boom");
      },
      media,
      (m) => logs.push(m),
    );
    expect(url).toBe(media.url);
    expect(logs.some((l) => l.includes("persistMedia failed"))).toBe(true);
  });
});

describe("buildUserContent", () => {
  test("returns a plain string with no media", () => {
    expect(buildUserContent("hi")).toBe("hi");
  });

  test("returns text + file parts with media", () => {
    const content = buildUserContent("look", { url: media.url, mediaType: media.mediaType });
    expect(Array.isArray(content)).toBe(true);
    const parts = content as Array<{ type: string; mediaType?: string; data?: URL }>;
    expect(parts[0]).toEqual({ type: "text", text: "look" });
    expect(parts[1]?.type).toBe("file");
    expect(parts[1]?.mediaType).toBe("image/jpeg");
    expect(String(parts[1]?.data)).toBe(media.url);
  });
});
