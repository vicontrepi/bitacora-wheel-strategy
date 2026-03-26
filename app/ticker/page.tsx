"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
} from "recharts";
import type { Exec } from "../../lib/engine/types";
import { fetchTrades } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import { getTickerDashboardModel } from "../../lib/bitacora-core";

function money(v: number | null | undefined) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TickerDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState("");

  async function loadTrades() {
    try {
      setLoading(true);

      const data = await fetchTrades();
      const rows = (data || []) as Exec[];
      setTrades(rows);

      const tickers = Array.from(
        new Set(
          rows
            .map((e) =>
              String(
                e.AssetClass === "OPT"
                  ? e.UnderlyingSymbol || e.Symbol || ""
                  : e.Symbol || ""
              )
                .trim()
                .toUpperCase()
            )
            .filter((v) => !!v && v !== "USD.CAD")
        )
      ).sort();

      const tickerFromUrl = String(searchParams.get("ticker") || "")
        .trim()
        .toUpperCase();

      if (tickerFromUrl && tickers.includes(tickerFromUrl)) {
        setSelectedTicker(tickerFromUrl);
      } else if (tickers.length > 0) {
        setSelectedTicker((prev) => {
          if (prev && tickers.includes(prev)) return prev;
          return tickers[0];
        });
      }
    } catch (err) {
      console.error(err);
      alert("Error loading trades");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => {
    return getTickerDashboardModel(trades, selectedTicker || "");
  }, [trades, selectedTicker]);

  const timeline = useMemo(() => {
    return [...model.timeline].reverse();
  }, [model.timeline]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
        Loading ticker dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Ticker Dashboard</h1>
            <p className="mt-2 text-slate-400">
              Full history, break-even and wheel context by ticker.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadTrades}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>

            <a
              href="/dashboard"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Dashboard
            </a>

            <a
              href="/stocks"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Stocks
            </a>

            <a
              href="/options"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Options
            </a>

            <button
              onClick={async () => {
                await signOutUser();
                router.push("/login");
              }}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="mb-2 text-sm text-slate-400">Ticker</div>
              <select
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                {model.tickerList.map((ticker) => (
                  <option key={ticker} value={ticker}>
                    {ticker}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Trades</div>
              <div className="mt-2 text-2xl font-bold">
                {model.tickerExecs.length}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Wheel Stage</div>
              <div className="mt-2 text-2xl font-bold text-indigo-300">
                {model.wheelStage}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Shares</div>
            <div className="mt-2 text-2xl font-bold">{model.netSharesOpen}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Stock Cost</div>
            <div className="mt-2 text-2xl font-bold">
              ${money(model.stockCostBasisOpen)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Avg Cost</div>
            <div className="mt-2 text-2xl font-bold">
              ${money(model.avgCostOpen)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">BE Stock</div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              {model.breakEvenStock == null
                ? "—"
                : `$${money(model.breakEvenStock)}`}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">BE Global</div>
            <div className="mt-2 text-2xl font-bold text-emerald-300">
              {model.breakEvenGlobal == null
                ? "—"
                : `$${money(model.breakEvenGlobal)}`}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Lifetime Premium</div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              ${money(model.optionPremiumAllTime)}
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Stock Realized</div>
            <div className="mt-2 text-2xl font-bold">
              ${money(model.stockRealized)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Options Realized</div>
            <div className="mt-2 text-2xl font-bold">
              ${money(model.optionRealized)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Total Realized</div>
            <div className="mt-2 text-2xl font-bold text-emerald-300">
              ${money(model.totalRealized)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Short Puts</div>
            <div className="mt-2 text-2xl font-bold">
              {model.openShortPuts.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Covered Calls</div>
            <div className="mt-2 text-2xl font-bold">
              {model.openCoveredCalls.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Capital in Ticker</div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              ${money(model.capital.totalCapital)}
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">Premium by Month</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.premiumByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Bar dataKey="premium" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">
              Cumulative Option P&amp;L
            </h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.pnlTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="pnl"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Unified Timeline</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Asset</th>
                  <th className="px-3 py-2 text-left">Side</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Price</th>
                  <th className="px-3 py-2 text-left">Strike</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">Net Cash</th>
                  <th className="px-3 py-2 text-left">Shares Run</th>
                  <th className="px-3 py-2 text-left">Premium Run</th>
                  <th className="px-3 py-2 text-left">Tag</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/60">
                    <td className="px-3 py-2">{row.tradeDate || "-"}</td>
                    <td className="px-3 py-2">{row.event}</td>
                    <td className="px-3 py-2">{row.assetClass}</td>
                    <td className="px-3 py-2">{row.side}</td>
                    <td className="px-3 py-2">{row.quantity}</td>
                    <td className="px-3 py-2">${money(row.tradePrice)}</td>
                    <td className="px-3 py-2">
                      {row.strike == null ? "-" : row.strike}
                    </td>
                    <td className="px-3 py-2">{row.expiry || "-"}</td>
                    <td className="px-3 py-2">${money(row.netCash)}</td>
                    <td className="px-3 py-2">{row.runningShares}</td>
                    <td className="px-3 py-2">
                      ${money(row.runningOptionPremium)}
                    </td>
                    <td className="px-3 py-2">
                      {row.wheelTag || row.optionStrategy || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">Stock Ledger</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Side</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                    <th className="px-3 py-2 text-left">Price</th>
                    <th className="px-3 py-2 text-left">Net Cash</th>
                    <th className="px-3 py-2 text-left">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {model.stockExecs.map((e) => {
                    const netCash =
                      Number(e.Proceeds || 0) -
                      Math.abs(Number(e.IBCommission || 0));

                    return (
                      <tr
                        key={String(
                          e.TradeID ||
                            `${e.TradeDate}-${e.Symbol}-${e.Quantity}-${e.TradePrice}`
                        )}
                        className="border-b border-slate-800/60"
                      >
                        <td className="px-3 py-2">{e.TradeDate || "-"}</td>
                        <td className="px-3 py-2">{e.BuySell}</td>
                        <td className="px-3 py-2">{e.Quantity}</td>
                        <td className="px-3 py-2">${money(e.TradePrice)}</td>
                        <td className="px-3 py-2">${money(netCash)}</td>
                        <td className="px-3 py-2">{e.WheelTag || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">Options Ledger</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Side</th>
                    <th className="px-3 py-2 text-left">Qty</th>
                    <th className="px-3 py-2 text-left">Put/Call</th>
                    <th className="px-3 py-2 text-left">Strike</th>
                    <th className="px-3 py-2 text-left">Expiry</th>
                    <th className="px-3 py-2 text-left">Price</th>
                    <th className="px-3 py-2 text-left">Net Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {model.optionExecs.map((e) => {
                    const netCash =
                      Number(e.Proceeds || 0) -
                      Math.abs(Number(e.IBCommission || 0));

                    return (
                      <tr
                        key={String(
                          e.TradeID ||
                            `${e.TradeDate}-${e.Symbol}-${e.Quantity}-${e.Strike}-${e.Expiry}`
                        )}
                        className="border-b border-slate-800/60"
                      >
                        <td className="px-3 py-2">{e.TradeDate || "-"}</td>
                        <td className="px-3 py-2">{e.BuySell}</td>
                        <td className="px-3 py-2">{e.Quantity}</td>
                        <td className="px-3 py-2">{e.PutCall || "-"}</td>
                        <td className="px-3 py-2">
                          {e.Strike == null ? "-" : e.Strike}
                        </td>
                        <td className="px-3 py-2">{e.Expiry || "-"}</td>
                        <td className="px-3 py-2">${money(e.TradePrice)}</td>
                        <td className="px-3 py-2">${money(netCash)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}