import { createHash, timingSafeEqual } from "node:crypto";
import type {
  ResolvedSendblueConfig,
  SendblueAllowFrom,
  SendblueMessagePayload,
  SendblueTypingPayload,
} from "./types.js";

/**
 * Constant-time string compare. Both inputs are SHA-256'd to a fixed length
 * first, so neither the outcome nor the operands' lengths leak through timing.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/**
 * Verify the shared-secret header on an inbound webhook. When no secret resolves,
 * the result depends on `requireWebhookSecret`: fail closed (reject) when
 * required, allow when verification is explicitly disabled. A configured secret
 * is compared to the header in constant time.
 */
export async function verifyWebhookSecret(
  req: Request,
  config: ResolvedSendblueConfig,
): Promise<boolean> {
  const secret = await config.webhookSecret();
  if (!secret) return !config.requireWebhookSecret;
  const provided = req.headers.get(config.webhookSecretHeader);
  if (provided === null) return false;
  return timingSafeEqualStr(provided, secret);
}

export function isTypingPayload(body: unknown): body is SendblueTypingPayload {
  return (
    typeof body === "object" &&
    body !== null &&
    "is_typing" in body &&
    typeof (body as { is_typing: unknown }).is_typing === "boolean"
  );
}

export function isMessagePayload(body: unknown): body is SendblueMessagePayload {
  return (
    typeof body === "object" &&
    body !== null &&
    "message_handle" in body &&
    typeof (body as { message_handle: unknown }).message_handle === "string"
  );
}

export function isServiceAllowed(service: string, config: ResolvedSendblueConfig): boolean {
  return config.allowedServices.some((s) => s.toLowerCase() === service.toLowerCase());
}

/** Resolve an {@link SendblueAllowFrom} policy against a sender number. */
export async function isSenderAllowed(
  fromNumber: string,
  allowFrom: SendblueAllowFrom,
): Promise<boolean> {
  const resolved = typeof allowFrom === "function" ? await allowFrom() : allowFrom;
  if (resolved === "*") return true;
  if (typeof resolved === "string") return resolved === fromNumber;
  return resolved.includes(fromNumber);
}

/**
 * A context block prepended to the model turn. It tells the agent it is on
 * iMessage/SMS so it answers in plain text, and records the routing metadata.
 */
export function formatInboundContext(payload: SendblueMessagePayload): string {
  return [
    "<sendblue_context>",
    `service: ${payload.service}`,
    "response_medium: imessage",
    "response_instructions: Reply in plain text suitable for iMessage/SMS. Keep it concise and avoid Markdown, tables, headings, code fences, and long lists.",
    `from: ${payload.from_number}`,
    `to: ${payload.to_number}`,
    ...(payload.group_id ? [`group_id: ${payload.group_id}`] : []),
    `message_handle: ${payload.message_handle}`,
    "</sendblue_context>",
  ].join("\n");
}
