import type { Exec } from "./engine/types";

export type OptionRow = {
  conid: string;
  underlying: string;
  expiry?: string;
  pc?: string;
  strike?: number;
  multiplier: number;
  netQty: number;
  cashflow: number;
  realized: number;
  status: "OPEN" | "CLOSED" | "EXPIRED";
  lastDate?: string;
  strategy: string;
  soldQty: number;
  boughtQty: number;
};

export type StockRow = {
  symbol: string;
  netQty: number;
  costBasis: number;
  status: "OPEN" | "CLOSED";
  lastDate?: string;
  wheelStage: "STOCK" | "WHEEL_STOCK" | "CC_ACTIVE";
};

function cf(e: Exec) {
  return Number(e.Proceeds || 0) + Number(e.IBCommission || 0);

}

function daysUntil(expiry?: string) {
  if (!expiry) return null;

  const clean = String(expiry).trim();
  if (!clean) return null;

  const now = new Date();
  const d = new Date(`${clean}T00:00:00`);

  if (Number.isNaN(d.getTime())) return null;

  now.setHours(0, 0, 0, 0);

  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function addDays(dateIso: string, n: number) {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function optionKey(e: Exec) {
  return [
    e.Conid || "",
    e.UnderlyingSymbol || e.Symbol || "",
    e.Expiry || "",
    e.PutCall || "",
    e.Strike ?? "",
    e.Multiplier ?? 100,
  ].join("|");
}

export function computeOptions(allExecs: Exec[]) {
  const opt = allExecs.filter((e) => e.AssetClass === "OPT");
  const by = new Map<string, any>();

  function ensure(e: Exec) {
    const k = optionKey(e);

    if (!by.has(k)) {
      by.set(k, {
        conid: String(e.Conid || ""),
        underlying: String(e.UnderlyingSymbol || e.Symbol || "").toUpperCase(),
        expiry: e.Expiry,
        pc: e.PutCall,
        strike: e.Strike,
        mult: Number(e.Multiplier || 100),
        netQty: 0,
        cashflow: 0,
        lastDate: e.TradeDate,
        soldQty: 0,
        boughtQty: 0,
      });
    }

    const a = by.get(k);

    if (e.TradeDate && (!a.lastDate || e.TradeDate > a.lastDate)) {
      a.lastDate = e.TradeDate;
    }
    if (!a.expiry && e.Expiry) a.expiry = e.Expiry;
    if (!a.strike && e.Strike) a.strike = e.Strike;
    if (!a.pc && e.PutCall) a.pc = e.PutCall;
    if (!a.underlying && (e.UnderlyingSymbol || e.Symbol)) {
      a.underlying = String(e.UnderlyingSymbol || e.Symbol || "").toUpperCase();
    }
    if (!a.mult && e.Multiplier) a.mult = Number(e.Multiplier || a.mult || 100);

    return a;
  }

  for (const e of opt) {
    const a = ensure(e);

    a.netQty += Number(e.Quantity || 0);
    a.cashflow += cf(e);

    if (Number(e.Quantity || 0) < 0) {
      a.soldQty += Math.abs(Number(e.Quantity || 0));
    }
    if (Number(e.Quantity || 0) > 0) {
      a.boughtQty += Math.abs(Number(e.Quantity || 0));
    }

    if (e.Multiplier) a.mult = Number(e.Multiplier || a.mult || 100);
  }

  const rows: OptionRow[] = Array.from(by.values())
    .map((x) => {
      let strat = "OPT_OTHER";
      const pc = String(x.pc || "").toUpperCase();

      if (x.soldQty >= x.boughtQty) {
        if (pc === "P") strat = "CSP";
        else if (pc === "C") strat = "CC";
      } else {
        if (pc === "P") strat = "BTC_PUT";
        else if (pc === "C") strat = "BTC_CALL";
      }

      let status: "OPEN" | "CLOSED" | "EXPIRED" =
        Math.abs(Number(x.netQty || 0)) < 1e-9 ? "CLOSED" : "OPEN";

      const normalizedExpiry =
      typeof x.expiry === "string" ? x.expiry.trim() : x.expiry;

      const dte = daysUntil(normalizedExpiry);

      if (status === "OPEN" && normalizedExpiry && dte != null && dte < 0) {
      status = "EXPIRED";
      }

      const realized =
        status === "CLOSED" || status === "EXPIRED"
          ? Number(x.cashflow || 0)
          : 0;

      return {
        conid: String(x.conid || ""),
        underlying: String(x.underlying || "").toUpperCase(),
        expiry: normalizedExpiry,
        pc: x.pc,
        strike: x.strike,
        multiplier: Number(x.mult || 100),
        netQty: Number(x.netQty || 0),
        cashflow: Number(x.cashflow || 0),
        realized,
        status,
        lastDate: x.lastDate,
        strategy: strat,
        soldQty: Number(x.soldQty || 0),
        boughtQty: Number(x.boughtQty || 0),
      };
    })
    .sort(
      (a, b) =>
        String(b.lastDate || "").localeCompare(String(a.lastDate || "")) ||
        String(a.underlying || "").localeCompare(String(b.underlying || ""))
    );

  const realizedTotal = rows.reduce((acc, r) => acc + Number(r.realized || 0), 0);
  const openCount = rows.filter((r) => r.status === "OPEN").length;

  return { rows, realizedTotal, openCount };
}

export function buildWheelContext(allExecs: Exec[]) {
  const optionsAgg = computeOptions(allExecs);
  const optRows = optionsAgg.rows;

  const ccActiveUnderlyings = new Set(
    optRows
      .filter((o) => o.status === "OPEN" && o.strategy === "CC" && Number(o.netQty) < 0)
      .map((o) => o.underlying)
  );

  const stkExecs = allExecs.filter((e) => e.AssetClass === "STK" && e.TradeDate && e.Symbol);
  const bySymbolDate = new Map<string, Exec[]>();

  for (const e of stkExecs) {
    const k = `${String(e.Symbol || "").toUpperCase()}|${e.TradeDate}`;
    if (!bySymbolDate.has(k)) bySymbolDate.set(k, []);
    bySymbolDate.get(k)!.push(e);
  }

  const assignedBuyTradeIDs = new Set<string>();
  const assignedSellTradeIDs = new Set<string>();

  function getNearDates(expiryIso: string) {
    const out: string[] = [];
    for (let i = 0; i <= 3; i++) out.push(addDays(expiryIso, i));
    return out;
  }

  for (const o of optRows) {
    if (!o.expiry) continue;
    if (o.status !== "EXPIRED") continue;
    if (!(Number(o.netQty) < 0)) continue;

    const contracts = Math.abs(Number(o.netQty || 0));
    const mult = Number(o.multiplier || 100);
    const targetQty = contracts * mult;
    const u = String(o.underlying || "").toUpperCase();

    const dates = getNearDates(o.expiry);

    if (o.strategy === "CSP") {
      for (const dt of dates) {
        const arr = bySymbolDate.get(`${u}|${dt}`) || [];
        for (const e of arr) {
          if (String(e.BuySell) === "BUY" && Math.abs(Number(e.Quantity || 0)) === targetQty) {
            assignedBuyTradeIDs.add(String(e.TradeID || ""));
          }
        }
      }
    }

    if (o.strategy === "CC") {
      for (const dt of dates) {
        const arr = bySymbolDate.get(`${u}|${dt}`) || [];
        for (const e of arr) {
          if (String(e.BuySell) === "SELL" && Math.abs(Number(e.Quantity || 0)) === targetQty) {
            assignedSellTradeIDs.add(String(e.TradeID || ""));
          }
        }
      }
    }
  }

  return {
    optionsAgg,
    ccActiveUnderlyings,
    assignedBuyTradeIDs,
    assignedSellTradeIDs,
  };
}

export function computeStocks(
  allExecs: Exec[],
  method: "FIFO" | "AVG" = "FIFO",
  assignedBuyTradeIDs: Set<string> = new Set(),
  ccActiveUnderlyings: Set<string> = new Set()
) {
  const stk = allExecs
    .filter((e) => e.AssetClass === "STK" && e.Symbol && e.TradeDate)
    .slice()
    .sort(
      (a, b) =>
        String(a.TradeDate || "").localeCompare(String(b.TradeDate || "")) ||
        String(a.TradeID || "").localeCompare(String(b.TradeID || ""))
    );

  type Lot = {
    qty: number;
    costPerShare: number;
    assigned: boolean;
  };

  type Position = {
    symbol: string;
    shares: number;
    costBasis: number;
    avgCost: number;
    realized: number;
    lots: Lot[];
    assignedLotsShares: number;
    lastDate?: string;
  };

  const positions = new Map<string, Position>();

  function ensure(sym: string): Position {
    const key = String(sym || "").toUpperCase();
    if (!positions.has(key)) {
      positions.set(key, {
        symbol: key,
        shares: 0,
        costBasis: 0,
        avgCost: 0,
        realized: 0,
        lots: [],
        assignedLotsShares: 0,
        lastDate: "",
      });
    }
    return positions.get(key)!;
  }

  function cashflow(e: Exec) {
    // mismo criterio del HTML:
    // neto efectivo de la ejecución
    return Number(e.Proceeds || 0) + Number(e.IBCommission || 0);
  }

  for (const e of stk) {
    const symbol = String(e.Symbol || "").toUpperCase();
    if (!symbol || symbol === "USD.CAD") continue;

    const p = ensure(symbol);
    const qtySigned = Number(e.Quantity || 0);
    if (!qtySigned) continue;

    const isAssignedBuy = assignedBuyTradeIDs.has(String(e.TradeID || ""));

    if (e.TradeDate && (!p.lastDate || e.TradeDate > p.lastDate)) {
      p.lastDate = e.TradeDate;
    }

    // BUY
    if (qtySigned > 0) {
      const buyQty = qtySigned;
      const cost = -cashflow(e); // compra = salida de efectivo positiva como costo

      p.shares += buyQty;

      if (method === "FIFO") {
        p.lots.push({
          qty: buyQty,
          costPerShare: buyQty > 0 ? cost / buyQty : 0,
          assigned: isAssignedBuy,
        });
        p.costBasis += cost;
      } else {
        p.costBasis += cost;
        p.avgCost = p.shares > 0 ? p.costBasis / p.shares : 0;
      }

      if (isAssignedBuy) {
        p.assignedLotsShares += buyQty;
      }
    }

    // SELL
    if (qtySigned < 0) {
      const sellQty = Math.abs(qtySigned);
      const proceedsNet = cashflow(e);

      if (method === "FIFO") {
        let remaining = sellQty;
        let costRemoved = 0;

        while (remaining > 0 && p.lots.length > 0) {
          const lot = p.lots[0];
          const take = Math.min(remaining, lot.qty);

          costRemoved += take * lot.costPerShare;

          if (lot.assigned) {
            p.assignedLotsShares -= take;
            if (p.assignedLotsShares < 0) p.assignedLotsShares = 0;
          }

          lot.qty -= take;
          remaining -= take;

          if (lot.qty <= 1e-9) {
            p.lots.shift();
          }
        }

        p.shares -= sellQty;
        p.costBasis -= costRemoved;
        p.realized += proceedsNet - costRemoved;
      } else {
        const costRemoved = sellQty * (p.avgCost || 0);

        p.shares -= sellQty;
        p.costBasis -= costRemoved;
        p.realized += proceedsNet - costRemoved;
        p.avgCost = p.shares > 0 ? p.costBasis / p.shares : 0;

        // ajuste simple de assigned shares en AVG
        if (p.assignedLotsShares > 0) {
          p.assignedLotsShares = Math.max(0, p.assignedLotsShares - sellQty);
        }
      }
    }
  }

  const rows = Array.from(positions.values())
    .map((x) => {
      const openQty = Math.max(Number(x.shares || 0), 0);
      const status: "OPEN" | "CLOSED" =
        Math.abs(Number(x.shares || 0)) < 1e-9 ? "CLOSED" : "OPEN";

      let wheelStage: "STOCK" | "WHEEL_STOCK" | "CC_ACTIVE" = "STOCK";

      if (status === "OPEN" && Number(x.assignedLotsShares || 0) > 0) {
        wheelStage = "WHEEL_STOCK";
      }

      if (
        status === "OPEN" &&
        ccActiveUnderlyings.has(String(x.symbol || "").toUpperCase())
      ) {
        wheelStage = "CC_ACTIVE";
      }

      return {
        symbol: String(x.symbol || "").toUpperCase(),
        netQty: openQty,
        costBasis: Number(x.costBasis || 0),
        status,
        lastDate: x.lastDate,
        wheelStage,
        realized: Number(x.realized || 0),
        avgCost: openQty > 0 ? Number(x.costBasis || 0) / openQty : 0,
      };
    })
    .filter(
      (r) =>
        Math.abs(Number(r.netQty || 0)) > 1e-9 ||
        Math.abs(Number((r as any).realized || 0)) > 1e-6
    )
    .sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || "")));

  const stockCapital = rows
    .filter((r) => r.status === "OPEN")
    .reduce((acc, r) => acc + Number(r.costBasis || 0), 0);

  const totalRealized = rows.reduce(
    (acc, r) => acc + Number((r as any).realized || 0),
    0
  );

  return { rows, stockCapital, totalRealized, method };
}

