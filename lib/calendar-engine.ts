import type { Exec } from "./engine/types";
import { computeOptions, computeStocks, buildWheelContext } from "./ibkr-engine";

export type CalendarCell = {
  year: number;
  month: number; // 1-12
  week: number; // 1-6
  label: string;
  startDate?: string;
  endDate?: string;

  realizedStocks: number;
  realizedOptions: number;
  realizedTotal: number;

  tradesCount: number;
  openExpirations: number;
  assignedCount: number;
  cspCount: number;
  ccCount: number;

  capitalApprox: number;
};

export type CalendarMonth = {
  year: number;
  month: number;
  monthLabel: string;
  weeks: CalendarCell[];
};

export type CalendarYear = {
  year: number;
  months: CalendarMonth[];
};

function toDateOnly(dateStr?: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIso(date?: Date | null) {
  if (!date) return undefined;
  return date.toISOString().slice(0, 10);
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
  });
}

function getWeekOfMonth(dateStr?: string) {
  const d = toDateOnly(dateStr);
  if (!d) return 1;

  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  first.setHours(0, 0, 0, 0);

  const offset = first.getDay(); // domingo=0
  return Math.ceil((d.getDate() + offset) / 7);
}

function getWeekRange(year: number, month: number, week: number) {
  const first = new Date(year, month - 1, 1);
  first.setHours(0, 0, 0, 0);

  const start = new Date(first);
  start.setDate(1 + (week - 1) * 7 - first.getDay());

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    startDate: toIso(start),
    endDate: toIso(end),
  };
}

function keyFor(y: number, m: number, w: number) {
  return `${y}-${String(m).padStart(2, "0")}-W${w}`;
}

function getExecKey(e: Exec) {
  const y = new Date(e.TradeDate).getFullYear();
  const m = new Date(e.TradeDate).getMonth() + 1;
  const w = getWeekOfMonth(e.TradeDate);
  return { y, m, w, key: keyFor(y, m, w) };
}

export function buildCalendarModel(
  trades: Exec[],
  method: "FIFO" | "AVG" = "FIFO"
): CalendarYear[] {
  const validTrades = (trades || []).filter((t) => t.TradeDate);

  if (!validTrades.length) return [];

  const ctx = buildWheelContext(validTrades);

  const bucketMap = new Map<string, Exec[]>();
  const yearMonthSet = new Set<string>();

  validTrades.forEach((t) => {
    const { y, m, w, key } = getExecKey(t);
    yearMonthSet.add(`${y}-${m}`);

    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key)!.push(t);
  });

  const yearMonthPairs = Array.from(yearMonthSet)
    .map((v) => {
      const [ys, ms] = v.split("-");
      return { year: Number(ys), month: Number(ms) };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);

  const monthMap = new Map<string, CalendarMonth>();

  for (const { year, month } of yearMonthPairs) {
    const weeks: CalendarCell[] = [];

    for (let week = 1; week <= 6; week++) {
      const bucketKey = keyFor(year, month, week);
      const weekTrades = bucketMap.get(bucketKey) || [];

      const stocks = computeStocks(
        weekTrades,
        method,
        ctx.assignedBuyTradeIDs,
        ctx.ccActiveUnderlyings
      );
      const options = computeOptions(weekTrades);

      const openOptions = options.rows.filter((r) => r.status === "OPEN");
      const cspCount = openOptions.filter(
        (r) => r.strategy === "CSP" && Number(r.netQty) < 0
      ).length;
      const ccCount = openOptions.filter(
        (r) => r.strategy === "CC" && Number(r.netQty) < 0
      ).length;

      const assignedCount = weekTrades.filter((t) =>
        ctx.assignedBuyTradeIDs.has(String(t.TradeID || ""))
      ).length;

      const capitalApprox =
        stocks.rows
          .filter((r) => r.status === "OPEN")
          .reduce((acc, r) => acc + Number(r.costBasis || 0), 0) +
        openOptions
          .filter((r) => r.strategy === "CSP" && Number(r.netQty) < 0)
          .reduce(
            (acc, r) =>
              acc +
              Math.abs(Number(r.netQty || 0)) *
                Number(r.multiplier || 100) *
                Number(r.strike || 0),
            0
          );

      const range = getWeekRange(year, month, week);

      weeks.push({
        year,
        month,
        week,
        label: `W${week}`,
        startDate: range.startDate,
        endDate: range.endDate,
        realizedStocks: Number(stocks.totalRealized || 0),
        realizedOptions: Number(options.realizedTotal || 0),
        realizedTotal:
          Number(stocks.totalRealized || 0) + Number(options.realizedTotal || 0),
        tradesCount: weekTrades.length,
        openExpirations: openOptions.filter((r) => !!r.expiry).length,
        assignedCount,
        cspCount,
        ccCount,
        capitalApprox,
      });
    }

    monthMap.set(`${year}-${month}`, {
      year,
      month,
      monthLabel: monthLabel(year, month),
      weeks,
    });
  }

  const byYear = new Map<number, CalendarMonth[]>();

  Array.from(monthMap.values()).forEach((m) => {
    if (!byYear.has(m.year)) byYear.set(m.year, []);
    byYear.get(m.year)!.push(m);
  });

  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => a.month - b.month),
    }));
}