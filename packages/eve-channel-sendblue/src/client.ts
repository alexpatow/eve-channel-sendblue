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
 * Thin transport over the official Sendblue SDK. Credentials resolve lazily on
 * first use; when they resolve empty (or `dryRun` is set), every call logs its
 * payload and returns a synthetic handle instead of hitting the API, so the
 * channel runs end to end with no account.
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
  evaluateService(number: string): Promise<{ number?: string; service?: "iMessage" | "SMS" }>;
  /** The official Sendblue SDK once credentials resolve, or `null` in dry-run. */
  getSdk(): Promise<SendblueAPI | null>;
}

/** A synthetic message handle returned by dry-run sends. */
function dryHandle(): string {
  return `dry-${Math.round(performance.now())}`;
}

export function createSendblueClient(config: ResolvedSendblueConfig): SendblueClient {
  let sdkPromise: Promise<SendblueAPI | null> | null = null;

  const getSdk = (): Promise<SendblueAPI | null> => {
    if (config.dryRun) return Promise.resolve(null);
    if (!sdkPromise) {
      sdkPromise = (async () => {
        const [apiKey, apiSecret] = await Promise.all([config.apiKey(), config.apiSecret()]);
        if (!apiKey || !apiSecret) {
          config.log(
            "[sendblue] Credentials unavailable — falling back to dry-run (outbound messages are logged, not sent).",
          );
          return null;
        }
        return new SendblueAPI({ apiKey, apiSecret });
      })();
    }
    return sdkPromise;
  };

  return {
    getSdk,

    async sendText({ fromNumber, contactNumber, content, mediaUrl }) {
      const sdk = await getSdk();
      if (!sdk) {
        config.log(`[sendblue:dry-run] SEND ${fromNumber} → ${contactNumber}`, {
          content,
          ...(mediaUrl ? { mediaUrl } : {}),
        });
        return { messageHandle: dryHandle() };
      }
      const response = await sdk.messages.send({
        number: contactNumber,
        from_number: fromNumber,
        content,
        media_url: mediaUrl,
        ...(config.statusCallbackUrl ? { status_callback: config.statusCallbackUrl } : {}),
      });
      return { messageHandle: response.message_handle ?? null };
    },

    async sendGroup({ fromNumber, groupId, content }) {
      const sdk = await getSdk();
      if (!sdk) {
        config.log(`[sendblue:dry-run] SEND ${fromNumber} → group ${groupId}`, {
          content,
        });
        return { messageHandle: dryHandle() };
      }
      const response = await sdk.groups.sendMessage({
        from_number: fromNumber,
        content,
        group_id: groupId,
      });
      return { messageHandle: response.message_handle ?? null };
    },

    async startTyping({ fromNumber, contactNumber }) {
      const sdk = await getSdk();
      if (!sdk) {
        config.log(`[sendblue:dry-run] TYPING → ${contactNumber}`);
        return;
      }
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
      const sdk = await getSdk();
      if (!sdk) {
        config.log(`[sendblue:dry-run] MARK READ → ${contactNumber}`);
        return;
      }
      await sdk.post("/api/mark-read", {
        body: { number: contactNumber, from_number: fromNumber },
      });
    },

    async addReaction({ fromNumber, messageHandle, reaction }) {
      const sdk = await getSdk();
      if (!sdk) {
        config.log(`[sendblue:dry-run] REACT ${reaction} → ${messageHandle}`);
        return;
      }
      await sdk.post("/api/send-reaction", {
        body: { from_number: fromNumber, message_handle: messageHandle, reaction },
      });
    },

    async evaluateService(number) {
      const sdk = await getSdk();
      if (!sdk) {
        config.log(`[sendblue:dry-run] LOOKUP ${number}`);
        return { number, service: "iMessage" };
      }
      return sdk.lookups.lookupNumber({ number });
    },
  };
}
