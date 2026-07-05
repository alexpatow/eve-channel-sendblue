import type { FilePart, UserContent } from "ai";
import {
  type Channel,
  type ChannelEvents,
  defineChannel,
  POST,
  type RouteHandlerArgs,
  type SendFn,
} from "eve/channels";
import { createSendblueClient, type SendblueClient } from "./client.js";
import { resolveConfig } from "./config.js";
import { buildContext } from "./context.js";
import {
  routingFromPayload,
  sendblueContinuationToken,
} from "./continuation-token.js";
import type {
  ResolvedSendblueConfig,
  SendblueChannelConfig,
  SendblueChannelMetadata,
  SendblueChannelState,
  SendblueContext,
  SendblueInboundMessage,
  SendblueMessagePayload,
  SendblueReceiveTarget,
} from "./types.js";
import {
  formatInboundContext,
  isMessagePayload,
  isSenderAllowed,
  isServiceAllowed,
  isTypingPayload,
  verifyWebhookSecret,
} from "./webhook.js";

const IMAGE_EXTS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  heic: "image/heic",
  webp: "image/webp",
};

function guessMediaType(url: string): string {
  const ext = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS[ext] ?? "application/octet-stream";
}

function initialState(): SendblueChannelState {
  return {
    fromNumber: null,
    contactNumber: null,
    groupId: null,
    lastMessageHandle: null,
  };
}

/**
 * Default session-lifecycle handlers. The completed assistant message is sent
 * back over Sendblue; tool-call steps and empty messages are skipped. Failures
 * get a short apology so the person is not left hanging.
 */
const defaultEvents: ChannelEvents<SendblueContext> = {
  async "message.completed"(event, channel) {
    if (event.finishReason === "tool-calls" || !event.message) return;
    await channel.sendblue.reply(event.message);
  },
  async "turn.failed"(_event, channel) {
    await channel.sendblue.reply(
      "Sorry, I hit an error handling your message. Please try again.",
    );
  },
};

/**
 * Put your agent on iMessage and SMS through Sendblue. Inbound messages arrive
 * as a webhook and start or resume an eve session; completed replies are sent
 * back over the same line. The channel mounts one route:
 *
 *   POST <route>/webhook   (default: /eve/v1/sendblue/webhook)
 *
 * Point your Sendblue message, status, and typing webhooks at that URL.
 */
export function sendblueChannel(
  config: SendblueChannelConfig = {},
): Channel<SendblueChannelState, SendblueReceiveTarget, SendblueChannelMetadata> {
  const resolved = resolveConfig(config);
  const client = createSendblueClient(resolved);
  const events: ChannelEvents<SendblueContext> = { ...defaultEvents, ...config.events };

  return defineChannel<
    SendblueChannelState,
    SendblueContext,
    SendblueReceiveTarget,
    SendblueChannelMetadata
  >({
    kindHint: "sendblue",
    state: initialState(),

    metadata(state) {
      return {
        fromNumber: state.fromNumber,
        contactNumber: state.contactNumber,
        groupId: state.groupId,
        lastMessageHandle: state.lastMessageHandle,
      };
    },

    context(state) {
      return buildContext(state, client, resolved);
    },

    async fetchFile(url) {
      if (!/^https?:\/\//.test(url)) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },

    routes: [POST(`${resolved.route}/webhook`, handleWebhook(resolved, client))],

    async receive(input, { send }) {
      const fromNumber =
        input.target.fromNumber ?? resolved.fromNumber ?? undefined;
      if (!fromNumber) {
        throw new Error(
          "sendblueChannel.receive requires target.fromNumber or a configured fromNumber.",
        );
      }
      const contactNumber = input.target.contactNumber;
      const groupId = input.target.groupId;
      if (!contactNumber && !groupId) {
        throw new Error(
          "sendblueChannel.receive requires target.contactNumber or target.groupId.",
        );
      }

      return send(input.message, {
        auth: input.auth,
        continuationToken: sendblueContinuationToken(fromNumber, {
          contactNumber,
          groupId,
        }),
        state: {
          fromNumber,
          contactNumber: contactNumber ?? null,
          groupId: groupId ?? null,
          lastMessageHandle: null,
        },
      });
    },

    events,
  });
}

function handleWebhook(config: ResolvedSendblueConfig, client: SendblueClient) {
  return async (
    req: Request,
    { send, waitUntil }: RouteHandlerArgs<SendblueChannelState>,
  ): Promise<Response> => {
    if (!(await verifyWebhookSecret(req, config))) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Typing indicators are informational; acknowledge and move on.
    if (isTypingPayload(body)) return ok();
    if (!isMessagePayload(body)) return ok();

    const payload = body;

    // Only inbound, freshly received messages on an allowed service dispatch.
    if (!isServiceAllowed(payload.service, config)) return ok();
    if (payload.is_outbound || payload.status !== "RECEIVED") return ok();
    if (!(await isSenderAllowed(payload.from_number, config.allowFrom))) {
      return new Response("Forbidden", { status: 403 });
    }

    waitUntil(dispatch(payload, config, client, send));
    return ok();
  };
}

async function dispatch(
  payload: SendblueMessagePayload,
  config: ResolvedSendblueConfig,
  client: SendblueClient,
  send: SendFn<SendblueChannelState>,
): Promise<void> {
  const routing = routingFromPayload(payload);

  const inbound: SendblueInboundMessage = {
    text: payload.content ?? "",
    fromNumber: payload.from_number,
    toNumber: payload.to_number,
    sendblueNumber: routing.fromNumber,
    groupId: routing.groupId,
    service: payload.service,
    messageHandle: payload.message_handle,
    mediaUrl: payload.media_url,
    raw: payload,
  };

  const decision = await config.onInbound(inbound);
  if (decision === null) return;

  // Best-effort read receipt so the sender sees their message land.
  if (routing.contactNumber) {
    client
      .markRead({ fromNumber: routing.fromNumber, contactNumber: routing.contactNumber })
      .catch(() => {});
  }

  const message = buildMessage(payload, inbound.text);

  await send(
    { message, context: [formatInboundContext(payload)] },
    {
      auth: decision.auth,
      continuationToken: sendblueContinuationToken(routing.fromNumber, routing),
      state: {
        fromNumber: routing.fromNumber,
        contactNumber: routing.contactNumber ?? null,
        groupId: routing.groupId ?? null,
        lastMessageHandle: null,
      },
    },
  );
}

function buildMessage(
  payload: SendblueMessagePayload,
  text: string,
): string | UserContent {
  if (!payload.media_url) return text;

  const filePart: FilePart = {
    type: "file",
    data: new URL(payload.media_url),
    mediaType: guessMediaType(payload.media_url),
  };
  return [{ type: "text", text }, filePart];
}

function ok(): Response {
  return new Response("OK", { status: 200 });
}
