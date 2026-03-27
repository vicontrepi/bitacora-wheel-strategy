"use client";
export const dynamic = "force-dynamic";

import { parseIbgCsv } from "../../lib/csv";
import { insertTrades } from "../../lib/trades";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import type { Exec } from "../../lib/engine/types";
import { fetchTrades } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import { getDashboardModel, monthKey } from "../../lib/bitacora-core";

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function daysUntil(dateStr?: string) {
  if (!dateStr) return null;
  const today = new Date();
  const expiry = new Date(dateStr);
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diffMs = expiry.getTime() - today.getTime();
  return Math.ceil(diffMs / 86400000);
}

const PIE_COLORS = [
  "#818cf8",
  "#34d399",
  "#fbbf24",
  "#60a5fa",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
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
      setTrades(data || []);
    } catch (err) {
      console.error(err);
      alert("Error loading trades");
    } finally {
      setLoading(false);
    }
  }
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
  useEffect(() => {
    loadTrades();
  }, []);

  const model = useMemo(() => getDashboardModel(trades, { stockMethod: "FIFO" }), [trades]);

  const premiumCollected = Number(model.realizedPremium || 0);
  const stockCapital = Number(model.capital?.stockCapital || 0);
  const cspCapitalAtRisk = Number(model.capital?.cspCapitalOpen || 0);
  const totalCapitalDeployed = Number(model.capital?.totalCapital || 0);

  const shortPutCount = model.openShortPuts.length;
  const coveredCallCount = model.openCoveredCalls.length;

  const ironCondorsOpen = model.options.rows.filter((r) => r.status === "OPEN" && r.strategy === "IRON_CONDOR").length;

  const putCreditSpreadsOpen = model.options.rows.filter((r) => r.status === "OPEN" && r.strategy === "PUT_CREDIT_SPREAD").length;

  const callCreditSpreadsOpen = model.options.rows.filter((r) => r.status === "OPEN" && r.strategy === "CALL_CREDIT_SPREAD").length;

  const spreadMargin = Number(model.capital?.spreadMarginOpen || 0);
  const wheelCapital = Number(model.capital?.cspCapitalOpen || 0);

  const openWheelRows = useMemo(() => {
    return model.options.rows
      .filter((r) => r.status === "OPEN")
      .map((r, idx) => ({
        id: `${r.conid}-${r.expiry}-${r.strike}-${idx}`,
        Symbol: r.underlying,
        Type: r.strategy,
        Side: Number(r.netQty) < 0 ? "SHORT" : "LONG",
        Qty: Math.abs(Number(r.netQty || 0)),
        Strike: r.strike,
        Expiry: r.expiry,
        PremiumOrCost: r.cashflow || 0,
      }))
      .sort((a, b) => String(a.Expiry || "").localeCompare(String(b.Expiry || "")));
  }, [model.options]);

  const expirationBuckets = useMemo(() => {
    const openRows = model.options.rows.filter((r) => r.status === "OPEN" && r.expiry);

    const countWithin = (n: number) =>
      openRows.filter((r) => {
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= n;
      }).length;

    return {
      d7: countWithin(7),
      d14: countWithin(14),
      d30: countWithin(30),
      d60: countWithin(60),
      d90: countWithin(90),
      expired: model.options.rows.filter((r) => r.status === "EXPIRED").length,
    };
  }, [model.options]);

  const wheelStages = useMemo(() => {
    const counts = { STOCK: 0, WHEEL_STOCK: 0, CC_ACTIVE: 0 };

    model.stocks.rows
      .filter((r: any) => r.status === "OPEN")
      .forEach((r: any) => {
        if (r.wheelStage in counts) counts[r.wheelStage as keyof typeof counts] += 1;
      });

    return [
      { name: "STOCK", value: counts.STOCK },
      { name: "WHEEL_STOCK", value: counts.WHEEL_STOCK },
      { name: "CC_ACTIVE", value: counts.CC_ACTIVE },
    ];
  }, [model.stocks]);

  const incomeByMonth = useMemo(() => {
    return (model.incomeRows || []).map((r: any) => ({
      month: r.month,
      stocks: Number(r.stocks || 0),
      options: Number(r.options || 0),
      total: Number(r.total || 0),
    }));
  }, [model.incomeRows]);

  const roiByMonth = useMemo(() => {
    return (model.roiRows || []).map((r: any) => ({
      month: r.month,
      roiPct: Number((Number(r.roi || 0) * 100).toFixed(2)),
      realized: Number(r.realized || 0),
      capAvg: Number(r.capAvg || 0),
    }));
  }, [model.roiRows]);

  const capitalByTicker = useMemo(() => {
    return (model.capital?.byTickerRows || [])
      .map((r: any) => ({
        name: String(r.ticker || ""),
        value: Number(r.capital || 0),
      }))
      .slice(0, 8);
  }, [model.capital]);

  const realizedStocks = Number(model.stocks?.totalRealized || 0);
  const realizedOptions = Number(model.options?.realizedTotal || 0);
  const latestMonthlyRoi =
    roiByMonth.length > 0 ? Number(roiByMonth[roiByMonth.length - 1].roiPct || 0) : 0;

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
              Track premium, assignments, capital deployed, monthly income and wheel stages.
            </p>
          </div>
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
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadTrades}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
            
            <a
              href="/calendar"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
              Calendar
            </a>  

            <a
              href="/accounting"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Accounting
            </a>

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
              href="/ticker"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Ticker Dashboard
            </a>

            <a
              href="/raw"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Raw Trades
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
          <StatCard title="Realized P&L Stocks" value={`$${fmtMoney(realizedStocks)}`} tone="default" />
          <StatCard title="Realized P&L Options" value={`$${fmtMoney(realizedOptions)}`} tone="green" />
          <StatCard title="Open Options expiran" value={`${expirationBuckets.d7} / ${expirationBuckets.d14} / ${expirationBuckets.d30}`} subtitle="≤7d / ≤14d / ≤30d" tone="amber" />
          <StatCard title="Expired Options" value={expirationBuckets.expired} tone="default" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard title="Wheel Capital" value={`$${fmtMoney(cspCapitalAtRisk)}`} tone="amber" />
          <StatCard title="Capital Stocks (cost basis)" value={`$${fmtMoney(stockCapital)}`} tone="default" />
          <StatCard title="Capital total (aprox)" value={`$${fmtMoney(totalCapitalDeployed)}`} tone="indigo" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard title="Premium Collected" value={`$${fmtMoney(premiumCollected)}`} tone="green" />
          <StatCard title="Latest Monthly ROI" value={`${latestMonthlyRoi.toFixed(2)}%`} tone="indigo" />
          <StatCard title="Open Short Puts" value={shortPutCount} tone="amber" />
          <StatCard title="Open Covered Calls" value={coveredCallCount} tone="indigo" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard title="Wheel Capital"value={`$${fmtMoney(wheelCapital)}`}tone="amber"/>
          <StatCard title="Spread Margin"value={`$${fmtMoney(spreadMargin)}`}tone="indigo"/>
          <StatCard title="Iron Condors Open"value={ironCondorsOpen}tone="indigo"/>
          <StatCard title="Put Credit Spreads"value={putCreditSpreadsOpen}tone="green"/>
          <StatCard title="Call Credit Spreads"value={callCreditSpreadsOpen}tone="default"/>
          </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard title="Wheel % of Total"value={totalCapitalDeployed > 0? `${((wheelCapital / totalCapitalDeployed) * 100).toFixed(1)}%`: "0.0%"}tone="amber"/>
          <StatCard title="Spreads % of Total"value={totalCapitalDeployed > 0? `${((spreadMargin / totalCapitalDeployed) * 100).toFixed(1)}%`: "0.0%"}tone="indigo"/>
          <StatCard title="Wheel + Spreads"value={`$${fmtMoney(wheelCapital + spreadMargin)}`}tone="default"/>
          </div>  

          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <ExpirationCard title="7 Days" count={expirationBuckets.d7} />
          <ExpirationCard title="14 Days" count={expirationBuckets.d14} />
          <ExpirationCard title="30 Days" count={expirationBuckets.d30} />
          <ExpirationCard title="60 Days" count={expirationBuckets.d60} />
          <ExpirationCard title="90 Days" count={expirationBuckets.d90} />
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard title="Monthly Income Statement">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="stocks" name="Stocks" radius={[6, 6, 0, 0]} fill="#60a5fa" />
                <Bar dataKey="options" name="Options" radius={[6, 6, 0, 0]} fill="#34d399" />
                <Bar dataKey="total" name="Total" radius={[6, 6, 0, 0]} fill="#818cf8" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Capital by Ticker">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={capitalByTicker} dataKey="value" nameKey="name" outerRadius={110} label>
                  {capitalByTicker.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard title="Monthly ROI %">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roiByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="roiPct" name="ROI %" radius={[6, 6, 0, 0]} fill="#a78bfa" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Wheel Stages (Stocks OPEN)">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={wheelStages} dataKey="value" nameKey="name" outerRadius={110} label>
                  {wheelStages.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

<div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="mb-4 text-lg font-semibold">Open Positions by Strategy</h2>

  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="border-b border-slate-800 text-slate-400">
        <tr>
          <th className="px-3 py-2 text-left">Strategy</th>
          <th className="px-3 py-2 text-left">Open Count</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-slate-800">
          <td className="px-3 py-2">CSP</td>
          <td className="px-3 py-2">{shortPutCount}</td>
        </tr>
        <tr className="border-b border-slate-800">
          <td className="px-3 py-2">CC</td>
          <td className="px-3 py-2">{coveredCallCount}</td>
        </tr>
        <tr className="border-b border-slate-800">
          <td className="px-3 py-2">IRON_CONDOR</td>
          <td className="px-3 py-2">{ironCondorsOpen}</td>
        </tr>
        <tr className="border-b border-slate-800">
          <td className="px-3 py-2">PUT_CREDIT_SPREAD</td>
          <td className="px-3 py-2">{putCreditSpreadsOpen}</td>
        </tr>
        <tr className="border-b border-slate-800">
          <td className="px-3 py-2">CALL_CREDIT_SPREAD</td>
          <td className="px-3 py-2">{callCreditSpreadsOpen}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>ch

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

function StatCard({
  title,
  value,
  subtitle,
  tone = "default",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  tone?: "default" | "green" | "amber" | "indigo";
}) {
  const color =
    tone === "green"
      ? "text-emerald-400"
      : tone === "amber"
      ? "text-amber-300"
      : tone === "indigo"
      ? "text-indigo-400"
      : "text-slate-100";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="text-sm text-slate-400">{title}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
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

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="h-80">{children}</div>
    </div>
  );
}