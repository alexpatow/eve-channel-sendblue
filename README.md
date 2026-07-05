# Sendblue channel for eve — testbed

A runnable [eve](https://eve.dev) app that puts an agent on **iMessage and SMS**
through [Sendblue](https://sendblue.co), implemented as a custom eve channel.

This repo is the testbed. The channel itself lives in
[`agent/lib/sendblue/`](agent/lib/sendblue) as a self-contained module so it can
later be lifted into its own published package with no changes to the agent
wiring.

## How it works

Sendblue delivers inbound iMessage/SMS as a webhook. The channel:

1. Mounts `POST /eve/v1/sendblue/webhook`, verifies the shared-secret header,
   filters by service (`iMessage` by default) and sender allow-list.
2. Normalizes the payload and calls `send(...)` to start or resume an eve
   session, keyed to the Sendblue line + contact (`<from>:<contact>`, or
   `<from>:g:<group>` for groups).
3. On `message.completed`, strips Markdown to plain text and sends the reply
   back over the same line. `turn.failed` sends a short apology.

Delivery uses a thread-bound handle built in `context(state)` from the session's
own state, the same pattern eve's built-in Twilio channel uses, so a reply
always targets the right line and contact.

```
agent/
  channels/
    eve.ts            # default eve HTTP channel (scaffolded)
    sendblue.ts       # mounts the Sendblue channel (thin wiring)
  lib/sendblue/       # the reusable channel — future standalone package
    sendblue-channel.ts   # sendblueChannel() factory
    client.ts             # Sendblue SDK transport (+ dry-run client)
    context.ts            # per-thread send/typing/reaction handle
    webhook.ts            # payload guards, signature + sender checks
    continuation-token.ts # session addressing
    format.ts             # Markdown → plain text for iMessage
    reactions.ts          # tapback aliases
    config.ts / types.ts
scripts/
  simulate-inbound.ts # POST a fake inbound message to the dev server
```

## Requirements

- **Node.js 24+** (eve requires it). The eve CLI runs under Node; use `nvm use 24`.
- **[bun](https://bun.sh)** as the package manager and script runner.

## Setup

```bash
bun install
cp .env.example .env   # optional — see below
```

With no `SENDBLUE_API_KEY` / `SENDBLUE_API_SECRET`, the channel runs in
**dry-run mode**: inbound webhooks drive a real eve session, but outbound
replies are logged as `[sendblue:dry-run]` instead of being sent. This lets you
exercise the whole channel with zero Sendblue setup.

## Run it locally

```bash
bun run dev                 # starts eve dev (headless: `eve dev --no-ui`), prints a URL
bun run sim "hello there"   # simulate an inbound iMessage in another terminal
```

Watch the dev-server logs: you'll see the session run and the reply delivered
(or logged in dry-run). To reach a real model, provide the agent's provider
credentials (see `agent/agent.ts`; the default model is `anthropic/claude-sonnet-5`).

```bash
bun run typecheck           # tsc, no emit
```

## Going live

Set the credentials in `.env`:

```bash
SENDBLUE_API_KEY=...
SENDBLUE_API_SECRET=...
SENDBLUE_FROM_NUMBER=+1415...      # your registered Sendblue number (E.164)
SENDBLUE_WEBHOOK_SECRET=...        # optional; checked against `sb-signing-secret`
```

Deploy, then point your Sendblue **message**, **status**, and **typing**
webhooks at `https://<your-host>/eve/v1/sendblue/webhook`.

Lock down who can reach the webhook and tune behavior in
[`agent/channels/sendblue.ts`](agent/channels/sendblue.ts):

```ts
export default sendblueChannel({
  allowFrom: ["+15551234567"],       // or "*", a list, or an async resolver
  allowedServices: ["iMessage", "SMS"],
  onInbound: (msg) => ({ auth: { /* ... */ } }), // decide dispatch + auth, or null to drop
});
```

## Platform limitations

Inherited from Sendblue / iMessage: no message editing, no true unsend,
tapbacks can be added but not removed via API, inbound `media_url`s expire after
~30 days, and typing indicators work for 1:1 chats only.
