"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exec } from "../../lib/engine/types";
import { fetchTrades } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import { buildWheelContext, computeStocks } from "../../lib/ibkr-engine";

function money(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function StocksPage() {
  const router = useRouter();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [stage, setStage] = useState("ALL");

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

  useEffect(() => {
    loadTrades();
  }, []);

  const wheelCtx = useMemo(() => buildWheelContext(trades), [trades]);

  const stocksModel = useMemo(() => {
    return computeStocks(
      trades,
      "FIFO",
      wheelCtx.assignedBuyTradeIDs,
      wheelCtx.ccActiveUnderlyings
    );
  }, [trades, wheelCtx]);

  const filteredStocks = useMemo(() => {
    return stocksModel.rows.filter((row) => {
      const matchesSearch =
        !search || row.symbol.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        status === "ALL" || row.status === status;

      const matchesStage =
        stage === "ALL" || row.wheelStage === stage;

      return matchesSearch && matchesStatus && matchesStage;
    });
  }, [stocksModel, search, status, stage]);

  const openStocks = filteredStocks.filter((r) => r.status === "OPEN");
  const totalOpenStockCapital = openStocks.reduce(
    (acc, row) => acc + Number(row.costBasis || 0),
    0
  );

  const stageCounts = {
    STOCK: filteredStocks.filter((r) => r.wheelStage === "STOCK").length,
    WHEEL_STOCK: filteredStocks.filter((r) => r.wheelStage === "WHEEL_STOCK").length,
    CC_ACTIVE: filteredStocks.filter((r) => r.wheelStage === "CC_ACTIVE").length,
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
        Loading stocks...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Stocks Journal</h1>
            <p className="mt-2 text-slate-400">
              Open stock positions, wheel stage, and capital deployed.
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
              Back to Dashboard
            </a>

            <a
              href="/options"
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Options Journal
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

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Stock Positions</div>
            <div className="mt-2 text-2xl font-bold">{openStocks.length}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Open Stock Capital</div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              ${money(totalOpenStockCapital)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">Wheel Stock</div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              {stageCounts.WHEEL_STOCK}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="text-sm text-slate-400">CC Active</div>
            <div className="mt-2 text-2xl font-bold text-emerald-300">
              {stageCounts.CC_ACTIVE}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <div className="mb-2 text-sm text-slate-400">Search</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ticker..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              />
            </div>

            <div>
              <div className="mb-2 text-sm text-slate-400">Status</div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            <div>
              <div className="mb-2 text-sm text-slate-400">Wheel Stage</div>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="STOCK">STOCK</option>
                <option value="WHEEL_STOCK">WHEEL_STOCK</option>
                <option value="CC_ACTIVE">CC_ACTIVE</option>
              </select>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="text-sm text-slate-400">Rows</div>
              <div className="mt-2 text-2xl font-bold">{filteredStocks.length}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Stocks</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">netQty</th>
                  <th className="px-3 py-2 text-left">Cost Basis</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Wheel Stage</th>
                  <th className="px-3 py-2 text-left">Last Date</th>
                </tr>
              </thead>

              <tbody>
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      No stocks found.
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map((row) => (
                    <tr key={row.symbol} className="border-b border-slate-800">
                      <td className="px-3 py-2">{row.symbol}</td>
                      <td className="px-3 py-2">{row.netQty}</td>
                      <td className="px-3 py-2">${money(Number(row.costBasis || 0))}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            row.wheelStage === "CC_ACTIVE"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : row.wheelStage === "WHEEL_STOCK"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {row.wheelStage}
                        </span>
                      </td>
                      <td className="px-3 py-2">{row.lastDate || "-"}</td>
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