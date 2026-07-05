import { sendblueChannel } from "eve-channel-sendblue";

/**
 * Puts this agent on iMessage/SMS via Sendblue.
 *
 * The credentials block below is optional: drop it to rely on `SENDBLUE_API_KEY`,
 * `SENDBLUE_API_SECRET`, and `SENDBLUE_WEBHOOK_SECRET`. Each field also accepts a
 * lazy resolver function. With no credentials set, the channel runs in dry-run
 * mode (inbound webhooks drive a real session; outbound replies are logged).
 *
 * Point your Sendblue webhooks at `/eve/v1/sendblue/webhook`.
 */
export default sendblueChannel({
  credentials: {
    apiKey: process.env.SENDBLUE_API_KEY,
    apiSecret: process.env.SENDBLUE_API_SECRET,
    webhookSecret: process.env.SENDBLUE_WEBHOOK_SECRET,
  },
});
