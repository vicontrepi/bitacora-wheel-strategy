export type AssetClass = "STK" | "OPT";

export interface Exec {
  TradeID: string;
  TradeDate: string;
  Symbol: string;
  AssetClass: AssetClass;
  BuySell: "BUY" | "SELL";
  Quantity: number;
  TradePrice: number;
  Proceeds: number;
  IBCommission: number;

  Expiry?: string;
  Strike?: number;
  PutCall?: "P" | "C";
  Multiplier?: number;

  Source?: "CSV" | "MANUAL";

  Conid?: string;
  UnderlyingSymbol?: string;
  Strategy?: string | null;
  WheelTag?: string | null;
}