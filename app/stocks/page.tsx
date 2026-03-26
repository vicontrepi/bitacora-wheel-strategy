"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exec } from "../../lib/engine/types";
import { fetchTrades } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import { computeStocks, computeOptions } from "../../lib/ibkr-engine";

function money(v: number) {
  return Number(v || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export default function StocksPage() {
  const router = useRouter();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [stage, setStage] = useState("ALL");

  async function loadTrades() {
    setLoading(true);
    const data = await fetchTrades();
    setTrades(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadTrades();
  }, []);

  const optionsModel = useMemo(() => computeOptions(trades), [trades]);

  const ccActiveUnderlyings = useMemo(() => {
    return new Set(
      optionsModel.rows
        .filter((r) => r.status === "OPEN" && r.strategy === "CC")
        .map((r) => r.underlying)
    );
  }, [optionsModel]);

  const stocksModel = useMemo(
    () =>
      computeStocks(
        trades,
        "FIFO",
        new Set(), // ya viene integrado por core
        ccActiveUnderlyings
      ),
    [trades, ccActiveUnderlyings]
  );

  const filtered = useMemo(() => {
    return stocksModel.rows.filter((r) => {
      const matchesSearch =
        !search ||
        r.symbol.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = status === "ALL" || r.status === status;
      const matchesStage = stage === "ALL" || r.wheelStage === stage;

      return matchesSearch && matchesStatus && matchesStage;
    });
  }, [stocksModel, search, status, stage]);

  if (loading) {
    return <div className="p-6 text-white">Loading stocks...</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">

        {/* HEADER */}
        <div className="mb-6 flex justify-between">
          <h1 className="text-3xl font-bold">Stocks</h1>

          <div className="flex gap-3">
            <a href="/dashboard" className="btn">Dashboard</a>
            <button
              onClick={async () => {
                await signOutUser();
                router.push("/login");
              }}
              className="btn">Logout
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Kpi title="Total Positions" value={stocksModel.rows.length} />
          <Kpi title="Open Positions" value={stocksModel.rows.filter(r => r.status==="OPEN").length} />
          <Kpi title="Realized PnL" value={`$${money(stocksModel.totalRealized)}`} />
          <Kpi title="Capital Deployed" value={`$${money(stocksModel.stockCapital)}`} />
        </div>

        {/* FILTERS */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input"
          >
            <option value="ALL">All</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="input"
          >
            <option value="ALL">All</option>
            <option value="STOCK">Stock</option>
            <option value="WHEEL_STOCK">Wheel Stock</option>
            <option value="CC_ACTIVE">CC Active</option>
          </select>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Avg Cost</th>
                <th>Cost Basis</th>
                <th>Realized</th>
                <th>Stage</th>
                <th>Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={r.symbol} className="border-b border-slate-800">
                  <td>{r.symbol}</td>
                  <td>{r.netQty}</td>
                  <td>${money(r.avgCost)}</td>
                  <td>${money(r.costBasis)}</td>
                  <td className={r.realized >= 0 ? "text-green-400" : "text-red-400"}>
                    ${money(r.realized)}
                  </td>
                  <td>{r.wheelStage}</td>
                  <td>{r.status}</td>
                  <td className="px-3 py-2"><a href={`/ticker?ticker=$ {row.symbol}`} className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"> Open
                  </a> </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </main>
  );
}

function Kpi({ title, value }: { title: string; value: any }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-center">
      <div className="text-sm text-slate-400">{title}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}