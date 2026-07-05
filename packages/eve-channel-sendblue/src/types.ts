import type { ChannelEvents } from "eve/channels";

/**
 * Messaging services Sendblue can deliver over. iMessage is the default the
 * channel accepts; add SMS/RCS explicitly when you want to answer them too.
 */
export type SendblueService = "iMessage" | "SMS" | "RCS" | "sms";

/** A tapback reaction Sendblue understands. */
export type SendblueReaction =
  | "love"
  | "like"
  | "dislike"
  | "laugh"
  | "emphasize"
  | "question";

/** A concrete allow-list value: a single number, a list, or the wildcard. */
export type SendblueAllowValue = string | readonly string[] | "*";

/**
 * Who is allowed to reach the inbound webhook. A concrete value, or an async
 * resolver returning one.
 */
export type SendblueAllowFrom =
  | SendblueAllowValue
  | (() => SendblueAllowValue | Promise<SendblueAllowValue>);

/**
 * The auth context an inbound message runs under. Structurally compatible with
 * eve's `SessionAuthContext`; flows to `session.auth.initiator` so tools and
 * event handlers can read who started the session.
 */
export interface SendblueAuth {
  readonly authenticator: string;
  readonly principalType: string;
  readonly principalId: string;
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
  readonly issuer?: string;
  readonly subject?: string;
}

/** A normalized inbound message handed to `onInbound`. */
export interface SendblueInboundMessage {
  readonly text: string;
  readonly fromNumber: string;
  readonly toNumber: string;
  readonly sendblueNumber: string;
  readonly groupId?: string;
  readonly service: string;
  readonly messageHandle: string;
  readonly mediaUrl?: string;
  readonly raw: SendblueMessagePayload;
}

/** Return `{ auth }` to dispatch the message, or `null` to drop it. */
export type SendblueOnInbound = (
  message: SendblueInboundMessage,
) => { auth: SendblueAuth | null } | null | Promise<{ auth: SendblueAuth | null } | null>;

/**
 * A secret value: a plain string, or a lazy (optionally async) resolver. A
 * resolver is called the first time the secret is needed and its result cached,
 * so credentials can be fetched from a vault at runtime instead of baked in.
 */
export type SendblueSecret =
  | string
  | (() => string | undefined | Promise<string | undefined>);

/** Resolved secret accessor with the env fallback already applied. */
export type SecretResolver = () => Promise<string | null>;

/** Sendblue credentials. Every field is optional and falls back to an env var. */
export interface SendblueCredentials {
  /** Sendblue API key id. Falls back to `SENDBLUE_API_KEY`. */
  apiKey?: SendblueSecret;
  /** Sendblue API secret. Falls back to `SENDBLUE_API_SECRET`. */
  apiSecret?: SendblueSecret;
  /** Shared secret for webhook verification. Falls back to `SENDBLUE_WEBHOOK_SECRET`. */
  webhookSecret?: SendblueSecret;
  /** Header carrying the webhook secret. @default "sb-signing-secret" */
  webhookSecretHeader?: string;
}

export interface SendblueChannelConfig {
  /**
   * API key, API secret, and webhook secret. Drop the block to rely on
   * `SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`, and `SENDBLUE_WEBHOOK_SECRET`.
   * Each field also accepts a lazy resolver function.
   */
  credentials?: SendblueCredentials;
  /** Registered Sendblue number (E.164) used as the default sender. Falls back to `SENDBLUE_FROM_NUMBER`. */
  fromNumber?: string;
  /** URL Sendblue posts outbound delivery status to. Falls back to `SENDBLUE_STATUS_CALLBACK_URL`. */
  statusCallbackUrl?: string;
  /** Inbound services to accept. @default ["iMessage"] */
  allowedServices?: readonly SendblueService[];
  /** Numbers allowed to reach the webhook. @default "*" */
  allowFrom?: SendblueAllowFrom;
  /** Decide dispatch and auth for each inbound message. */
  onInbound?: SendblueOnInbound;
  /** Base path the webhook route mounts under. @default "/eve/v1/sendblue" */
  route?: string;
  /**
   * Log outbound sends instead of calling the Sendblue API. Auto-enabled when
   * API credentials are missing, so the channel runs with no configuration.
   */
  dryRun?: boolean;
  /** Sink for dry-run and diagnostic logging. @default console.log */
  log?: (message: string, detail?: unknown) => void;
  /** Override or extend the default session-lifecycle event handlers. */
  events?: ChannelEvents<SendblueContext>;
}

/** Fully resolved config: secrets become memoized async resolvers. */
export interface ResolvedSendblueConfig {
  readonly apiKey: SecretResolver;
  readonly apiSecret: SecretResolver;
  readonly webhookSecret: SecretResolver;
  readonly webhookSecretHeader: string;
  readonly fromNumber: string | null;
  readonly statusCallbackUrl: string | null;
  readonly allowedServices: readonly SendblueService[];
  readonly allowFrom: SendblueAllowFrom;
  readonly onInbound: SendblueOnInbound;
  readonly route: string;
  readonly dryRun: boolean;
  readonly log: (message: string, detail?: unknown) => void;
}

/**
 * Durable per-session state. Seeded on the first inbound `send` and read back by
 * the delivery handlers to know which line and contact to reply to.
 */
export interface SendblueChannelState {
  fromNumber: string | null;
  contactNumber: string | null;
  groupId: string | null;
  lastMessageHandle: string | null;
}

/** Public observability projection of channel state. */
export interface SendblueChannelMetadata {
  fromNumber: string | null;
  contactNumber: string | null;
  groupId: string | null;
  lastMessageHandle: string | null;
  [key: string]: unknown;
}

/** Target shape for proactive `receive()` sends from schedules or other channels. */
export interface SendblueReceiveTarget {
  contactNumber?: string;
  groupId?: string;
  fromNumber?: string;
}

/** The per-step context handed to every event handler as its `channel` arg. */
export interface SendblueContext {
  state: SendblueChannelState;
  sendblue: SendblueThreadHandle;
}

/** Thread-bound convenience API built from live session state in `context()`. */
export interface SendblueThreadHandle {
  /** Send an outbound reply to the current thread (markdown stripped for iMessage). */
  reply(text: string): Promise<void>;
  /** Send media (by public URL) with optional caption to the current 1:1 thread. */
  sendMedia(mediaUrl: string, caption?: string): Promise<void>;
  /** Show the animated typing bubble (1:1 only). */
  startTyping(): Promise<void>;
  /** Mark the conversation read (requires account-level activation). */
  markRead(): Promise<void>;
  /** Add an iMessage tapback to a message by its handle. */
  addReaction(messageHandle: string, reaction: SendblueReaction | string): Promise<void>;
  /** Whether this thread is a group conversation. */
  readonly isGroup: boolean;
}

// ---------------------------------------------------------------------------
// Inbound webhook payload shapes (not fully covered by the SDK's own types)
// ---------------------------------------------------------------------------

export interface SendblueMessagePayload {
  accountEmail?: string;
  content: string;
  is_outbound: boolean;
  status: string;
  error_code: number | null;
  error_message: string | null;
  message_handle: string;
  date_sent: string;
  date_updated?: string;
  from_number: string;
  number?: string;
  to_number: string;
  media_url?: string;
  message_type?: "message" | "group" | string;
  group_id?: string;
  participants?: string[];
  send_style?: string;
  opted_out?: boolean;
  sendblue_number?: string | null;
  service: string;
  group_display_name?: string | null;
}

export interface SendblueTypingPayload {
  number: string;
  is_typing: boolean;
  from_number: string;
  timestamp?: string;
}
