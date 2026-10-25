import * as Schema from "effect/Schema";

export const TradingAccountRow = Schema.Struct({
  id: Schema.Number,
  accountId: Schema.Number,
  contractId: Schema.Number,
  symbol: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  quantity: Schema.optional(Schema.Number),
  netPos: Schema.optional(Schema.Number),
  netPrice: Schema.optional(Schema.Number),
  side: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  price: Schema.optional(Schema.Number),
  stopPrice: Schema.optional(Schema.Number),
  fillPrice: Schema.optional(Schema.Number),
});
export type TradingAccountRow = typeof TradingAccountRow.Type;

export const TradingAccountSnapshot = Schema.Struct({
  accounts: Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String })),
  accountId: Schema.NullOr(Schema.Number),
  environment: Schema.Literals(["demo", "live"]),
  positions: Schema.Array(TradingAccountRow),
  orders: Schema.Array(TradingAccountRow),
  history: Schema.Array(TradingAccountRow),
  fetchedAt: Schema.String,
  historyScope: Schema.Literal("available-session-fills"),
});
export type TradingAccountSnapshot = typeof TradingAccountSnapshot.Type;
