"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchTrades } from "../../lib/trades";
import type { Exec } from "../../lib/engine/types";
import { buildCalendarModel } from "../../lib/calendar-engine";

function fmtMoney(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function isTodayInsideWeek(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return false;

  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return today >= start && today <= end;
}

function cellTone(realized: number, isCurrentWeek: boolean) {
  const base =
    realized > 0
      ? "border-emerald-700 bg-emerald-950/40"
      : realized < 0
      ? "border-rose-700 bg-rose-950/40"
      : "border-slate-700 bg-slate-900";

  return isCurrentWeek ? `${base} ring-2 ring-sky-500` : base;
}

export default function CalendarPage() {
  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTrades() {
    try {
      setLoading(true);
      const data = await fetchTrades();
      setTrades((data || []) as Exec[]);
    } catch (err) {
      console.error(err);
      alert("Error loading calendar data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
  }, []);

  const calendar = useMemo(() => buildCalendarModel(trades, "FIFO"), [trades]);

  const allWeeks = useMemo(() => {
    return calendar.flatMap((yearBlock) =>
      yearBlock.months.flatMap((month) => month.weeks)
    );
  }, [calendar]);

  const weeksWithData = useMemo(() => {
    return allWeeks.filter(
      (w) => w.tradesCount > 0 || w.projectedExpirations > 0
    );
  }, [allWeeks]);

  const bestWeek = useMemo(() => {
    if (!weeksWithData.length) return null;
    return [...weeksWithData].sort(
      (a, b) => b.realizedTotal - a.realizedTotal
    )[0];
  }, [weeksWithData]);

  const worstWeek = useMemo(() => {
    if (!weeksWithData.length) return null;
    return [...weeksWithData].sort(
      (a, b) => a.realizedTotal - b.realizedTotal
    )[0];
  }, [weeksWithData]);

  const avgWeek = useMemo(() => {
    if (!weeksWithData.length) return 0;
    return (
      weeksWithData.reduce((acc, w) => acc + w.realizedTotal, 0) /
      weeksWithData.length
    );
  }, [weeksWithData]);

  const topProjectedWeek = useMemo(() => {
    const futureWeeks = weeksWithData.filter((w) => w.projectedPremium > 0);
    if (!futureWeeks.length) return null;
    return [...futureWeeks].sort(
      (a, b) => b.projectedPremium - a.projectedPremium
    )[0];
  }, [weeksWithData]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
            Loading calendar...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1800px] p-6">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Trading Calendar</h1>
            <p className="mt-2 text-slate-400">
              Weekly view of realized results and structures expiring.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadTrades}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>

            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Dashboard
            </Link>

            <Link
              href="/options"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Options
            </Link>

            <Link
              href="/stocks"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Stocks
            </Link>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Best Week</div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">
              {bestWeek ? `$${fmtMoney(bestWeek.realizedTotal)}` : "$0"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {bestWeek
                ? `${bestWeek.year}-${String(bestWeek.month).padStart(2, "0")} ${bestWeek.label}`
                : "No data"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Worst Week</div>
            <div className="mt-2 text-2xl font-bold text-rose-400">
              {worstWeek ? `$${fmtMoney(worstWeek.realizedTotal)}` : "$0"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {worstWeek
                ? `${worstWeek.year}-${String(worstWeek.month).padStart(2, "0")} ${worstWeek.label}`
                : "No data"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Average Week</div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              ${fmtMoney(avgWeek)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Based on weeks with activity
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Top Structures Week</div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              {topProjectedWeek
                ? `$${fmtMoney(topProjectedWeek.projectedPremium)}`
                : "$0"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {topProjectedWeek
                ? `${topProjectedWeek.year}-${String(topProjectedWeek.month).padStart(2, "0")} ${topProjectedWeek.label}`
                : "No future expirations"}
            </div>
          </div>
        </div>

        {calendar.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
            No trades found.
          </div>
        ) : (
          <div className="space-y-8">
            {calendar.map((yearBlock) => (
              <section
                key={yearBlock.year}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-100">
                    {yearBlock.year}
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <div className="flex min-w-max gap-4">
                    {yearBlock.months.map((month) => {
                      const visibleWeeks = month.weeks.filter(
                        (week) =>
                          week.tradesCount > 0 || week.projectedExpirations > 0
                      );

                      if (!visibleWeeks.length) return null;

                      return (
                        <div
                          key={`${month.year}-${month.month}`}
                          className="min-w-[320px] rounded-2xl border border-slate-800 bg-slate-900 p-4"
                        >
                          <div className="mb-3 border-b border-slate-800 pb-2">
                            <h3 className="text-lg font-semibold">
                              {month.monthLabel}
                            </h3>
                          </div>

                          <div className="space-y-2">
                            {visibleWeeks.map((week) => {
                              const isCurrentWeek = isTodayInsideWeek(
                                week.startDate,
                                week.endDate
                              );

                              return (
                                <div
                                  key={`${week.year}-${week.month}-${week.week}`}
                                  className={`rounded-xl border p-3 ${cellTone(
                                    week.realizedTotal,
                                    isCurrentWeek
                                  )}`}
                                >
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="text-sm font-semibold text-slate-200">
                                      {week.label}
                                    </div>
                                    <div
                                      className={`text-sm font-bold ${
                                        week.realizedTotal > 0
                                          ? "text-emerald-400"
                                          : week.realizedTotal < 0
                                          ? "text-rose-400"
                                          : "text-slate-300"
                                      }`}
                                    >
                                      Real: ${fmtMoney(week.realizedTotal)}
                                    </div>
                                  </div>

                                  <div className="mb-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                                    <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                      Structures Expiring
                                    </div>
                                    <div className="mt-1 flex items-center justify-between">
                                      <div className="text-sm font-semibold text-amber-300">
                                        Proj: ${fmtMoney(week.projectedPremium)}
                                      </div>
                                      <div className="text-xs text-slate-400">
                                        Total: {week.projectedExpirations}
                                      </div>
                                    </div>

                                    <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
                                      <div>IC: {week.projectedIcCount}</div>
                                      <div>PCS: {week.projectedPcsCount}</div>
                                      <div>CCS: {week.projectedCcsCount}</div>
                                      <div>CSP: {week.projectedCspCount}</div>
                                      <div>CC: {week.projectedCcCount}</div>
                                      <div>Other: {week.projectedOtherCount}</div>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
                                    <div>Trades: {week.tradesCount}</div>
                                    <div>Real Exp: {week.openExpirations}</div>
                                    <div>Wheel CSP: {week.cspCount}</div>
                                    <div>Wheel CC: {week.ccCount}</div>
                                    <div>Assigned: {week.assignedCount}</div>
                                    <div>Cap: ${fmtMoney(week.capitalApprox)}</div>
                                  </div>

                                  <div className="mt-2 text-[11px] text-slate-500">
                                    {week.startDate} → {week.endDate}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}