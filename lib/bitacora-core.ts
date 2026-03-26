import type { Exec } from "./engine/types";
import {
  computeOptions,
  computeStocks,
  computeCapitalSnapshot,
  buildWheelContext,
} from "./ibkr-engine";

export type StockMethod = "FIFO" | "AVG";

export type PrefLike = {
  stockMethod?: StockMethod;
};

type CapitalSnapshotLike = {
  cspCapitalOpen?: number;
  stockCapital?: number;
  totalCapital?: number;
};

type OptionRowLike = {
  status?: string;
  strategy?: string;
  netQty?: number;
  realized?: number;
  premium?: number;
  credit?: number;
};

export function monthKey(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export function assignWheelTags(allExecs: Exec[]) {
  const ctx = buildWheelContext(allExecs);

  for (const e of allExecs) {
    e.WheelTag = null;

    if (e.AssetClass === "STK") {
      const tid = String(e.TradeID || "");
      if (ctx.assignedBuyTradeIDs.has(tid)) e.WheelTag = "ASSIGNED_BUY";
      else if (ctx.assignedSellTradeIDs.has(tid)) e.WheelTag = "ASSIGNED_SELL";
      else e.WheelTag = "STOCK";
    } else if (e.AssetClass === "OPT") {
      const row = ctx.optionsAgg.rows.find((r) => {
        return (
          String(r.conid || "") === String(e.Conid || "") &&
          String(r.expiry || "") === String(e.Expiry || "") &&
          String(r.pc || "") === String(e.PutCall || "") &&
          Number(r.strike || 0) === Number(e.Strike || 0)
        );
      });

      if (row?.status === "EXPIRED") e.WheelTag = "OPT_EXPIRED";
      else e.WheelTag = e.Strategy || null;
    }
  }

  return ctx;
}

function getCapitalFields(cap: CapitalSnapshotLike) {
  const cspCapitalOpen = Number(cap?.cspCapitalOpen || 0);
  const stockCapital = Number(cap?.stockCapital || 0);

  const totalCapital =
    cspCapitalOpen + stockCapital > 0
      ? cspCapitalOpen + stockCapital
      : Number(cap?.totalCapital || 0);

  return {
    cspCapitalOpen,
    stockCapital,
    totalCapital,
  };
}

function getOptionRealizedPremium(op: { realizedTotal?: number }) {
  return Number(op?.realizedTotal || 0);
}

function getOptionUnrealizedPremium(op: { rows?: OptionRowLike[] }) {
  const rows = Array.isArray(op?.rows) ? op.rows : [];

  return rows
    .filter((r) => r.status === "OPEN")
    .reduce((sum, r) => {
      const premium =
        Number(r.premium ?? 0) ||
        Number(r.credit ?? 0) ||
        Number(r.realized ?? 0) ||
        0;

      return sum + premium;
    }, 0);
}

export function monthlyIncomeStatement(
  allExecs: Exec[],
  method: StockMethod = "FIFO"
) {
  const ctx = buildWheelContext(allExecs);
  const monthsSet = new Set(
    allExecs.map((e) => monthKey(e.TradeDate)).filter(Boolean)
  );
  const months = Array.from(monthsSet).sort();

  return months.map((mk) => {
    const slice = allExecs.filter((e) => monthKey(e.TradeDate) === mk);
    const st = computeStocks(
      slice,
      method,
      ctx.assignedBuyTradeIDs,
      ctx.ccActiveUnderlyings
    );
    const op = computeOptions(slice);

    const stocksRealized = Number(st?.totalRealized || 0);
    const optionsRealized = Number(op?.realizedTotal || 0);

    return {
      month: mk,
      stocks: stocksRealized,
      options: optionsRealized,
      total: stocksRealized + optionsRealized,
    };
  });
}

export function capitalSnapshot(
  execsUpToDate: Exec[],
  method: StockMethod = "FIFO"
) {
  const ctx = buildWheelContext(execsUpToDate);
  return computeCapitalSnapshot(
    execsUpToDate,
    method,
    ctx.assignedBuyTradeIDs,
    ctx.ccActiveUnderlyings
  );
}

export function monthlyROI(allExecs: Exec[], method: StockMethod = "FIFO") {
  const income = monthlyIncomeStatement(allExecs, method);
  const months = income.map((r) => r.month);

  return months.map((mk, idx) => {
    const monthExecs = allExecs.filter((e) => monthKey(e.TradeDate) <= mk);
    const capRaw = capitalSnapshot(monthExecs, method);
    const cap = getCapitalFields(capRaw);

    const monthIncome = Number(income[idx]?.total || 0);
    const capitalBase = cap.totalCapital;

    return {
      month: mk,
      income: monthIncome,
      capital: capitalBase,
      roi: capitalBase > 0 ? (monthIncome / capitalBase) * 100 : 0,
    };
  });
}

function normalizeSymbol(value?: string) {
  return String(value || "").trim().toUpperCase();
}

function execSortAsc(a: Exec, b: Exec) {
  return (
    String(a.TradeDate || "").localeCompare(String(b.TradeDate || "")) ||
    String(a.TradeID || "").localeCompare(String(b.TradeID || ""))
  );
}

function tradeNetCash(e: Exec) {
  return Number(e.Proceeds || 0) - Math.abs(Number(e.IBCommission || 0));
}

function getSignedShareDelta(e: Exec) {
  if (e.AssetClass !== "STK") return 0;
  return Number(e.Quantity || 0);
}

function getTickerFromExec(e: Exec) {
  if (e.AssetClass === "OPT") {
    return normalizeSymbol(e.UnderlyingSymbol || e.Symbol);
  }
  return normalizeSymbol(e.Symbol);
}

function getEventLabel(e: Exec) {
  if (e.AssetClass === "STK") {
    if (e.WheelTag === "ASSIGNED_BUY") return "Assigned stock buy";
    if (e.WheelTag === "ASSIGNED_SELL") return "Called away / assigned sell";
    return String(e.BuySell || "") === "BUY" ? "Stock buy" : "Stock sell";
  }

  const pc = String(e.PutCall || "").toUpperCase();
  const buySell = String(e.BuySell || "").toUpperCase();

  if (buySell === "SELL" && pc === "P") return "Sell put";
  if (buySell === "BUY" && pc === "P") return "Buy put";
  if (buySell === "SELL" && pc === "C") return "Sell call";
  if (buySell === "BUY" && pc === "C") return "Buy call";

  return "Option trade";
}

function getOptionFamilyKey(e: Exec) {
  return [
    normalizeSymbol(e.UnderlyingSymbol || e.Symbol),
    String(e.Conid || ""),
    String(e.Expiry || ""),
    String(e.PutCall || ""),
    Number(e.Strike || 0),
    Number(e.Multiplier || 100),
  ].join("|");
}

export function getTickerDashboardModel(
  execs: Exec[],
  selectedTicker: string,
  pref?: PrefLike
) {
  const method: StockMethod = pref?.stockMethod === "AVG" ? "AVG" : "FIFO";
  const ticker = normalizeSymbol(selectedTicker);

  const ctx = assignWheelTags(execs);

  const tickerExecs = execs
    .filter((e) => getTickerFromExec(e) === ticker)
    .slice()
    .sort(execSortAsc);

  const st = computeStocks(
    tickerExecs,
    method,
    ctx.assignedBuyTradeIDs,
    ctx.ccActiveUnderlyings
  );
  const op = computeOptions(tickerExecs);
  const capRaw = computeCapitalSnapshot(
    tickerExecs,
    method,
    ctx.assignedBuyTradeIDs,
    ctx.ccActiveUnderlyings
  );
  const cap = getCapitalFields(capRaw);

  const stockRow =
    st.rows.find((r) => normalizeSymbol(r.symbol) === ticker) || null;

  const stockExecs = tickerExecs.filter((e) => e.AssetClass === "STK");
  const optionExecs = tickerExecs.filter((e) => e.AssetClass === "OPT");

  const stockBuys = stockExecs.filter((e) => Number(e.Quantity || 0) > 0);
  const stockSells = stockExecs.filter((e) => Number(e.Quantity || 0) < 0);

  const optionPremiumAllTime = optionExecs.reduce(
    (sum, e) => sum + tradeNetCash(e),
    0
  );

  const stockRealized = Number(st.totalRealized || 0);
  const optionRealized = Number(op.realizedTotal || 0);
  const totalRealized = stockRealized + optionRealized;

  const netSharesOpen = Number(stockRow?.netQty || 0);
  const stockCostBasisOpen = Number(stockRow?.costBasis || 0);
  const avgCostOpen =
    netSharesOpen > 0 ? stockCostBasisOpen / netSharesOpen : 0;

  const breakEvenStock =
    netSharesOpen > 0 ? stockCostBasisOpen / netSharesOpen : null;

  const breakEvenGlobal =
    netSharesOpen > 0
      ? (stockCostBasisOpen - optionPremiumAllTime) / netSharesOpen
      : null;

  const openOptions = op.rows.filter((r) => r.status === "OPEN");
  const openShortPuts = openOptions.filter(
    (r) => r.strategy === "CSP" && Number(r.netQty) < 0
  );
  const openCoveredCalls = openOptions.filter(
    (r) => r.strategy === "CC" && Number(r.netQty) < 0
  );

  const wheelStage = stockRow?.wheelStage || "NO_OPEN_STOCK";

  const optionAggByKey = new Map(
    op.rows.map((row) => [
      [
        normalizeSymbol(row.underlying),
        String(row.conid || ""),
        String(row.expiry || ""),
        String(row.pc || ""),
        Number(row.strike || 0),
        Number(row.multiplier || 100),
      ].join("|"),
      row,
    ])
  );

  let runningShares = 0;
  let runningOptionPremium = 0;

  const timeline = tickerExecs.map((e) => {
    const isStock = e.AssetClass === "STK";
    const netCash = tradeNetCash(e);
    const shareDelta = getSignedShareDelta(e);

    if (isStock) runningShares += shareDelta;
    else runningOptionPremium += netCash;

    const familyKey = isStock ? "" : getOptionFamilyKey(e);
    const optionRow = !isStock ? optionAggByKey.get(familyKey) : null;

    return {
      id: String(e.TradeID || `${e.TradeDate}-${Math.random()}`),
      tradeDate: e.TradeDate || "",
      symbol: ticker,
      assetClass: e.AssetClass,
      event: getEventLabel(e),
      side: e.BuySell || "",
      quantity: Number(e.Quantity || 0),
      absQuantity: Math.abs(Number(e.Quantity || 0)),
      tradePrice: Number(e.TradePrice || 0),
      proceeds: Number(e.Proceeds || 0),
      commission: Number(e.IBCommission || 0),
      netCash,
      expiry: e.Expiry || "",
      strike: e.Strike ?? null,
      putCall: e.PutCall || "",
      wheelTag: e.WheelTag || "",
      shareDelta,
      runningShares,
      runningOptionPremium,
      optionStatus: optionRow?.status || "",
      optionStrategy: optionRow?.strategy || "",
    };
  });

  const monthlyPremiumMap = new Map<string, number>();
  optionExecs.forEach((e) => {
    const mk = monthKey(e.TradeDate);
    if (!mk) return;
    monthlyPremiumMap.set(mk, (monthlyPremiumMap.get(mk) || 0) + tradeNetCash(e));
  });

  const premiumByMonth = Array.from(monthlyPremiumMap.entries()).map(
    ([month, premium]) => ({
      month,
      premium: Number(premium.toFixed(2)),
    })
  );

  const cumulativePnlMap = new Map<string, number>();
  let cumulative = 0;
  tickerExecs.forEach((e) => {
    const mk = monthKey(e.TradeDate);
    if (!mk) return;

    if (e.AssetClass === "OPT") {
      cumulative += tradeNetCash(e);
    }
    cumulativePnlMap.set(mk, Number(cumulative.toFixed(2)));
  });

  const pnlTimeline = Array.from(cumulativePnlMap.entries()).map(
    ([month, pnl]) => ({
      month,
      pnl,
    })
  );

  const tickerList = Array.from(
    new Set(
      execs
        .map((e) => getTickerFromExec(e))
        .filter((v) => !!v && v !== "USD.CAD")
    )
  ).sort();

  return {
    ticker,
    tickerList,
    tickerExecs,
    stockExecs,
    optionExecs,
    timeline,
    stocks: st,
    options: op,
    capital: {
      ...capRaw,
      cspCapitalOpen: cap.cspCapitalOpen,
      stockCapital: cap.stockCapital,
      totalCapital: cap.totalCapital,
    },
    stockRow,
    netSharesOpen,
    stockCostBasisOpen,
    avgCostOpen,
    breakEvenStock,
    breakEvenGlobal,
    stockRealized,
    optionRealized,
    totalRealized,
    optionPremiumAllTime,
    openOptions,
    openShortPuts,
    openCoveredCalls,
    stockBuyCount: stockBuys.length,
    stockSellCount: stockSells.length,
    optionTradeCount: optionExecs.length,
    wheelStage,
    premiumByMonth,
    pnlTimeline,
  };
}

export function getDashboardModel(execs: Exec[], pref?: PrefLike) {
  const method: StockMethod = pref?.stockMethod === "AVG" ? "AVG" : "FIFO";

  const ctx = assignWheelTags(execs);
  const st = computeStocks(
    execs,
    method,
    ctx.assignedBuyTradeIDs,
    ctx.ccActiveUnderlyings
  );
  const op = computeOptions(execs);
  const capRaw = computeCapitalSnapshot(
    execs,
    method,
    ctx.assignedBuyTradeIDs,
    ctx.ccActiveUnderlyings
  );
  const cap = getCapitalFields(capRaw);

  const roiRows = monthlyROI(execs, method);
  const incomeRows = monthlyIncomeStatement(execs, method);

  const openShortPuts = op.rows.filter(
    (r) => r.status === "OPEN" && r.strategy === "CSP" && Number(r.netQty) < 0
  );

  const openCoveredCalls = op.rows.filter(
    (r) => r.status === "OPEN" && r.strategy === "CC" && Number(r.netQty) < 0
  );

  const realizedPremium = getOptionRealizedPremium(op);
  const unrealizedPremium = getOptionUnrealizedPremium(op);

  const totalCapital = cap.totalCapital;

  const roi = totalCapital > 0 ? (realizedPremium / totalCapital) * 100 : 0;

  const capitalEfficiency =
    cap.cspCapitalOpen > 0
      ? (realizedPremium / cap.cspCapitalOpen) * 100
      : 0;

  return {
    ctx,
    stocks: st,
    options: op,
    capital: {
      ...capRaw,
      cspCapitalOpen: cap.cspCapitalOpen,
      stockCapital: cap.stockCapital,
      totalCapital,
    },
    roiRows,
    incomeRows,

    premiumCollected: realizedPremium,
    realizedPremium,
    unrealizedPremium,

    totalCapital,
    roi,
    capitalEfficiency,

    openShortPuts,
    openCoveredCalls,
  };
}