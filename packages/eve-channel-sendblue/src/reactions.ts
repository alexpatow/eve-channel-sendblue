import type { SendblueReaction } from "./types.js";

/** Sendblue's six supported tapback types. */
export const VALID_REACTIONS: ReadonlySet<string> = new Set<SendblueReaction>([
  "love",
  "like",
  "dislike",
  "laugh",
  "emphasize",
  "question",
]);

/** Common emoji names mapped onto Sendblue tapbacks. */
export const REACTION_ALIASES: Record<string, SendblueReaction> = {
  heart: "love",
  thumbs_up: "like",
  thumbsup: "like",
  "+1": "like",
  thumbs_down: "dislike",
  thumbsdown: "dislike",
  "-1": "dislike",
  haha: "laugh",
  exclamation: "emphasize",
  "!!": "emphasize",
  "?": "question",
};

/** Resolve an emoji name or alias to a Sendblue tapback, or `null` if unsupported. */
export function resolveReaction(name: string): SendblueReaction | null {
  const lower = name.toLowerCase();
  if (VALID_REACTIONS.has(lower)) return lower as SendblueReaction;
  return REACTION_ALIASES[lower] ?? null;
}
