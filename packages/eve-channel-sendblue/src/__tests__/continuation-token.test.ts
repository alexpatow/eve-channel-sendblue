import { describe, expect, test } from "bun:test";
import {
  decodeContinuationToken,
  routingFromPayload,
  sendblueContinuationToken,
} from "../continuation-token.js";
import type { SendblueMessagePayload } from "../types.js";

const payload = (over: Partial<SendblueMessagePayload>): SendblueMessagePayload =>
  ({
    content: "hi",
    is_outbound: false,
    status: "RECEIVED",
    error_code: null,
    error_message: null,
    message_handle: "h1",
    date_sent: "2026-07-05T00:00:00Z",
    from_number: "+15557654321",
    to_number: "+14155551234",
    sendblue_number: "+14155551234",
    service: "iMessage",
    ...over,
  }) as SendblueMessagePayload;

describe("sendblueContinuationToken", () => {
  test("encodes a 1:1 thread", () => {
    expect(sendblueContinuationToken("+14155551234", { contactNumber: "+15557654321" })).toBe(
      "%2B14155551234:%2B15557654321",
    );
  });

  test("encodes a group thread", () => {
    expect(sendblueContinuationToken("+14155551234", { groupId: "g:1" })).toBe(
      "%2B14155551234:g:g%3A1",
    );
  });

  test("round-trips through decode", () => {
    for (const contact of [{ contactNumber: "+46700000000" }, { groupId: "grp_1" }]) {
      const token = sendblueContinuationToken("+14155551234", contact);
      expect(decodeContinuationToken(token)).toEqual({ fromNumber: "+14155551234", ...contact });
    }
  });
});

describe("routingFromPayload", () => {
  test("inbound 1:1 routes reply back to the sender", () => {
    expect(routingFromPayload(payload({ is_outbound: false }))).toEqual({
      fromNumber: "+14155551234",
      contactNumber: "+15557654321",
    });
  });

  test("outbound flips contact/line", () => {
    expect(routingFromPayload(payload({ is_outbound: true }))).toEqual({
      fromNumber: "+14155551234",
      contactNumber: "+14155551234",
    });
  });

  test("group uses group_id", () => {
    expect(routingFromPayload(payload({ group_id: "grp_9" }))).toEqual({
      fromNumber: "+14155551234",
      groupId: "grp_9",
    });
  });
});
