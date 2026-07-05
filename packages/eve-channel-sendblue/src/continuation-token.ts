import type { SendblueMessagePayload } from "./types.js";

/**
 * The channel-local continuation token addresses a session to a specific
 * Sendblue line and contact (or group), so conversations stay sticky to the
 * number the person is texting. The framework prepends the channel name
 * (`sendblue:`) before handing it to the runtime.
 *
 *   1:1    ->  <fromNumber>:<contactNumber>
 *   group  ->  <fromNumber>:g:<groupId>
 */
export function sendblueContinuationToken(
  fromNumber: string,
  contact: { contactNumber?: string; groupId?: string },
): string {
  const from = encodeURIComponent(fromNumber);
  if (contact.groupId) {
    return `${from}:g:${encodeURIComponent(contact.groupId)}`;
  }
  return `${from}:${encodeURIComponent(contact.contactNumber ?? "")}`;
}

/** Inverse of {@link sendblueContinuationToken} for the channel-local raw token. */
export function decodeContinuationToken(token: string): {
  fromNumber: string;
  contactNumber?: string;
  groupId?: string;
} {
  const parts = token.split(":");
  const fromNumber = decodeURIComponent(parts[0] ?? "");
  if (parts[1] === "g" && parts[2]) {
    return { fromNumber, groupId: decodeURIComponent(parts[2]) };
  }
  return { fromNumber, contactNumber: decodeURIComponent(parts[1] ?? "") };
}

/**
 * Derive the routing identity of an inbound webhook payload: the Sendblue line
 * it arrived on and the contact (or group) on the other end.
 */
export function routingFromPayload(payload: SendblueMessagePayload): {
  fromNumber: string;
  contactNumber?: string;
  groupId?: string;
} {
  const fromNumber =
    payload.sendblue_number ?? (payload.is_outbound ? payload.from_number : payload.to_number);

  if (payload.group_id && payload.group_id.length > 0) {
    return { fromNumber, groupId: payload.group_id };
  }

  const contactNumber = payload.is_outbound ? payload.to_number : payload.from_number;

  return { fromNumber, contactNumber };
}
