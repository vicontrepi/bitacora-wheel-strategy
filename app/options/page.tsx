"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Exec } from "../../lib/engine/types";
import { fetchTrades, insertTrade } from "../../lib/trades";
import { signOutUser } from "../../lib/auth";
import { computeOptions } from "../../lib/ibkr-engine";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function money(v: number) {
  return Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function makeTradeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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

type ManualForm = {
  tradeDate: string;
  symbol: string;
  assetClass: "OPT" | "STK";
  buySell: "BUY" | "SELL";
  quantity: number;
  tradePrice: number;
  commission: number;
  expiry: string;
  strike: number;
  putCall: "P" | "C";
  multiplier: number;
};

const initialForm: ManualForm = {
  tradeDate: todayIso(),
  symbol: "",
  assetClass: "OPT",
  buySell: "SELL",
  quantity: 1,
  tradePrice: 0,
  commission: 0,
  expiry: "",
  strike: 0,
  putCall: "P",
  multiplier: 100,
};

export default function OptionsPage() {
  const router = useRouter();

  const [trades, setTrades] = useState<Exec[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [strategy, setStrategy] = useState("ALL");
  const [expiryFilter, setExpiryFilter] = useState("ALL");

  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState<ManualForm>(initialForm);

  const [closeTarget, setCloseTarget] = useState<any | null>(null);
  const [closePrice, setClosePrice] = useState(0);
  const [closeCommission, setCloseCommission] = useState(0);
  const [closeDate, setCloseDate] = useState(todayIso());

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

  const optionsModel = useMemo(() => computeOptions(trades), [trades]);

  const expirationBuckets = useMemo(() => {
    const openRows = optionsModel.rows.filter((r) => r.status === "OPEN" && r.expiry);

    return {
      d7: openRows.filter((r) => {
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 7;
      }).length,
      d14: openRows.filter((r) => {
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 14;
      }).length,
      d30: openRows.filter((r) => {
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 30;
      }).length,
      d60: openRows.filter((r) => {
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 60;
      }).length,
      d90: openRows.filter((r) => {
        const d = daysUntil(r.expiry);
        return typeof d === "number" && d >= 0 && d <= 90;
      }).length,
    };
  }, [optionsModel]);

  const filteredOptions = useMemo(() => {
    return [...optionsModel.rows]
      .filter((row) => {
        const matchesSearch =
          !search ||
          row.underlying.toLowerCase().includes(search.toLowerCase());

        const matchesStatus = status === "ALL" || row.status === status;
        const matchesStrategy = strategy === "ALL" || row.strategy === strategy;
        const matchesExpiry = passesExpiryFilter(row.expiry, expiryFilter);

        return (
          matchesSearch &&
          matchesStatus &&
          matchesStrategy &&
          matchesExpiry
        );
      })
      .sort((a, b) => {
        const aIsOpen = a.status === "OPEN" ? 0 : 1;
        const bIsOpen = b.status === "OPEN" ? 0 : 1;
        if (aIsOpen !== bIsOpen) return aIsOpen - bIsOpen;

        const aDte = daysUntil(a.expiry);
        const bDte = daysUntil(b.expiry);

        if (aDte == null && bDte == null) return 0;
        if (aDte == null) return 1;
        if (bDte == null) return -1;

        return aDte - bDte;
      });
  }, [optionsModel, search, status, strategy, expiryFilter]);

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

  async function handleSaveManualTrade() {
    try {
      const qtyAbs = Math.abs(Number(manualForm.quantity || 0));
      const signedQty = manualForm.buySell === "SELL" ? -qtyAbs : qtyAbs;
      const gross =
        qtyAbs *
        Number(manualForm.tradePrice || 0) *
        Number(manualForm.multiplier || 100);
      const proceeds = manualForm.buySell === "SELL" ? gross : -gross;

      const trade: Exec = {
        TradeID: makeTradeId("MANUAL"),
        TradeDate: manualForm.tradeDate,
        Symbol: manualForm.symbol.trim().toUpperCase(),
        AssetClass: manualForm.assetClass,
        BuySell: manualForm.buySell,
        Quantity: signedQty,
        TradePrice: Number(manualForm.tradePrice || 0),
        Proceeds: proceeds,
        IBCommission: Number(manualForm.commission || 0),
        Expiry:
          manualForm.assetClass === "OPT" ? manualForm.expiry : undefined,
        Strike:
          manualForm.assetClass === "OPT"
            ? Number(manualForm.strike || 0)
            : undefined,
        PutCall:
          manualForm.assetClass === "OPT" ? manualForm.putCall : undefined,
        Multiplier:
          manualForm.assetClass === "OPT"
            ? Number(manualForm.multiplier || 100)
            : undefined,
        Source: "MANUAL",
        UnderlyingSymbol: manualForm.symbol.trim().toUpperCase(),
      };

      await insertTrade(trade);
      setShowManual(false);
      setManualForm(initialForm);
      await loadTrades();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error saving manual trade");
    }
  }

  function openCloseModal(row: any) {
    setCloseTarget(row);
    setClosePrice(0);
    setCloseCommission(0);
    setCloseDate(todayIso());
  }

  async function handleCloseTrade() {
    if (!closeTarget) return;

    try {
      const qtyAbs = Math.abs(Number(closeTarget.netQty || 0));
      const closingSide = Number(closeTarget.netQty || 0) < 0 ? "BUY" : "SELL";
      const signedQty = closingSide === "SELL" ? -qtyAbs : qtyAbs;
      const gross =
        qtyAbs *
        Number(closePrice || 0) *
        Number(closeTarget.multiplier || 100);
      const proceeds = closingSide === "SELL" ? gross : -gross;

      const trade: Exec = {
        TradeID: makeTradeId("CLOSE"),
        TradeDate: closeDate,
        Symbol: String(closeTarget.underlying || "").toUpperCase(),
        AssetClass: "OPT",
        BuySell: closingSide as "BUY" | "SELL",
        Quantity: signedQty,
        TradePrice: Number(closePrice || 0),
        Proceeds: proceeds,
        IBCommission: Number(closeCommission || 0),
        Expiry: closeTarget.expiry || undefined,
        Strike: closeTarget.strike ?? undefined,
        PutCall: closeTarget.pc || undefined,
        Multiplier: Number(closeTarget.multiplier || 100),
        Source: "MANUAL",
        Conid: closeTarget.conid || undefined,
        UnderlyingSymbol: String(closeTarget.underlying || "").toUpperCase(),
      };

      await insertTrade(trade);
      setCloseTarget(null);
      await loadTrades();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Error closing trade");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
        Loading options...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Options Journal</h1>
            <p className="mt-2 text-slate-400">
              Open, closed and expired options with filters by strategy and DTE.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowManual(true)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              + Manual Trade
            </button>

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
          <KpiCard title="≤ 7 Days" value={expirationBuckets.d7} />
          <KpiCard title="≤ 14 Days" value={expirationBuckets.d14} />
          <KpiCard title="≤ 30 Days" value={expirationBuckets.d30} />
          <KpiCard title="≤ 60 Days" value={expirationBuckets.d60} />
          <KpiCard title="≤ 90 Days" value={expirationBuckets.d90} />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard title="Open Short Puts" value={openShortPuts.length} tone="amber" />
          <KpiCard title="Open Covered Calls" value={openCoveredCalls.length} tone="indigo" />
          <KpiCard title="Expired Contracts" value={optionsModel.rows.filter((r) => r.status === "EXPIRED").length} />
          <KpiCard title="Filtered Rows" value={filteredOptions.length} />
        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div>
              <div className="mb-2 text-sm text-slate-400">Search</div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Underlying..."
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
                <option value="EXPIRED">EXPIRED</option>
              </select>
            </div>

            <div>
              <div className="mb-2 text-sm text-slate-400">Strategy</div>
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
              </select>
            </div>

            <div>
              <div className="mb-2 text-sm text-slate-400">Expiry / DTE</div>
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
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearch("");
                  setStatus("ALL");
                  setStrategy("ALL");
                  setExpiryFilter("ALL");
                }}
                className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">Options (by Conid)</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Underlying</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">DTE</th>
                  <th className="px-3 py-2 text-left">P/C</th>
                  <th className="px-3 py-2 text-left">Strike</th>
                  <th className="px-3 py-2 text-left">BE</th>
                  <th className="px-3 py-2 text-left">BE Low</th>
                  <th className="px-3 py-2 text-left">BE High</th>
                  <th className="px-3 py-2 text-left">Premium/Share</th> 
                  <th className="px-3 py-2 text-left">Mult</th>
                  <th className="px-3 py-2 text-left">Strategy</th>
                  <th className="px-3 py-2 text-left">netQty</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Cashflow</th>
                  <th className="px-3 py-2 text-left">Realized</th>
                  <th className="px-3 py-2 text-left">Conid</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredOptions.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-3 py-6 text-center text-slate-500">
                      No options found.
                    </td>
                  </tr>
                ) : (
                  filteredOptions.map((row) => {
                    const dte = daysUntil(row.expiry);

                    return (
                      <tr
                        key={`${row.conid}-${row.expiry}-${row.strike}-${row.pc}`}
                        className="border-b border-slate-800"
                      >
                        <td className="px-3 py-2">{row.underlying}</td>
                        <td className="px-3 py-2">{row.expiry || "-"}</td>
                        <td className="px-3 py-2">{typeof dte === "number" ? dte : "-"}</td>
                        <td className="px-3 py-2">{row.pc || "-"}</td>
                        <td className="px-3 py-2">{row.strike ?? "-"}</td>
                        <td className="px-3 py-2">{row.breakEven != null ? `$${money(Number(row.breakEven || 0))}` : "-"}</td>
                        <td className="px-3 py-2">{row.premiumPerShare != null? `$${money(Number(row.premiumPerShare || 0))}`: "-"}</td>  
                        <td className="px-3 py-2">{row.structureBreakEvenLow != null? `$${money(Number(row.structureBreakEvenLow || 0))}`: "-"}</td>
                        <td className="px-3 py-2">{row.structureBreakEvenHigh != null? `$${money(Number(row.structureBreakEvenHigh || 0))}`: "-"}</td>    
                        <td className="px-3 py-2">{row.multiplier}</td>
                        <td className="px-3 py-2">{row.strategy}</td>
                        <td className="px-3 py-2">{row.netQty}</td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2">
                          ${money(Number(row.cashflow || 0))}
                        </td>
                        <td className="px-3 py-2">
                          ${money(Number(row.realized || 0))}
                        </td>
                        <td className="px-3 py-2">{row.conid || "-"}</td>
                        <td className="px-3 py-2">
                          {row.status === "OPEN" ? (
                            <button
                              onClick={() => openCloseModal(row)}
                              className="rounded-lg border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
                            >
                              Close
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

        {showManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-semibold">Manual Trade</h3>
                <button
                  onClick={() => setShowManual(false)}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Trade Date">
                  <input
                    type="date"
                    value={manualForm.tradeDate}
                    onChange={(e) =>
                      setManualForm({ ...manualForm, tradeDate: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Symbol">
                  <input
                    value={manualForm.symbol}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        symbol: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Asset">
                  <select
                    value={manualForm.assetClass}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        assetClass: e.target.value as "OPT" | "STK",
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  >
                    <option value="OPT">OPT</option>
                    <option value="STK">STK</option>
                  </select>
                </Field>

                <Field label="Buy/Sell">
                  <select
                    value={manualForm.buySell}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        buySell: e.target.value as "BUY" | "SELL",
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </Field>

                <Field label="Quantity">
                  <input
                    type="number"
                    value={manualForm.quantity}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        quantity: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Trade Price">
                  <input
                    type="number"
                    step="0.01"
                    value={manualForm.tradePrice}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        tradePrice: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Commission">
                  <input
                    type="number"
                    step="0.01"
                    value={manualForm.commission}
                    onChange={(e) =>
                      setManualForm({
                        ...manualForm,
                        commission: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                {manualForm.assetClass === "OPT" && (
                  <>
                    <Field label="Expiry">
                      <input
                        type="date"
                        value={manualForm.expiry}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            expiry: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                      />
                    </Field>

                    <Field label="Strike">
                      <input
                        type="number"
                        step="0.01"
                        value={manualForm.strike}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            strike: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                      />
                    </Field>

                    <Field label="P/C">
                      <select
                        value={manualForm.putCall}
                        onChange={(e) =>
                          setManualForm({
                            ...manualForm,
                            putCall: e.target.value as "P" | "C",
                          })
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                      >
                        <option value="P">P</option>
                        <option value="C">C</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowManual(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveManualTrade}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Save Trade
                </button>
              </div>
            </div>
          </div>
        )}

        {closeTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-semibold">
                  Close {closeTarget.underlying} {closeTarget.pc} {closeTarget.strike}
                </h3>
                <button
                  onClick={() => setCloseTarget(null)}
                  className="rounded-lg border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Close Date">
                  <input
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Close Price">
                  <input
                    type="number"
                    step="0.01"
                    value={closePrice}
                    onChange={(e) => setClosePrice(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>

                <Field label="Commission">
                  <input
                    type="number"
                    step="0.01"
                    value={closeCommission}
                    onChange={(e) => setCloseCommission(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
                  />
                </Field>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setCloseTarget(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
                >
                  Cancel
                </button>

                <button
                  onClick={handleCloseTrade}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Confirm Close
                </button>
              </div>
            </div>
          </div>
        )}
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
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "amber" | "indigo";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "indigo"
      ? "text-indigo-300"
      : "text-slate-100";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
      <div className="text-sm text-slate-400">{title}</div>
      <div className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}