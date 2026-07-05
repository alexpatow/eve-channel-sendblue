# eve-channel-sendblue

[Sendblue](https://sendblue.co) (iMessage/SMS) channel for the
[eve](https://eve.dev) agent framework. Inbound texts arrive as a webhook and
start or resume an eve session; the agent's reply is sent back over the same
line.

## Install

```bash
bun add eve-channel-sendblue
# peer deps: eve, ai
```

## Usage

Add a channel file to your eve app:

```ts title="agent/channels/sendblue.ts"
import { sendblueChannel } from "eve-channel-sendblue";

export default sendblueChannel();
```

Credentials fall back to environment variables, so the call can stay empty:

| Variable                       | Purpose                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `SENDBLUE_API_KEY`             | Sendblue API key id                                      |
| `SENDBLUE_API_SECRET`          | Sendblue API secret                                      |
| `SENDBLUE_FROM_NUMBER`         | Default sender, E.164 (e.g. `+14155551234`)              |
| `SENDBLUE_WEBHOOK_SECRET`      | Optional; checked against the `sb-signing-secret` header |
| `SENDBLUE_STATUS_CALLBACK_URL` | Optional; per-message delivery-status callback URL       |

Or pass them explicitly. Each credential also accepts a lazy resolver function
that is called once and cached:

```ts
export default sendblueChannel({
  credentials: {
    apiKey: process.env.SENDBLUE_API_KEY,
    apiSecret: () => secrets.get("sendblue-api-secret"), // sync or async resolver
    webhookSecret: process.env.SENDBLUE_WEBHOOK_SECRET,
  },
  fromNumber: "+14155551234",
  allowFrom: ["+15557654321"], // "*", a list, or an async resolver
  allowedServices: ["iMessage", "SMS"], // defaults to ["iMessage"]
});
```

With no credentials resolvable, the channel runs in **dry-run mode**: inbound
webhooks drive a real eve session, but outbound sends are logged instead of
delivered.

## Webhooks

The channel mounts a single route:

```
POST /eve/v1/sendblue/webhook
```

Point your Sendblue **message**, **status**, and **typing** webhooks at that URL.
The handler distinguishes the payload types internally.

## Features

- **Inbound + outbound** iMessage and SMS, 1:1 and group threads.
- **Markdown flattening** so replies read natively on iMessage.
- **Inbound media** surfaced to the model as file attachments.
- **Tapback reactions**, **typing indicators**, and **read receipts** via the
  thread handle exposed to event handlers.
- **Proactive sends** through the channel's `receive()` hook (schedules or
  cross-channel hand-off).
- **Sender allow-list**, service filtering, and shared-secret webhook
  verification.

## Continuation tokens

The channel-local raw token addresses a session by line and contact:

```
<fromNumber>:<contactNumber>     // 1:1
<fromNumber>:g:<groupId>         // group
```

`sendblueContinuationToken(from, { contactNumber })` and `decodeContinuationToken`
are exported for building tokens (for example, to start a proactive session).

## Platform limitations

Inherited from Sendblue and iMessage: no message editing, no true unsend,
tapbacks can be added but not removed via API, inbound `media_url`s expire after
~30 days, and typing indicators work for 1:1 chats only.

## License

MIT
