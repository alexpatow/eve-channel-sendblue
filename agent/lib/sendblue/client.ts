import SendblueAPI from "sendblue";
import type { ResolvedSendblueConfig, SendblueReaction } from "./types.js";

export interface SendTextParams {
  fromNumber: string;
  contactNumber: string;
  content: string;
  mediaUrl?: string;
}

export interface SendGroupParams {
  fromNumber: string;
  groupId: string;
  content: string;
}

export interface SendResult {
  messageHandle: string | null;
}

/**
 * Thin transport over the official Sendblue SDK. A single interface backs both
 * the live client and the dry-run client so the channel logic never branches on
 * which one it holds.
 */
export interface SendblueClient {
  sendText(params: SendTextParams): Promise<SendResult>;
  sendGroup(params: SendGroupParams): Promise<SendResult>;
  startTyping(params: { fromNumber: string; contactNumber: string }): Promise<void>;
  markRead(params: { fromNumber: string; contactNumber: string }): Promise<void>;
  addReaction(params: {
    fromNumber: string;
    messageHandle: string;
    reaction: SendblueReaction;
  }): Promise<void>;
  evaluateService(
    number: string,
  ): Promise<{ number?: string; service?: "iMessage" | "SMS" }>;
  /** Direct access to the official Sendblue SDK, or `null` in dry-run mode. */
  readonly sdk: SendblueAPI | null;
}

export function createSendblueClient(config: ResolvedSendblueConfig): SendblueClient {
  return config.dryRun
    ? createDryRunClient(config)
    : createLiveClient(config);
}

function createLiveClient(config: ResolvedSendblueConfig): SendblueClient {
  const sdk = new SendblueAPI({
    apiKey: config.apiKey ?? undefined,
    apiSecret: config.apiSecret ?? undefined,
  });

  return {
    sdk,

    async sendText({ fromNumber, contactNumber, content, mediaUrl }) {
      const response = await sdk.messages.send({
        number: contactNumber,
        from_number: fromNumber,
        content,
        media_url: mediaUrl,
        ...(config.statusCallbackUrl
          ? { status_callback: config.statusCallbackUrl }
          : {}),
      });
      return { messageHandle: response.message_handle ?? null };
    },

    async sendGroup({ fromNumber, groupId, content }) {
      const response = await sdk.groups.sendMessage({
        from_number: fromNumber,
        content,
        group_id: groupId,
      });
      return { messageHandle: response.message_handle ?? null };
    },

    async startTyping({ fromNumber, contactNumber }) {
      try {
        await sdk.typingIndicators.send({
          number: contactNumber,
          from_number: fromNumber,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A missing route mapping just means we have never messaged them yet.
        if (message.includes("No route mapping")) {
          config.log("[sendblue] typing indicator skipped: no route mapping", {
            contactNumber,
          });
          return;
        }
        throw error;
      }
    },

    async markRead({ fromNumber, contactNumber }) {
      await sdk.post("/api/mark-read", {
        body: { number: contactNumber, from_number: fromNumber },
      });
    },

    async addReaction({ fromNumber, messageHandle, reaction }) {
      await sdk.post("/api/send-reaction", {
        body: { from_number: fromNumber, message_handle: messageHandle, reaction },
      });
    },

    async evaluateService(number) {
      return sdk.lookups.lookupNumber({ number });
    },
  };
}

function createDryRunClient(config: ResolvedSendblueConfig): SendblueClient {
  const dryHandle = () => `dry-${Math.round(performance.now())}`;

  return {
    sdk: null,

    async sendText({ fromNumber, contactNumber, content, mediaUrl }) {
      config.log(`[sendblue:dry-run] SEND ${fromNumber} → ${contactNumber}`, {
        content,
        ...(mediaUrl ? { mediaUrl } : {}),
      });
      return { messageHandle: dryHandle() };
    },

    async sendGroup({ fromNumber, groupId, content }) {
      config.log(`[sendblue:dry-run] SEND ${fromNumber} → group ${groupId}`, {
        content,
      });
      return { messageHandle: dryHandle() };
    },

    async startTyping({ contactNumber }) {
      config.log(`[sendblue:dry-run] TYPING → ${contactNumber}`);
    },

    async markRead({ contactNumber }) {
      config.log(`[sendblue:dry-run] MARK READ → ${contactNumber}`);
    },

    async addReaction({ messageHandle, reaction }) {
      config.log(`[sendblue:dry-run] REACT ${reaction} → ${messageHandle}`);
    },

    async evaluateService(number) {
      config.log(`[sendblue:dry-run] LOOKUP ${number}`);
      return { number, service: "iMessage" };
    },
  };
}
