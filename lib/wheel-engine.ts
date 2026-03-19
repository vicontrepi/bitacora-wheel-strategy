export type Trade = {
  TradeID: string;
  TradeDate: string;
  Symbol: string;
  AssetClass: "STK" | "OPT" | string;
  BuySell: "BUY" | "SELL" | string;
  Quantity: number;
  TradePrice: number;
  Proceeds: number;
  IBCommission: number;
  Expiry?: string;
  Strike?: number;
  PutCall?: "P" | "C" | string;
  Multiplier?: number;
  Source?: "CSV" | "MANUAL" | string;
};

export type OpenOptionPosition = {
  key: string;
  Symbol: string;
  Expiry?: string;
  Strike?: number;
  PutCall?: string;
  netContracts: number;
  Multiplier: number;
  premiumNet: number;
  side: "SHORT" | "LONG";
};

export type OpenStockPosition = {
  key: string;
  Symbol: string;
  netShares: number;
  stockCost: number;
};

function optionKey(t: Trade) {
  return [
    t.Symbol || "",
    t.Expiry || "",
    String(t.Strike ?? ""),
    t.PutCall || "",
    String(t.Multiplier ?? 100),
  ].join("|");
}

function stockKey(t: Trade) {
  return t.Symbol || "";
}

function signedQty(t: Trade) {
  const qty = Math.abs(Number(t.Quantity || 0));
  return String(t.BuySell).toUpperCase() === "SELL" ? -qty : qty;
}

function premiumContribution(t: Trade) {
  const proceeds = Number(t.Proceeds || 0);
  const fee = Math.abs(Number(t.IBCommission || 0));
  return proceeds - fee;
}

export function getOpenOptionPositions(trades: Trade[]): OpenOptionPosition[] {
  const map = new Map<string, OpenOptionPosition>();

  trades
    .filter((t) => t.AssetClass === "OPT")
    .forEach((t) => {
      const key = optionKey(t);
      const prev = map.get(key);

      const qtySigned = signedQty(t) / 1;
      const premium = premiumContribution(t);

      if (!prev) {
        map.set(key, {
          key,
          Symbol: t.Symbol,
          Expiry: t.Expiry,
          Strike: t.Strike,
          PutCall: t.PutCall,
          netContracts: qtySigned,
          Multiplier: Number(t.Multiplier || 100),
          premiumNet: premium,
          side: qtySigned < 0 ? "SHORT" : "LONG",
        });
      } else {
        prev.netContracts += qtySigned;
        prev.premiumNet += premium;
        prev.side = prev.netContracts < 0 ? "SHORT" : "LONG";
      }
    });

  return Array.from(map.values()).filter((p) => Math.abs(p.netContracts) > 0.000001);
}

export function getOpenStockPositions(trades: Trade[]): OpenStockPosition[] {
  const map = new Map<string, OpenStockPosition>();

  trades
    .filter((t) => t.AssetClass === "STK")
    .forEach((t) => {
      const key = stockKey(t);
      const prev = map.get(key);

      const qtySigned = signedQty(t);
      const costMove =
        String(t.BuySell).toUpperCase() === "BUY"
          ? Math.abs(Number(t.Proceeds || 0))
          : -Math.abs(Number(t.Proceeds || 0));

      if (!prev) {
        map.set(key, {
          key,
          Symbol: t.Symbol,
          netShares: qtySigned,
          stockCost: costMove > 0 ? costMove : 0,
        });
      } else {
        prev.netShares += qtySigned;
        prev.stockCost += costMove;
      }
    });

  return Array.from(map.values()).filter((p) => Math.abs(p.netShares) > 0.000001);
}

export function getOpenWheelRows(trades: Trade[]) {
  const openOpts = getOpenOptionPositions(trades);
  const openStocks = getOpenStockPositions(trades);

  const optionRows = openOpts
    .filter((p) => p.side === "SHORT")
    .map((p) => ({
      id: p.key,
      Symbol: p.Symbol,
      Type: p.PutCall === "P" ? "Cash Secured Put" : "Covered Call",
      Side: p.side,
      Qty: Math.abs(p.netContracts),
      Strike: p.Strike ?? null,
      Expiry: p.Expiry ?? null,
      PremiumOrCost: p.premiumNet,
      AssetClass: "OPT",
    }));

  const stockRows = openStocks.map((p) => ({
    id: p.key,
    Symbol: p.Symbol,
    Type: "Stock",
    Side: "LONG",
    Qty: p.netShares,
    Strike: null,
    Expiry: null,
    PremiumOrCost: -Math.abs(p.stockCost),
    AssetClass: "STK",
  }));

  return [...optionRows, ...stockRows];
}

export function getExpirationBucketsFromOpenOptions(trades: Trade[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function dte(expiry?: string) {
    if (!expiry) return null;
    const d = new Date(expiry);
    d.setHours(0, 0, 0, 0);
    const diff = d.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  const openShortOptions = getOpenOptionPositions(trades).filter(
    (p) => p.side === "SHORT" && p.Expiry
  );

  const dtes = openShortOptions
    .map((p) => dte(p.Expiry))
    .filter((x): x is number => x !== null && x >= 0);

  return {
    d7: dtes.filter((x) => x <= 7).length,
    d14: dtes.filter((x) => x <= 14).length,
    d30: dtes.filter((x) => x <= 30).length,
    d60: dtes.filter((x) => x <= 60).length,
    d90: dtes.filter((x) => x <= 90).length,
  };
}

export function getCspCapitalAtRiskFromOpenOptions(trades: Trade[]) {
  return getOpenOptionPositions(trades)
    .filter((p) => p.side === "SHORT" && p.PutCall === "P")
    .reduce((acc, p) => {
      return (
        acc +
        Number(p.Strike || 0) *
          Math.abs(Number(p.netContracts || 0)) *
          Number(p.Multiplier || 100)
      );
    }, 0);
}

export function getCoveredCallCount(trades: Trade[]) {
  return getOpenOptionPositions(trades).filter(
    (p) => p.side === "SHORT" && p.PutCall === "C"
  ).length;
}

export function getShortPutCount(trades: Trade[]) {
  return getOpenOptionPositions(trades).filter(
    (p) => p.side === "SHORT" && p.PutCall === "P"
  ).length;
}