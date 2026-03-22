"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { parseIbgCsv } from "../../lib/csv";
import { fetchTrades, insertTrades } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import type { Exec } from "../../lib/engine/types";
import {
  computeOptions,
  computeStocks,
  computeCapitalSnapshot,
} from "../../lib/ibkr-engine";

function fmtMoney(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function monthKey(dateStr?: string) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const today = new Date();
  const expiry = new Date(dateStr);

  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

const PIE_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#06b6d4",
  "#a855f7",
  "#ef4444",
  "#84cc16",
  "#f97316",
];

export default function DashboardPage() {
  const router = useRouter();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  async function loadTrades() {
    try {
      setLoading(true);
      const data = await fetchTrades();
      setTrades((data || []) as Exec[]);
    } catch (err) {
      console.error(err);
      alert("Error loading trades");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTrades();
  }, []);

  async function handleCsvImport(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      alert("Please select a CSV file");
      return;
    }

    try {
      setImporting(true);

      const text = await file.text();
      const parsed = parseIbgCsv(text);

      if (!parsed.length) {
        alert("No trades found in CSV");
        return;
      }

      await insertTrades(parsed);
      await loadTrades();

      alert(`${parsed.length} trades saved`);
    } catch (err: any) {
      console.error(err);
      alert(`Error importing CSV: ${err?.message || "unknown error"}`);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  const optionsModel = useMemo(() => computeOptions(trades), [trades]);
  const stocksModel = useMemo(() => computeStocks(trades), [trades]);
  const capitalModel = useMemo(() => computeCapitalSnapshot(trades), [trades]);

  const premiumCollected = optionsModel.realizedTotal;
  const stockCapital = capitalModel.stockCapital;
  const cspCapitalAtRisk = capitalModel.cspRisk;
  const totalCapitalDeployed = capitalModel.totalCapital;

  const openShortPuts = useMemo(
    () =>
      optionsModel.rows.filter(
        (r) => r.status === "OPEN" && r.strategy === "CSP" && Number(r.netQty) < 0
      ),
    [optionsModel]
  );

  const openCoveredCalls = useMemo(
    () =>
      optionsModel.rows.filter(
        (r) => r.status === "OPEN" && r.strategy === "CC" && Number(r.netQty) < 0
      ),
    [optionsModel]
  );

  const expirationBuckets = useMemo(
    () => ({
      d7: optionsModel.rows.filter((r) => {
        if (r.status !== "OPEN" || !r.expiry) return false;
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 7;
      }).length,

      d14: optionsModel.rows.filter((r) => {
        if (r.status !== "OPEN" || !r.expiry) return false;
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 14;
      }).length,

      d30: optionsModel.rows.filter((r) => {
        if (r.status !== "OPEN" || !r.expiry) return false;
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 30;
      }).length,

      d60: optionsModel.rows.filter((r) => {
        if (r.status !== "OPEN" || !r.expiry) return false;
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 60;
      }).length,

      d90: optionsModel.rows.filter((r) => {
        if (r.status !== "OPEN" || !r.expiry) return false;
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 90;
      }).length,
    }),
    [optionsModel]
  );

  const openWheelRows = useMemo(
    () => [
      ...openShortPuts.map((r) => ({
        id: `OPT-${r.conid}-${r.expiry}-${r.strike}-${r.pc}`,
        Symbol: r.underlying,
        Type: "Cash Secured Put",
        Side: "SHORT",
        Qty: Math.abs(Number(r.netQty || 0)),
        Strike: r.strike ?? "-",
        Expiry: r.expiry ?? "-",
        PremiumOrCost: Number(r.cashflow || 0),
      })),

      ...openCoveredCalls.map((r) => ({
        id: `OPT-${r.conid}-${r.expiry}-${r.strike}-${r.pc}`,
        Symbol: r.underlying,
        Type: "Covered Call",
        Side: "SHORT",
        Qty: Math.abs(Number(r.netQty || 0)),
        Strike: r.strike ?? "-",
        Expiry: r.expiry ?? "-",
        PremiumOrCost: Number(r.cashflow || 0),
      })),

      ...stocksModel.rows
        .filter((r) => r.status === "OPEN")
        .map((r) => ({
          id: `STK-${r.symbol}`,
          Symbol: r.symbol,
          Type:
            r.wheelStage === "CC_ACTIVE"
              ? "Wheel Stock (CC Active)"
              : r.wheelStage === "WHEEL_STOCK"
              ? "Wheel Stock"
              : "Stock",
          Side: "LONG",
          Qty: Number(r.netQty || 0),
          Strike: "-",
          Expiry: "-",
          PremiumOrCost: -Math.abs(Number(r.costBasis || 0)),
        })),
    ],
    [openShortPuts, openCoveredCalls, stocksModel]
  );

  const shortPutCount = openShortPuts.length;
  const coveredCallCount = openCoveredCalls.length;

  const roiMonthly =
    totalCapitalDeployed > 0
      ? (premiumCollected / totalCapitalDeployed) * 100
      : 0;

  const premiumPerMonth = useMemo(() => {
    const map = new Map<string, number>();

    optionsModel.rows.forEach((row) => {
      if (!row.lastDate) return;
      const key = monthKey(row.lastDate);
      map.set(key, (map.get(key) || 0) + Number(row.realized || 0));
    });

    return Array.from(map.entries()).map(([month, premium]) => ({
      month,
      premium: Number(premium.toFixed(2)),
    }));
  }, [optionsModel]);

  const premiumPerTicker = useMemo(() => {
    const map = new Map<string, number>();

    optionsModel.rows.forEach((row) => {
      map.set(
        row.underlying,
        (map.get(row.underlying) || 0) + Number(row.realized || 0)
      );
    });

    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value: Number(value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [optionsModel]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
            Loading dashboard...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Bitácora Wheel Dashboard</h1>
            <p className="mt-2 text-slate-400">
              Track premium, positions, assignments, expirations, and capital used.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              {importing ? "Importing..." : "Import CSV"}
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvImport}
                className="hidden"
                disabled={importing}
              />
            </label>

            <button
              onClick={loadTrades}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>

            <a
            href="/stocks"
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
            Stocks Journal
            </a>
            
            <a
            href="/options"
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
              Options Journal
              </a>
            <a
              href="/"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Back to Landing
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Premium Collected</div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">
              ${fmtMoney(premiumCollected)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Stock Capital</div>
            <div className="mt-2 text-2xl font-bold">
              ${fmtMoney(stockCapital)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">CSP Capital at Risk</div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              ${fmtMoney(cspCapitalAtRisk)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Wheel Positions</div>
            <div className="mt-2 text-2xl font-bold">
              {openWheelRows.length}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Total Capital Deployed</div>
            <div className="mt-2 text-2xl font-bold text-indigo-400">
              ${fmtMoney(totalCapitalDeployed)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">ROI Monthly</div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              {roiMonthly.toFixed(2)}%
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Short Puts</div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              {shortPutCount}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Covered Calls</div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              {coveredCallCount}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <ExpirationCard title="7 Days" count={expirationBuckets.d7} />
          <ExpirationCard title="14 Days" count={expirationBuckets.d14} />
          <ExpirationCard title="30 Days" count={expirationBuckets.d30} />
          <ExpirationCard title="60 Days" count={expirationBuckets.d60} />
          <ExpirationCard title="90 Days" count={expirationBuckets.d90} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">Premium per Month</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={premiumPerMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="premium" name="Premium" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">Premium by Ticker</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={premiumPerTicker}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={110}
                    label
                  >
                    {premiumPerTicker.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Open Wheel Positions</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Side</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Strike</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">Premium / Cost</th>
                </tr>
              </thead>

              <tbody>
                {openWheelRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                      No open wheel positions found.
                    </td>
                  </tr>
                ) : (
                  openWheelRows.map((trade) => (
                    <tr key={trade.id} className="border-b border-slate-800">
                      <td className="px-3 py-2">{trade.Symbol}</td>
                      <td className="px-3 py-2">{trade.Type}</td>
                      <td className="px-3 py-2">{trade.Side}</td>
                      <td className="px-3 py-2">{trade.Qty}</td>
                      <td className="px-3 py-2">{trade.Strike ?? "-"}</td>
                      <td className="px-3 py-2">{trade.Expiry ?? "-"}</td>
                      <td
                        className={`px-3 py-2 ${
                          Number(trade.PremiumOrCost || 0) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        ${fmtMoney(Number(trade.PremiumOrCost || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function ExpirationCard({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
      <div className="text-sm text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-bold">{count}</div>
    </div>
  );
}