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
    const st = computeStocks(slice, method, ctx.assignedBuyTradeIDs, ctx.ccActiveUnderlyings);
    const op = computeOptions(slice);

    return {
      month: mk,
      stocks: st.totalRealized,
      options: op.realizedTotal,
      total: st.totalRealized + op.realizedTotal,
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
    const cap = capitalSnapshot(monthExecs, method);
    const avgCapital = Number(cap.totalCapital || 0);
    const monthIncome = income[idx]?.total || 0;

    return {
      month: mk,
      income: monthIncome,
      capital: avgCapital,
      roi: avgCapital > 0 ? (monthIncome / avgCapital) * 100 : 0,
    };
  });
}

export function getDashboardModel(
  execs: Exec[],
  pref?: PrefLike
) {
  const method: StockMethod = pref?.stockMethod === "AVG" ? "AVG" : "FIFO";

  const ctx = assignWheelTags(execs);
  const st = computeStocks(execs, method, ctx.assignedBuyTradeIDs, ctx.ccActiveUnderlyings);
  const op = computeOptions(execs);
  const cap = computeCapitalSnapshot(execs, method, ctx.assignedBuyTradeIDs, ctx.ccActiveUnderlyings);
  const roiRows = monthlyROI(execs, method);
  const incomeRows = monthlyIncomeStatement(execs, method);

  const openShortPuts = op.rows.filter(
    (r) => r.status === "OPEN" && r.strategy === "CSP" && Number(r.netQty) < 0
  );

  const openCoveredCalls = op.rows.filter(
    (r) => r.status === "OPEN" && r.strategy === "CC" && Number(r.netQty) < 0
  );

  return {
    ctx,
    stocks: st,
    options: op,
    capital: cap,
    roiRows,
    incomeRows,
    premiumCollected: op.realizedTotal,
    openShortPuts,
    openCoveredCalls,
  };
}