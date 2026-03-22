"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import type { Exec } from "../../lib/engine/types";
import { fetchTrades } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import {
  getDashboardModel,
  monthlyIncomeStatement,
  monthlyROI,
} from "../../lib/bitacora-core";

type StockMethod = "FIFO" | "AVG";

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function monthLabelToDate(month: string) {
  const d = new Date(`${month} 1`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function filterRowsToYear<T extends { month: string }>(rows: T[], year: number) {
  return rows.filter((r) => {
    const d = monthLabelToDate(r.month);
    return d ? d.getFullYear() === year : false;
  });
}

export default function AccountingPage() {
  const router = useRouter();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<StockMethod>("FIFO");

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

  const model = useMemo(
    () => getDashboardModel(trades, { stockMethod: method }),
    [trades, method]
  );

  const incomeRows = useMemo(
    () => monthlyIncomeStatement(trades, method),
    [trades, method]
  );

  const roiRows = useMemo(
    () => monthlyROI(trades, method),
    [trades, method]
  );

  const currentYear = getCurrentYear();

  const incomeYtd = useMemo(
    () => filterRowsToYear(incomeRows, currentYear),
    [incomeRows, currentYear]
  );

  const incomePrevYtd = useMemo(
    () => filterRowsToYear(incomeRows, currentYear - 1),
    [incomeRows, currentYear]
  );

  const roiYtd = useMemo(
    () => filterRowsToYear(roiRows, currentYear),
    [roiRows, currentYear]
  );

  const ytdCurrent = useMemo(() => {
    return incomeYtd.reduce(
      (acc, r) => {
        acc.stocks += Number(r.stocks || 0);
        acc.options += Number(r.options || 0);
        acc.total += Number(r.total || 0);
        return acc;
      },
      { stocks: 0, options: 0, total: 0 }
    );
  }, [incomeYtd]);

  const ytdPrior = useMemo(() => {
    return incomePrevYtd.reduce(
      (acc, r) => {
        acc.stocks += Number(r.stocks || 0);
        acc.options += Number(r.options || 0);
        acc.total += Number(r.total || 0);
        return acc;
      },
      { stocks: 0, options: 0, total: 0 }
    );
  }, [incomePrevYtd]);

  const latestRoi = roiRows.length
    ? Number(roiRows[roiRows.length - 1]?.roi || 0)
    : 0;

  const openStockCostBasis = Number(model.capital?.stockCapital || 0);
  const cspCapital = Number(model.capital?.cspCapitalOpen || 0);
  const realizedStocks = Number(model.stocks?.totalRealized || 0);
  const realizedOptions = Number(model.options?.realizedTotal || 0);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl p-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
            Loading accounting...
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
            <h1 className="text-3xl font-bold">Accounting</h1>
            <p className="mt-2 text-slate-400">
              FIFO / AVG cost method, monthly income, ROI and YTD comparison.
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

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Stocks cost method</div>
              <div className="text-xs text-slate-400">
                FIFO = contable / AVG = visual comparativo
              </div>
            </div>

            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as StockMethod)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
            >
              <option value="FIFO">FIFO</option>
              <option value="AVG">AVG</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard title="Realized P&L Stocks" value={`$${fmtMoney(realizedStocks)}`} />
          <StatCard title="Open Stock Cost Basis" value={`$${fmtMoney(openStockCostBasis)}`} />
          <StatCard title="Realized P&L Options" value={`$${fmtMoney(realizedOptions)}`} tone="green" />
          <StatCard title="CSP Capital" value={`$${fmtMoney(cspCapital)}`} tone="amber" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard title={`${currentYear} YTD Total`} value={`$${fmtMoney(ytdCurrent.total)}`} tone="indigo" />
          <StatCard title={`${currentYear - 1} YTD Total`} value={`$${fmtMoney(ytdPrior.total)}`} />
          <StatCard title="Latest Monthly ROI" value={`${(latestRoi * 100).toFixed(2)}%`} tone="indigo" />
          <StatCard title="Method" value={method} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard title="Monthly Income Statement">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="stocks" name="Stocks" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                <Bar dataKey="options" name="Options" fill="#34d399" radius={[6, 6, 0, 0]} />
                <Bar dataKey="total" name="Total" fill="#818cf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Monthly ROI">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={roiRows.map((r) => ({
                  month: r.month,
                  roiPct: Number((Number(r.roi || 0) * 100).toFixed(2)),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="roiPct" name="ROI %" fill="#a78bfa" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TableCard title="Income Statement by Month">
            <DataTable
              headers={["Month", "Stocks", "Options", "Total"]}
              rows={incomeRows.map((r) => [
                r.month,
                `$${fmtMoney(Number(r.stocks || 0))}`,
                `$${fmtMoney(Number(r.options || 0))}`,
                `$${fmtMoney(Number(r.total || 0))}`,
              ])}
            />
          </TableCard>

          <TableCard title="ROI by Month">
            <DataTable
              headers={["Month", "Realized", "Cap Avg", "ROI %"]}
              rows={roiRows.map((r) => [
                r.month,
                `$${fmtMoney(Number((r as any).realized ?? (r as any).income ?? 0))}`,
                `$${fmtMoney(Number((r as any).capAvg ?? (r as any).capital ?? 0))}`,
                `${(
                  Number((r as any).roi || 0) * (Number((r as any).roi || 0) > 1 ? 1 : 100)
                ).toFixed(2)}%`,
              ])}
            />
          </TableCard>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TableCard title={`${currentYear} YTD Summary`}>
            <DataTable
              headers={["Category", "Value"]}
              rows={[
                ["Stocks", `$${fmtMoney(ytdCurrent.stocks)}`],
                ["Options", `$${fmtMoney(ytdCurrent.options)}`],
                ["Total", `$${fmtMoney(ytdCurrent.total)}`],
              ]}
            />
          </TableCard>

          <TableCard title={`${currentYear - 1} YTD Summary`}>
            <DataTable
              headers={["Category", "Value"]}
              rows={[
                ["Stocks", `$${fmtMoney(ytdPrior.stocks)}`],
                ["Options", `$${fmtMoney(ytdPrior.options)}`],
                ["Total", `$${fmtMoney(ytdPrior.total)}`],
              ]}
            />
          </TableCard>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string | number;
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

function TableCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-800 text-slate-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-slate-500">
                No data
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-800">
                {r.map((c, j) => (
                  <td key={`${i}-${j}`} className="px-3 py-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}