# eve-channel-sendblue

Put your [eve](https://eve.dev) agent on **iMessage and SMS** through
[Sendblue](https://sendblue.co). Inbound texts arrive as a webhook and start or
resume an eve session; the agent's reply is sent back over the same line. Group
chats, inbound media, tapback reactions, typing indicators, and read receipts
are all supported.

Inspired by [@pontusab's](https://x.com/pontusab) Chat SDK Adapter: https://github.com/sendblue-api/chat-adapter-sendblue

This repository is the home of the `eve-channel-sendblue` package. It is a
[bun](https://bun.sh) workspace with two members:

- [`packages/eve-channel-sendblue`](packages/eve-channel-sendblue) is the channel
  package, built with tsup.
- [`examples/basic`](examples/basic) is a minimal eve app that mounts the channel.

## Using the channel

In an eve app, add one file and mount the channel:

```ts title="agent/channels/sendblue.ts"
import { sendblueChannel } from "eve-channel-sendblue";

export default sendblueChannel();
```

Credentials fall back to `SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`, and
`SENDBLUE_WEBHOOK_SECRET`, so the block can be dropped entirely. To pass them
explicitly (each field also accepts a lazy resolver function):

```ts
export default sendblueChannel({
  credentials: {
    apiKey: process.env.SENDBLUE_API_KEY,
    apiSecret: process.env.SENDBLUE_API_SECRET,
    webhookSecret: process.env.SENDBLUE_WEBHOOK_SECRET,
  },
});
```

With no credentials set, the channel runs in **dry-run mode**: inbound webhooks
drive a real eve session, but outbound replies are logged instead of sent, so you
can exercise the whole channel with zero Sendblue setup.

Point your Sendblue message, status, and typing webhooks at
`/eve/v1/sendblue/webhook`.

## How it works

Sendblue delivers inbound iMessage/SMS as a webhook. The channel:

1. Mounts `POST /eve/v1/sendblue/webhook`, verifies the shared-secret header,
   and filters by service (`iMessage` by default) and sender allow-list.
2. Normalizes the payload and calls `send(...)` to start or resume an eve
   session, keyed to the Sendblue line and contact (`<from>:<contact>`, or
   `<from>:g:<group>` for groups).
3. On `message.completed`, strips Markdown to plain text and sends the reply
   back over the same line. `turn.failed` sends a short apology.

Delivery uses a thread-bound handle built in `context(state)` from the session's
own state, the same pattern eve's built-in Twilio channel uses, so a reply always
targets the right line and contact.

## Configuration

```ts
sendblueChannel({
  fromNumber: "+14155551234", // default sender; falls back to SENDBLUE_FROM_NUMBER
  allowFrom: ["+15551234567"], // "*", a list, or an async resolver
  allowedServices: ["iMessage", "SMS"], // defaults to ["iMessage"]
  statusCallbackUrl: "https://…/eve/v1/sendblue/webhook",
  onInbound: (msg) => ({
    auth: {
      /* … */
    },
  }), // decide dispatch + auth, or null to drop
});
```

## Develop in this repo

Requirements: **Node.js 24+** (eve's CLI requires it, so `nvm use 24`) and
**bun**.

```bash
bun install
bun run dev                  # builds the package, runs examples/basic (eve dev --no-ui)
bun run sim "hello there"    # simulate an inbound iMessage against the dev server
```

Other workspace scripts:

```bash
bun run build       # tsup build of the package
bun run typecheck   # tsc across both workspaces
bun run test        # package unit tests (bun test)
bun run lint        # oxlint
bun run format      # oxfmt
```

To go live, put real credentials in `examples/basic/.env` (git-ignored); see
[`examples/basic/.env.example`](examples/basic/.env.example). The agent also
needs a model provider credential (`AI_GATEWAY_API_KEY` or a linked Vercel
project) to produce replies.

## Platform limitations

Inherited from Sendblue and iMessage: no message editing, no true unsend,
tapbacks can be added but not removed via API, inbound `media_url`s expire after
~30 days, and typing indicators work for 1:1 chats only.
