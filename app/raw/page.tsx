"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exec } from "../../lib/engine/types";
import { fetchTrades, deleteTradeByTradeId } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import { computeOptions, computeStocks, buildWheelContext } from "../../lib/ibkr-engine";

function money(v: number) {
  return Number(v || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function passesExpiryFilter(expiry?: string, filterValue: string = "ALL") {
  if (filterValue === "ALL") return true;

  const dte = daysUntil(expiry);

  if (filterValue === "EXPIRED") {
    return typeof dte === "number" && dte < 0;
  }

  const n = Number(filterValue);
  if (!Number.isFinite(n) || n <= 0) return true;

  return typeof dte === "number" && dte >= 0 && dte <= n;
}

function rowStrategy(exec: Exec) {
  if (exec.AssetClass === "STK") return "STOCK";
  return String(exec.Strategy || "OPT");
}

export default function RawTradesPage() {
  const router = useRouter();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [asset, setAsset] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [strategy, setStrategy] = useState("ALL");
  const [expiryFilter, setExpiryFilter] = useState("ALL");
  const [wheelTag, setWheelTag] = useState("ALL");

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

  const ctx = useMemo(() => buildWheelContext(trades), [trades]);

  const stocksModel = useMemo(
    () =>
      computeStocks(
        trades,
        "FIFO",
        ctx.assignedBuyTradeIDs,
        ctx.ccActiveUnderlyings
      ),
    [trades, ctx]
  );

  const optionsModel = useMemo(() => computeOptions(trades), [trades]);

  const stockStatusMap = useMemo(
    () => new Map(stocksModel.rows.map((r) => [r.symbol, r.status])),
    [stocksModel]
  );

  const optionStatusMap = useMemo(
    () => new Map(optionsModel.rows.map((r) => [r.conid, r.status])),
    [optionsModel]
  );

  const tradesTagged = useMemo(() => {
    return trades.map((e) => {
      let derivedWheelTag: string | null = null;

      if (e.AssetClass === "STK") {
        const tid = String(e.TradeID || "");
        if (ctx.assignedBuyTradeIDs.has(tid)) derivedWheelTag = "ASSIGNED_BUY";
        else if (ctx.assignedSellTradeIDs.has(tid)) derivedWheelTag = "ASSIGNED_SELL";
        else derivedWheelTag = "STOCK";
      } else if (e.AssetClass === "OPT") {
        const row = ctx.optionsAgg.rows.find((r) => {
          return (
            String(r.conid || "") === String(e.Conid || "") &&
            String(r.expiry || "") === String(e.Expiry || "") &&
            String(r.pc || "") === String(e.PutCall || "") &&
            Number(r.strike || 0) === Number(e.Strike || 0)
          );
        });

        if (row?.status === "EXPIRED") derivedWheelTag = "OPT_EXPIRED";
        else derivedWheelTag = e.Strategy || null;
      }

      let derivedStatus = "—";
      if (e.AssetClass === "STK") {
        derivedStatus = stockStatusMap.get(String(e.Symbol || "").toUpperCase()) || "CLOSED";
      } else if (e.AssetClass === "OPT") {
        derivedStatus = optionStatusMap.get(String(e.Conid || "")) || "CLOSED";
      }

      return {
        ...e,
        DerivedStatus: derivedStatus,
        DerivedWheelTag: derivedWheelTag,
      };
    });
  }, [trades, ctx, stockStatusMap, optionStatusMap]);

  const filteredRows = useMemo(() => {
    return tradesTagged
      .slice()
      .sort(
        (a, b) =>
          String(b.TradeDate || "").localeCompare(String(a.TradeDate || "")) ||
          String(b.TradeID || "").localeCompare(String(a.TradeID || ""))
      )
      .filter((r) => asset === "ALL" || r.AssetClass === asset)
      .filter((r) => {
        if (!query) return true;
        const q = query.toUpperCase();
        return (
          String(r.Symbol || "").toUpperCase().includes(q) ||
          String(r.UnderlyingSymbol || "").toUpperCase().includes(q) ||
          String(r.TradeID || "").toUpperCase().includes(q)
        );
      })
      .filter((r) => {
        if (status === "ALL") return true;
        return String((r as any).DerivedStatus || "") === status;
      })
      .filter((r) => {
        if (strategy === "ALL") return true;
        if (strategy === "WHEEL_STOCK") {
          return r.AssetClass === "STK" && String((r as any).DerivedWheelTag || "") === "ASSIGNED_BUY";
        }
        if (strategy === "CC_ACTIVE") {
          return (
            r.AssetClass === "STK" &&
            ctx.ccActiveUnderlyings.has(String(r.Symbol || "").toUpperCase())
          );
        }
        return rowStrategy(r) === strategy || String(r.Strategy || "") === strategy;
      })
      .filter((r) => {
        if (r.AssetClass !== "OPT") return true;
        return passesExpiryFilter(r.Expiry, expiryFilter);
      })
      .filter((r) => {
        if (wheelTag === "ALL") return true;
        return String((r as any).DerivedWheelTag || "") === wheelTag;
      });
  }, [tradesTagged, asset, query, status, strategy, expiryFilter, wheelTag, ctx]);

  async function handleDelete(tradeId: string, source?: string) {
    const isManual = String(source || "").toUpperCase() === "MANUAL";
    if (!isManual) {
      alert("Por ahora solo recomiendo borrar trades manuales desde esta vista.");
      return;
    }

    const ok = window.confirm("¿Borrar este trade manual? Esta acción no se puede deshacer.");
    if (!ok) return;

    try {
      setDeletingId(tradeId);
      await deleteTradeByTradeId(tradeId);
      await loadTrades();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error deleting trade");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        Loading raw trades...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Raw Trades / Debug</h1>
            <p className="mt-2 text-slate-400">
              Debug executions, status derivation, wheel tags and expiry behavior.
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

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          <KpiCard title="Total Execs" value={trades.length} />
          <KpiCard title="Filtered" value={filteredRows.length} />
          <KpiCard title="Open Options" value={optionsModel.rows.filter((r) => r.status === "OPEN").length} />
          <KpiCard title="Expired Options" value={optionsModel.rows.filter((r) => r.status === "EXPIRED").length} />
          <KpiCard title="Open Stocks" value={stocksModel.rows.filter((r) => r.status === "OPEN").length} />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <Field label="Search">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Symbol / Underlying / TradeID"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              />
            </Field>

            <Field label="Asset">
              <select
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="STK">STK</option>
                <option value="OPT">OPT</option>
              </select>
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
            </Field>

            <Field label="Strategy">
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="CSP">CSP</option>
                <option value="CC">CC</option>
                <option value="BTC_PUT">BTC_PUT</option>
                <option value="BTC_CALL">BTC_CALL</option>
                <option value="OPT_OTHER">OPT_OTHER</option>
                <option value="WHEEL_STOCK">WHEEL_STOCK</option>
                <option value="CC_ACTIVE">CC_ACTIVE</option>
              </select>
            </Field>

            <Field label="Expiry / DTE">
              <select
                value={expiryFilter}
                onChange={(e) => setExpiryFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="7">≤ 7 días</option>
                <option value="14">≤ 14 días</option>
                <option value="30">≤ 30 días</option>
                <option value="60">≤ 60 días</option>
                <option value="90">≤ 90 días</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </Field>

            <Field label="Wheel Tag">
              <select
                value={wheelTag}
                onChange={(e) => setWheelTag(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
              >
                <option value="ALL">All</option>
                <option value="ASSIGNED_BUY">ASSIGNED_BUY</option>
                <option value="ASSIGNED_SELL">ASSIGNED_SELL</option>
                <option value="OPT_EXPIRED">OPT_EXPIRED</option>
                <option value="STOCK">STOCK</option>
                <option value="CSP">CSP</option>
                <option value="CC">CC</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setQuery("");
                setAsset("ALL");
                setStatus("ALL");
                setStrategy("ALL");
                setExpiryFilter("ALL");
                setWheelTag("ALL");
              }}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Executions</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">TradeID</th>
                  <th className="px-3 py-2 text-left">Asset</th>
                  <th className="px-3 py-2 text-left">Symbol</th>
                  <th className="px-3 py-2 text-left">Underlying</th>
                  <th className="px-3 py-2 text-left">Buy/Sell</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Price</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">DTE</th>
                  <th className="px-3 py-2 text-left">Strike</th>
                  <th className="px-3 py-2 text-left">P/C</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">WheelTag</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Proceeds</th>
                  <th className="px-3 py-2 text-left">Comm</th>
                  <th className="px-3 py-2 text-left">Conid</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="px-3 py-6 text-center text-slate-500">
                      No executions found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r: any) => {
                    const dte = r.AssetClass === "OPT" ? daysUntil(r.Expiry) : null;
                    const isManual = String(r.Source || "").toUpperCase() === "MANUAL";

                    return (
                      <tr
                        key={`${r.TradeID}-${r.TradeDate}-${r.Symbol}`}
                        className="border-b border-slate-800"
                      >
                        <td className="px-3 py-2">{r.TradeDate || todayIso()}</td>
                        <td className="px-3 py-2">{r.TradeID}</td>
                        <td className="px-3 py-2">{r.AssetClass}</td>
                        <td className="px-3 py-2">{r.Symbol || "-"}</td>
                        <td className="px-3 py-2">{r.UnderlyingSymbol || "-"}</td>
                        <td className="px-3 py-2">{r.BuySell || "-"}</td>
                        <td className="px-3 py-2">{r.Quantity}</td>
                        <td className="px-3 py-2">${money(r.TradePrice || 0)}</td>
                        <td className="px-3 py-2">{r.Expiry || "-"}</td>
                        <td className="px-3 py-2">{typeof dte === "number" ? dte : "-"}</td>
                        <td className="px-3 py-2">{r.Strike ?? "-"}</td>
                        <td className="px-3 py-2">{r.PutCall || "-"}</td>
                        <td className="px-3 py-2">{r.DerivedStatus}</td>
                        <td className="px-3 py-2">{r.DerivedWheelTag || "-"}</td>
                        <td className="px-3 py-2">{r.Source || "-"}</td>
                        <td className="px-3 py-2">${money(r.Proceeds || 0)}</td>
                        <td className="px-3 py-2">${money(r.IBCommission || 0)}</td>
                        <td className="px-3 py-2">{r.Conid || "-"}</td>
                        <td className="px-3 py-2">
                          {isManual ? (
                            <button
                              onClick={() => handleDelete(String(r.TradeID || ""), r.Source)}
                              disabled={deletingId === r.TradeID}
                              className="rounded-lg border border-rose-700 px-3 py-1 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-50"
                            >
                              {deletingId === r.TradeID ? "Deleting..." : "Delete"}
                            </button>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-sm text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
      <div className="text-sm text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}