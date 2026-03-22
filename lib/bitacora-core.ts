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

export function monthlyROI(
  allExecs: Exec[],
  method: StockMethod = "FIFO"
) {
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