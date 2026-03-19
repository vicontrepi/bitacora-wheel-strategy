import { supabase } from "./supabase";
import type { Exec } from "./engine/types";

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("User not authenticated");

  return user.id;
}

function mapExecToRow(trade: Exec, userId: string) {
  return {
    user_id: userId,
    trade_id: trade.TradeID,
    trade_date: trade.TradeDate || null,
    symbol: trade.Symbol,
    asset_class: trade.AssetClass,
    buy_sell: trade.BuySell,
    quantity: trade.Quantity,
    trade_price: trade.TradePrice,
    proceeds: trade.Proceeds,
    ib_commission: trade.IBCommission,
    expiry: trade.Expiry || null,
    strike: trade.Strike ?? null,
    put_call: trade.PutCall || null,
    multiplier: trade.Multiplier ?? null,
    source: trade.Source || "CSV",
    conid: trade.Conid || null,
    underlying_symbol: trade.UnderlyingSymbol || null,
  };
}

function mapRowToExec(row: any): Exec {
  return {
    TradeID: row.trade_id || row.id,
    TradeDate: row.trade_date,
    Symbol: row.symbol,
    AssetClass: row.asset_class,
    BuySell: row.buy_sell,
    Quantity: Number(row.quantity || 0),
    TradePrice: Number(row.trade_price || 0),
    Proceeds: Number(row.proceeds || 0),
    IBCommission: Number(row.ib_commission || 0),
    Expiry: row.expiry || undefined,
    Strike: row.strike != null ? Number(row.strike) : undefined,
    PutCall: row.put_call || undefined,
    Multiplier: row.multiplier != null ? Number(row.multiplier) : undefined,
    Source: row.source || "CSV",
    Conid: row.conid || undefined,
    UnderlyingSymbol: row.underlying_symbol || undefined,
  };
}

export async function insertTrades(trades: Exec[]) {
  const userId = await getCurrentUserId();
  const rows = trades.map((trade) => mapExecToRow(trade, userId));

  const { data, error } = await supabase
    .from("trades")
    .insert(rows)
    .select();

  if (error) {
    console.error("Insert error:", error);
    throw error;
  }

  return data;
}

export async function insertTrade(trade: Exec) {
  const userId = await getCurrentUserId();
  const row = mapExecToRow(trade, userId);

  const { data, error } = await supabase
    .from("trades")
    .insert([row])
    .select()
    .single();

  if (error) {
    console.error("Insert single trade error:", error);
    throw error;
  }

  return data;
}

export async function fetchTrades(): Promise<Exec[]> {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("trade_date", { ascending: false });

  if (error) {
    console.error("Fetch error:", error);
    return [];
  }

  return (data || []).map(mapRowToExec);
}

export async function deleteAllMyTrades() {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("trades")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Delete trades error:", error);
    throw error;
  }

  return true;
}