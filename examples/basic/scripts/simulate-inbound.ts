/**
 * Simulate an inbound Sendblue iMessage against a running eve dev server.
 *
 *   bun run dev              # in one terminal (starts eve, prints a URL)
 *   bun run sim "hello"      # in another terminal
 *
 * Env / args:
 *   EVE_URL   base URL of the dev server   (default http://localhost:2000)
 *   FROM      the contact texting in       (default +15557654321)
 *   TO        your Sendblue line (E.164)   (default $SENDBLUE_FROM_NUMBER)
 *   arg[0]    the message text             (default "What can you do?")
 *
 * TO must be a number registered on your Sendblue account, otherwise a live
 * (non-dry-run) reply is rejected with "This phone number is not defined". For a
 * real round-trip, set FROM to a number you control so the reply reaches you.
 */
const base = process.env.EVE_URL ?? "http://localhost:2000";
const from = process.env.FROM ?? "+15557654321";
const to = process.env.TO ?? process.env.SENDBLUE_FROM_NUMBER ?? "+14155551234";
const text = process.argv[2] ?? "What can you do?";
const secret = process.env.SENDBLUE_WEBHOOK_SECRET;

const payload = {
  content: text,
  is_outbound: false,
  status: "RECEIVED",
  error_code: null,
  error_message: null,
  message_handle: `sim-${Date.now()}`,
  date_sent: new Date().toISOString(),
  from_number: from,
  to_number: to,
  sendblue_number: to,
  media_url: "",
  message_type: "message",
  group_id: "",
  service: "iMessage",
};

const url = `${base}/eve/v1/sendblue/webhook`;
const headers: Record<string, string> = { "content-type": "application/json" };
if (secret) headers["sb-signing-secret"] = secret;

console.log(`→ POST ${url}\n  from ${from} to ${to}: "${text}"`);

const res = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});

console.log(`← ${res.status} ${res.statusText}: ${await res.text()}`);
console.log(
  "\nWatch the dev server logs: the agent's reply is delivered via Sendblue " +
    "(or logged as [sendblue:dry-run] when no credentials are set).",
);