export function computeCapitalSnapshot(
  allExecs: Exec[],
  method: "FIFO" | "AVG" = "FIFO",
  assignedBuyTradeIDs: Set<string> = new Set(),
  ccActiveUnderlyings: Set<string> = new Set()
) {
  const st = computeStocks(
    allExecs,
    method,
    assignedBuyTradeIDs,
    ccActiveUnderlyings
  );
  const opt = computeOptions(allExecs);

  const byTicker = new Map<string, number>();

  st.rows
    .filter((r) => r.status === "OPEN")
    .forEach((r) => {
      if (r.symbol === "USD.CAD") return;
      byTicker.set(r.symbol, (byTicker.get(r.symbol) || 0) + Number(r.costBasis || 0));
    });

  let cspCapitalOpen = 0;

  opt.rows
    .filter((r) => r.status === "OPEN" && r.strategy === "CSP" && Number(r.netQty) < 0)
    .forEach((r) => {
      const risk =
        Math.abs(Number(r.netQty || 0)) *
        Number(r.multiplier || 100) *
        Number(r.strike || 0);

      cspCapitalOpen += risk;
      byTicker.set(r.underlying, (byTicker.get(r.underlying) || 0) + risk);
    });

  const byTickerRows = Array.from(byTicker.entries())
    .map(([ticker, capital]) => ({ ticker, capital }))
    .sort((a, b) => b.capital - a.capital);

  return {
    stockCapital: st.stockCapital,
    cspCapitalOpen,
    cspRisk: cspCapitalOpen,
    totalCapital: st.stockCapital + cspCapitalOpen,
    byTickerRows,
  };
}