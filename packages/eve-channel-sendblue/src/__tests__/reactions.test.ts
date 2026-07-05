import { describe, expect, test } from "bun:test";
import { REACTION_ALIASES, resolveReaction, VALID_REACTIONS } from "../reactions.js";

describe("resolveReaction", () => {
  test("passes through valid reactions (case-insensitive)", () => {
    expect(resolveReaction("love")).toBe("love");
    expect(resolveReaction("Emphasize")).toBe("emphasize");
  });

  test("maps common aliases", () => {
    expect(resolveReaction("heart")).toBe("love");
    expect(resolveReaction("thumbsup")).toBe("like");
    expect(resolveReaction("+1")).toBe("like");
    expect(resolveReaction("-1")).toBe("dislike");
    expect(resolveReaction("haha")).toBe("laugh");
    expect(resolveReaction("?")).toBe("question");
  });

  test("returns null for unsupported reactions", () => {
    expect(resolveReaction("rocket")).toBeNull();
    expect(resolveReaction("")).toBeNull();
  });

  test("exposes the canonical set and alias table", () => {
    expect(VALID_REACTIONS.has("love")).toBe(true);
    expect(REACTION_ALIASES.heart).toBe("love");
  });
});
