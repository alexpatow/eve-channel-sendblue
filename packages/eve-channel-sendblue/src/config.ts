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
function secretResolver(
  value: SendblueSecret | undefined,
  envName: string,
): SecretResolver {
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
export function resolveConfig(
  config: SendblueChannelConfig = {},
): ResolvedSendblueConfig {
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

  return {
    apiKey: secretResolver(credentials.apiKey, "SENDBLUE_API_KEY"),
    apiSecret: secretResolver(credentials.apiSecret, "SENDBLUE_API_SECRET"),
    webhookSecret: secretResolver(credentials.webhookSecret, "SENDBLUE_WEBHOOK_SECRET"),
    webhookSecretHeader:
      credentials.webhookSecretHeader ?? DEFAULT_WEBHOOK_SECRET_HEADER,
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
    route: config.route ?? DEFAULT_ROUTE,
    dryRun,
    log,
  };
}
