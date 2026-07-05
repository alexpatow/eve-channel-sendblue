import type { SendblueClient } from "./client.js";
import { toPlainText } from "./format.js";
import { resolveReaction } from "./reactions.js";
import type {
  ResolvedSendblueConfig,
  SendblueChannelState,
  SendblueContext,
  SendblueThreadHandle,
} from "./types.js";

/**
 * Build the per-step `channel` context handed to event handlers. The returned
 * handle closes over live session `state`, so `reply()` always targets the line
 * and contact the current conversation belongs to. State mutations here are
 * written back to durable adapter state by the framework.
 */
export function buildContext(
  state: SendblueChannelState,
  client: SendblueClient,
  config: ResolvedSendblueConfig,
): SendblueContext {
  const isGroup = Boolean(state.groupId);

  const requireFrom = (): string => {
    const from = state.fromNumber ?? config.fromNumber;
    if (!from) {
      throw new Error(
        "sendblueChannel: no sending number available. Seed state.fromNumber or set fromNumber/SENDBLUE_FROM_NUMBER.",
      );
    }
    return from;
  };

  const handle: SendblueThreadHandle = {
    isGroup,

    async reply(text) {
      const content = toPlainText(text);
      if (!content.trim()) return;
      const fromNumber = requireFrom();

      const result = state.groupId
        ? await client.sendGroup({ fromNumber, groupId: state.groupId, content })
        : await client.sendText({
            fromNumber,
            contactNumber: requireContact(state),
            content,
          });

      state.lastMessageHandle = result.messageHandle;
    },

    async sendMedia(mediaUrl, caption) {
      if (state.groupId) {
        config.log("[sendblue] sendMedia is not supported for group threads");
        return;
      }
      const result = await client.sendText({
        fromNumber: requireFrom(),
        contactNumber: requireContact(state),
        content: caption ?? "",
        mediaUrl,
      });
      state.lastMessageHandle = result.messageHandle;
    },

    async startTyping() {
      if (state.groupId) return;
      await client.startTyping({
        fromNumber: requireFrom(),
        contactNumber: requireContact(state),
      });
    },

    async markRead() {
      if (state.groupId) return;
      await client.markRead({
        fromNumber: requireFrom(),
        contactNumber: requireContact(state),
      });
    },

    async addReaction(messageHandle, reaction) {
      const resolved =
        typeof reaction === "string" ? resolveReaction(reaction) : null;
      if (!resolved) {
        config.log("[sendblue] unsupported reaction, ignoring", { reaction });
        return;
      }
      await client.addReaction({
        fromNumber: requireFrom(),
        messageHandle,
        reaction: resolved,
      });
    },
  };

  return { state, sendblue: handle };
}

function requireContact(state: SendblueChannelState): string {
  if (!state.contactNumber) {
    throw new Error("sendblueChannel: no contact number on this 1:1 thread.");
  }
  return state.contactNumber;
}
