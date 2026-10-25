import * as Schema from "effect/Schema";

export const TelegramChannel = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  username: Schema.optional(Schema.String),
});
export type TelegramChannel = typeof TelegramChannel.Type;
export const TelegramChannelMessage = Schema.Struct({
  id: Schema.Finite,
  channelId: Schema.String,
  text: Schema.String,
  date: Schema.Finite,
  media: Schema.Boolean,
});
export type TelegramChannelMessage = typeof TelegramChannelMessage.Type;
export const TelegramConnectionStatus = Schema.Struct({
  configured: Schema.Boolean,
  connected: Schema.Boolean,
  name: Schema.NullOr(Schema.String),
});
export const TradingConnectionStatus = Schema.Struct({
  tradovate: Schema.Struct({
    configured: Schema.Boolean,
    connected: Schema.Boolean,
    environment: Schema.NullOr(Schema.Literals(["demo", "live"])),
    source: Schema.Literals(["browser", "server", "none"]),
  }),
  telegram: TelegramConnectionStatus,
  rithmic: Schema.Struct({ available: Schema.Literal(false), reason: Schema.String }),
});
export type TradingConnectionStatus = typeof TradingConnectionStatus.Type;
export const TradingConnectionCommand = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("tradovate.connect"),
    environment: Schema.Literals(["demo", "live"]),
    token: Schema.String,
  }),
  Schema.Struct({ action: Schema.Literal("tradovate.disconnect") }),
  Schema.Struct({
    action: Schema.Literal("telegram.configure"),
    apiId: Schema.Finite,
    apiHash: Schema.String,
  }),
  Schema.Struct({ action: Schema.Literal("telegram.start"), phone: Schema.String }),
  Schema.Struct({
    action: Schema.Literal("telegram.code"),
    challenge: Schema.String,
    code: Schema.String,
  }),
  Schema.Struct({
    action: Schema.Literal("telegram.password"),
    challenge: Schema.String,
    password: Schema.String,
  }),
  Schema.Struct({ action: Schema.Literal("telegram.disconnect") }),
]);
export type TradingConnectionCommand = typeof TradingConnectionCommand.Type;
