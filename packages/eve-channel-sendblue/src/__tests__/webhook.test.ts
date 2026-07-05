import { describe, expect, test } from "bun:test";
import { resolveConfig } from "../config.js";
import {
  isMessagePayload,
  isSenderAllowed,
  isServiceAllowed,
  isTypingPayload,
  verifyWebhookSecret,
} from "../webhook.js";

const live = (over = {}) =>
  resolveConfig({ credentials: { apiKey: "k", apiSecret: "s" }, ...over });

const request = (secret?: string) =>
  new Request("http://x/webhook", {
    method: "POST",
    headers: secret ? { "sb-signing-secret": secret } : {},
  });

describe("payload guards", () => {
  test("isTypingPayload", () => {
    expect(isTypingPayload({ is_typing: true, number: "+1", from_number: "+2" })).toBe(true);
    expect(isTypingPayload({ message_handle: "h" })).toBe(false);
    expect(isTypingPayload(null)).toBe(false);
  });

  test("isMessagePayload", () => {
    expect(isMessagePayload({ message_handle: "h" })).toBe(true);
    expect(isMessagePayload({ is_typing: true })).toBe(false);
    expect(isMessagePayload("nope")).toBe(false);
  });
});

describe("isServiceAllowed", () => {
  test("defaults to iMessage only, case-insensitive", () => {
    const c = live();
    expect(isServiceAllowed("iMessage", c)).toBe(true);
    expect(isServiceAllowed("imessage", c)).toBe(true);
    expect(isServiceAllowed("SMS", c)).toBe(false);
  });

  test("respects allowedServices", () => {
    expect(isServiceAllowed("SMS", live({ allowedServices: ["iMessage", "SMS"] }))).toBe(true);
  });
});

describe("isSenderAllowed", () => {
  test("wildcard, string, list, and resolver forms", async () => {
    expect(await isSenderAllowed("+1", "*")).toBe(true);
    expect(await isSenderAllowed("+1", "+1")).toBe(true);
    expect(await isSenderAllowed("+1", "+2")).toBe(false);
    expect(await isSenderAllowed("+1", ["+2", "+1"])).toBe(true);
    expect(await isSenderAllowed("+9", () => ["+1"])).toBe(false);
    expect(await isSenderAllowed("+1", async () => "+1")).toBe(true);
  });
});

describe("verifyWebhookSecret", () => {
  test("allows everything when no secret is configured", async () => {
    expect(await verifyWebhookSecret(request(), live())).toBe(true);
  });

  test("checks the signing header when a secret is set", async () => {
    const c = live({ credentials: { apiKey: "k", apiSecret: "s", webhookSecret: "sekret" } });
    expect(await verifyWebhookSecret(request("sekret"), c)).toBe(true);
    expect(await verifyWebhookSecret(request("wrong"), c)).toBe(false);
    expect(await verifyWebhookSecret(request(), c)).toBe(false);
  });
});
