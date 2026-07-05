import { sendblueChannel } from "../lib/sendblue/index.js";

/**
 * Puts this agent on iMessage/SMS via Sendblue.
 *
 * With no `SENDBLUE_API_KEY`/`SENDBLUE_API_SECRET` set, the channel runs in
 * dry-run mode: inbound webhooks drive a real eve session, but outbound replies
 * are logged instead of sent. Set the credentials (and a `fromNumber`) to go
 * live, then point your Sendblue webhooks at `/eve/v1/sendblue/webhook`.
 */
export default sendblueChannel({
  // allowFrom: ["+15551234567"], // lock down who can reach the webhook
  // webhookSecret: process.env.SENDBLUE_WEBHOOK_SECRET,
  // allowedServices: ["iMessage", "SMS"],
});
