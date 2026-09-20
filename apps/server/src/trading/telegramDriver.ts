// @effect-diagnostics nodeBuiltinImport:off - MTProto driver, credentials stay on the server.
import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { NewMessage, type NewMessageEvent } from "teleproto/events/index.js";
import { computeCheck } from "teleproto/Password.js";
import { Logger, LogLevel } from "teleproto/extensions/Logger.js";
import type { TelegramChannelMessage } from "@t3tools/contracts";
import { ConnectionError } from "./connectionSecrets.ts";
import { createTelegramConnection, type TelegramDriver } from "./telegramConnection.ts";

export async function telegramDriver(
  id: number,
  hash: string,
  saved: string,
): Promise<TelegramDriver> {
  const session = new StringSession(saved);
  const client = new TelegramClient(session, id, hash, {
    connectionRetries: 3,
    // A new session may first be redirected to the phone's home data center.
    // That redirect consumes an attempt before Telegram can send the login code.
    requestRetries: 3,
    floodSleepThreshold: 0,
    baseLogger: new Logger(LogLevel.NONE),
    deviceModel: "Automorphic",
    appVersion: "0.0.40",
  });
  client.setLogLevel(LogLevel.NONE);
  const channels = new Map<string, Api.Channel>();
  const serialize = (message: Api.Message): TelegramChannelMessage | null =>
    message.peerId instanceof Api.PeerChannel
      ? {
          id: message.id,
          channelId: message.peerId.channelId.toString(),
          text: message.message.slice(0, 16_000),
          date: message.date,
          media: Boolean(message.media),
        }
      : null;
  const loadChannels = async () => {
    const dialogs = await client.getDialogs({ limit: 200 });
    channels.clear();
    for (const dialog of dialogs)
      if (dialog.entity instanceof Api.Channel && !dialog.entity.left)
        channels.set(dialog.entity.id.toString(), dialog.entity);
    return [...channels.values()]
      .map((channel) => ({
        id: channel.id.toString(),
        title: channel.title,
        ...(channel.username ? { username: channel.username } : {}),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  };
  return {
    async connect() {
      await client.connect();
    },
    async user() {
      const me = await client.getMe();
      if (!(me instanceof Api.User))
        throw new ConnectionError("Reconnect your Telegram account.", 401);
      return me.firstName || me.username || "Telegram";
    },
    async sendCode(phone) {
      return (await client.sendCode({ apiId: id, apiHash: hash }, phone)).phoneCodeHash;
    },
    async signIn(phone, phoneCodeHash, phoneCode) {
      const result = await client.invoke(
        new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode }),
      );
      if (result instanceof Api.auth.AuthorizationSignUpRequired)
        throw new ConnectionError(
          "Use an existing Telegram account. Create your account in Telegram first.",
        );
    },
    async password(value) {
      const info = await client.invoke(new Api.account.GetPassword());
      await client.invoke(
        new Api.auth.CheckPassword({ password: await computeCheck(info, value) }),
      );
    },
    session: () => session.save(),
    channels: loadChannels,
    async messages(id) {
      if (!channels.has(id)) await loadChannels();
      const channel = channels.get(id);
      if (!channel) throw new ConnectionError("This channel is not in your Telegram account.", 403);
      return (await client.getMessages(channel, { limit: 50 }))
        .flatMap((message) => {
          const next = serialize(message);
          return next ? [next] : [];
        })
        .reverse();
    },
    listen(callback) {
      client.addEventHandler(
        (event: NewMessageEvent) => {
          const value = serialize(event.message);
          if (value && channels.has(value.channelId)) callback(value);
        },
        new NewMessage({ incoming: true }),
      );
    },
    async close(logout = false) {
      try {
        if (logout && client.connected) await client.invoke(new Api.auth.LogOut());
      } finally {
        await client.destroy();
      }
    },
  };
}
export const telegramConnection = createTelegramConnection({ driver: telegramDriver });
