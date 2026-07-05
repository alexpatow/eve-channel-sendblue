import type {
  ResolvedSendblueConfig,
  SecretResolver,
  SendblueChannelConfig,
  SendblueSecret,
} from "./types.js";

const DEFAULT_WEBHOOK_SECRET_HEADER = "sb-signing-secret";
const DEFAULT_ALLOWED_SERVICES = ["iMessage"] as const;
const DEFAULT_ROUTE = "/eve/v1/sendblue";

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

/**
 * Wrap a secret (string, resolver, or undefined) into a memoized async accessor
 * that applies the env fallback. The resolver runs at most once.
 */
function secretResolver(value: SendblueSecret | undefined, envName: string): SecretResolver {
  let cached: Promise<string | null> | null = null;
  return () => {
    if (!cached) {
      cached = (async () => {
        const raw = typeof value === "function" ? await value() : value;
        return raw && raw.length > 0 ? raw : env(envName);
      })();
    }
    return cached;
  };
}

/**
 * Merge explicit config with environment fallbacks. When API credentials are
 * statically absent (and `dryRun` was not set), the channel drops into dry-run
 * mode so it can be exercised end to end without a Sendblue account. If either
 * credential is a resolver function, the channel assumes it intends to go live
 * and defers the decision to first use.
 */
export function resolveConfig(config: SendblueChannelConfig = {}): ResolvedSendblueConfig {
  const log = config.log ?? ((message, detail) => console.log(message, detail ?? ""));
  const credentials = config.credentials ?? {};

  const staticallyMissing =
    typeof credentials.apiKey !== "function" &&
    typeof credentials.apiSecret !== "function" &&
    !(credentials.apiKey ?? env("SENDBLUE_API_KEY")) &&
    !(credentials.apiSecret ?? env("SENDBLUE_API_SECRET"));

  const dryRun = config.dryRun ?? staticallyMissing;
  if (dryRun && config.dryRun === undefined) {
    log(
      "[sendblue] No SENDBLUE_API_KEY/SENDBLUE_API_SECRET found — running in dry-run mode (outbound messages are logged, not sent).",
    );
  }

  const debug = config.debug ?? false;

  return {
    apiKey: secretResolver(credentials.apiKey, "SENDBLUE_API_KEY"),
    apiSecret: secretResolver(credentials.apiSecret, "SENDBLUE_API_SECRET"),
    webhookSecret: secretResolver(credentials.webhookSecret, "SENDBLUE_WEBHOOK_SECRET"),
    webhookSecretHeader: credentials.webhookSecretHeader ?? DEFAULT_WEBHOOK_SECRET_HEADER,
    requireWebhookSecret: config.requireWebhookSecret ?? true,
    fromNumber: config.fromNumber ?? env("SENDBLUE_FROM_NUMBER"),
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
    persistMedia: config.persistMedia ?? null,
    route: config.route ?? DEFAULT_ROUTE,
    typingIndicator: config.typingIndicator ?? true,
    errorMessage:
      config.errorMessage ?? "Sorry, I hit an error handling your message. Please try again.",
    dryRun,
    debug,
    log,
    logDebug: (message, detail) => {
      if (debug) log(message, detail);
    },
  };
}

/**
 * Enforce a coherent, safe webhook-verification setup at channel construction.
 * Throws (fail closed) unless exactly one is true: a secret is configured, or
 * verification is explicitly disabled. Called by `sendblueChannel` only, not by
 * the tapback tool, which never serves the webhook.
 */
export function assertWebhookSecurity(config: SendblueChannelConfig): void {
  const credentials = config.credentials ?? {};
  // A resolver function counts as "configured"; its runtime value is verified
  // per request (an empty result still fails closed when required).
  const configured =
    credentials.webhookSecret !== undefined || env("SENDBLUE_WEBHOOK_SECRET") !== null;
  const required = config.requireWebhookSecret ?? true;

  if (required && !configured) {
    throw new Error(
      "sendblueChannel: webhook verification is required but no secret is configured. " +
        "Set SENDBLUE_WEBHOOK_SECRET (or credentials.webhookSecret) and the same secret in " +
        "Sendblue, or pass requireWebhookSecret: false to run the webhook unauthenticated " +
        "(not recommended).",
    );
  }
  if (!required && configured) {
    throw new Error(
      "sendblueChannel: requireWebhookSecret is false but a webhook secret was provided. " +
        "These conflict. Remove the secret to run the webhook open, or set " +
        "requireWebhookSecret: true (the default) to verify it.",
    );
  }
}
