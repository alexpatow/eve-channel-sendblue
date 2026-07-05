import type {
  ResolvedSendblueConfig,
  SendblueAllowFrom,
  SendblueMessagePayload,
  SendblueTypingPayload,
} from "./types.js";

/**
 * Verify the shared-secret header on an inbound webhook. Returns `true` when no
 * secret is configured (verification disabled) or when the header matches.
 */
export async function verifyWebhookSecret(
  req: Request,
  config: ResolvedSendblueConfig,
): Promise<boolean> {
  const secret = await config.webhookSecret();
  if (!secret) return true;
  const provided = req.headers.get(config.webhookSecretHeader);
  return provided === secret;
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
