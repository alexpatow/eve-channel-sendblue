import type { ResolvedSendblueConfig, SendblueChannelConfig } from "./types.js";

const DEFAULT_WEBHOOK_SECRET_HEADER = "sb-signing-secret";
const DEFAULT_ALLOWED_SERVICES = ["iMessage"] as const;
const DEFAULT_ROUTE = "/eve/v1/sendblue";

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

/**
 * Merge explicit config with environment fallbacks. When API credentials are
 * absent (and `dryRun` was not explicitly set), the channel drops into dry-run
 * mode so it can be exercised end to end without a Sendblue account.
 */
export function resolveConfig(
  config: SendblueChannelConfig = {},
): ResolvedSendblueConfig {
  const log = config.log ?? ((message, detail) => console.log(message, detail ?? ""));

  const apiKey = config.apiKey ?? env("SENDBLUE_API_KEY");
  const apiSecret = config.apiSecret ?? env("SENDBLUE_API_SECRET");
  const hasCredentials = Boolean(apiKey && apiSecret);

  const dryRun = config.dryRun ?? !hasCredentials;
  if (dryRun && !config.dryRun) {
    log(
      "[sendblue] No SENDBLUE_API_KEY/SENDBLUE_API_SECRET found — running in dry-run mode (outbound messages are logged, not sent).",
    );
  }

  return {
    apiKey,
    apiSecret,
    fromNumber: config.fromNumber ?? env("SENDBLUE_FROM_NUMBER"),
    webhookSecret: config.webhookSecret ?? env("SENDBLUE_WEBHOOK_SECRET"),
    webhookSecretHeader: config.webhookSecretHeader ?? DEFAULT_WEBHOOK_SECRET_HEADER,
    statusCallbackUrl: config.statusCallbackUrl ?? env("SENDBLUE_STATUS_CALLBACK_URL"),
    allowedServices: config.allowedServices ?? DEFAULT_ALLOWED_SERVICES,
    allowFrom: config.allowFrom ?? "*",
    onInbound:
      config.onInbound ??
      ((message) => ({
        auth: {
          authenticator: "sendblue",
          principalType: "user",
          principalId: message.fromNumber,
          attributes: { line: message.sendblueNumber, service: message.service },
        },
      })),
    route: config.route ?? DEFAULT_ROUTE,
    dryRun,
    log,
  };
}
