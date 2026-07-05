import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveConfig } from "../config.js";

const ENV_KEYS = [
  "SENDBLUE_API_KEY",
  "SENDBLUE_API_SECRET",
  "SENDBLUE_FROM_NUMBER",
  "SENDBLUE_WEBHOOK_SECRET",
  "SENDBLUE_STATUS_CALLBACK_URL",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("resolveConfig", () => {
  test("falls back to dry-run with sensible defaults when nothing is configured", () => {
    const c = resolveConfig({ log: () => {} });
    expect(c.dryRun).toBe(true);
    expect(c.debug).toBe(false);
    expect(c.typingIndicator).toBe(true);
    expect(c.allowFrom).toBe("*");
    expect(c.route).toBe("/eve/v1/sendblue");
    expect(c.errorMessage).toContain("error");
  });

  test("goes live when credentials are present, and honors debug", () => {
    const c = resolveConfig({ credentials: { apiKey: "k", apiSecret: "s" }, debug: true });
    expect(c.dryRun).toBe(false);
    expect(c.debug).toBe(true);
  });

  test("secrets resolve from config, then env", async () => {
    expect(await resolveConfig({ credentials: { apiKey: "explicit" } }).apiKey()).toBe("explicit");
    process.env.SENDBLUE_API_KEY = "from-env";
    expect(await resolveConfig({}).apiKey()).toBe("from-env");
  });

  test("secret resolver functions are supported and memoized", async () => {
    let calls = 0;
    const c = resolveConfig({
      credentials: {
        apiKey: () => {
          calls += 1;
          return "lazy";
        },
      },
    });
    expect(await c.apiKey()).toBe("lazy");
    expect(await c.apiKey()).toBe("lazy");
    expect(calls).toBe(1);
  });

  test("logDebug only emits when debug is enabled", () => {
    const seen: string[] = [];
    const off = resolveConfig({
      credentials: { apiKey: "k", apiSecret: "s" },
      log: (m) => seen.push(m),
    });
    off.logDebug("nope");
    expect(seen).toEqual([]);

    const on = resolveConfig({
      credentials: { apiKey: "k", apiSecret: "s" },
      debug: true,
      log: (m) => seen.push(m),
    });
    on.logDebug("yep");
    expect(seen).toEqual(["yep"]);
  });
});
