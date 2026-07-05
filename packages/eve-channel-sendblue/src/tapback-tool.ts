import { defineTool } from "eve/tools";
import { createSendblueClient } from "./client.js";
import { resolveConfig } from "./config.js";
import { resolveReaction } from "./reactions.js";
import type { SendblueChannelConfig } from "./types.js";

const REACTIONS = ["love", "like", "dislike", "laugh", "emphasize", "question"] as const;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * An eve tool that lets the agent add an iMessage tapback to the person's most
 * recent message. Drop it in `agent/tools/send_tapback.ts`:
 *
 * ```ts
 * import { sendblueTapbackTool } from "eve-channel-sendblue";
 * export default sendblueTapbackTool();
 * ```
 *
 * It reads the target line and message handle from the session auth that the
 * Sendblue channel stamps on every inbound turn (`auth.current` is always the
 * most recent message), so it reacts to whatever triggered the current turn.
 * Credentials resolve the same way as {@link sendblueChannel}.
 */
export function sendblueTapbackTool(config: SendblueChannelConfig = {}) {
  const resolved = resolveConfig(config);
  const client = createSendblueClient(resolved);

  return defineTool({
    description:
      "React to the person's most recent iMessage with a tapback instead of a full reply. Use it to acknowledge or emphasize. One of: love, like, dislike, laugh, emphasize, question.",
    inputSchema: {
      type: "object",
      properties: {
        reaction: {
          type: "string",
          enum: [...REACTIONS],
          description: "The tapback to add.",
        },
      },
      required: ["reaction"],
      additionalProperties: false,
    },
    async execute(input, ctx) {
      const reaction = resolveReaction(String(input.reaction ?? ""));
      if (!reaction) return { ok: false, error: "Unsupported reaction." };

      const attributes = ctx.session.auth.current?.attributes ?? {};
      const fromNumber = readString(attributes.sendblueLine);
      const messageHandle = readString(attributes.sendblueMessageHandle);
      if (!fromNumber || !messageHandle) {
        resolved.log("[sendblue] tapback skipped: no message in context");
        return { ok: false, error: "No Sendblue message in the current context." };
      }

      resolved.log("[sendblue] tapback →", { reaction, messageHandle });
      try {
        await client.addReaction({ fromNumber, messageHandle, reaction });
        resolved.log("[sendblue] tapback ok");
        return { ok: true, reaction };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        resolved.log("[sendblue] tapback failed", { error: message });
        return { ok: false, error: message };
      }
    },
  });
}
