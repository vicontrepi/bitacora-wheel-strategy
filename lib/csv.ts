import type { Exec } from "./engine/types";

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (ch === "," && !insideQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((x) => String(x ?? "").trim());
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cur.trim());
      cur = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur.trim());
      cur = "";
      if (row.length > 1) rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur.trim());
  if (row.length > 1) rows.push(row);

  return rows;
}

function indexHeaders(headerRow: string[]) {
  const map: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    map[String(h || "").trim()] = i;
  });
  return map;
}

function getAny(
  ix: Record<string, number>,
  row: string[],
  names: string[]
): string | null {
  for (const n of names) {
    if (ix[n] != null) return row[ix[n]] ?? null;
  }
  return null;
}

function parseDateAny(s: unknown): string | null {
  if (s == null) return null;

  if (typeof s === "number" && Number.isFinite(s)) {
    const n = Math.trunc(s);
    const t = String(n);
    if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }

  const t0 = String(s).trim();

  if (/^\d{8}$/.test(t0)) {
    return `${t0.slice(0, 4)}-${t0.slice(4, 6)}-${t0.slice(6, 8)}`;
  }

  const m = t0.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t0)) {
    const [mm, dd, yy] = t0.split("/");
    const yyyy = yy.length === 2 ? `20${yy}` : yy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const d = new Date(t0);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

function toNum(x: unknown): number {
  if (x == null) return 0;
  const s = String(x).replace(/[$,]/g, "").trim();
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function detectCsvFormat(ix: Record<string, number>) {
  const has = (k: string) => ix[k] != null;

  const fmtA =
    has("AssetClass") &&
    has("TradeDate") &&
    (has("TradePrice") || has("Price")) &&
    (has("Proceeds") || has("Amount")) &&
    (has("IBCommission") || has("Commission"));

  const fmtB =
    (has("Asset Category") || has("AssetCategory") || has("Asset Type") || has("AssetType")) &&
    (has("Date") || has("Trade Date") || has("TradeDate")) &&
    (has("Price") || has("Trade Price") || has("TradePrice")) &&
    (has("Amount") || has("Proceeds"));

  if (fmtA) return "TRADES_EXECUTIONS";
  if (fmtB) return "ACTIVITY_TRADES";
  return "UNKNOWN_TRY";
}

function execStrategy(e: Exec & { UnderlyingSymbol?: string | null }) {
  if (e.AssetClass === "STK") return e.BuySell === "BUY" ? "STOCK_BUY" : "STOCK_SELL";
  if (e.AssetClass !== "OPT") return "OTHER";

  const pc = String(e.PutCall || "").toUpperCase();
  const side = String(e.BuySell || "").toUpperCase();

  if (side === "SELL" && pc === "P") return "CSP";
  if (side === "SELL" && pc === "C") return "CC";
  if (side === "BUY" && pc === "P") return "BTC_PUT";
  if (side === "BUY" && pc === "C") return "BTC_CALL";
  return "OPT_OTHER";
}

function rowToExecNormalized(row: string[], ix: Record<string, number>) {
  const assetRaw = getAny(ix, row, [
    "AssetClass",
    "Asset Category",
    "AssetCategory",
    "Asset Type",
    "AssetType",
  ]);
  const asset = String(assetRaw || "").trim().toUpperCase();

  let assetClass = asset;
  if (assetClass === "STOCK" || assetClass === "EQUITY") assetClass = "STK";
  if (assetClass === "OPTION" || assetClass === "OPTIONS") assetClass = "OPT";

  const symbol = String(
    getAny(ix, row, ["Symbol", "Ticker", "Contract", "Instrument", "Description Symbol"]) || ""
  )
    .trim()
    .toUpperCase();

  const underlying = String(
    getAny(ix, row, ["UnderlyingSymbol", "Underlying Symbol", "Underlying", "Underlying Ticker"]) || ""
  )
    .trim()
    .toUpperCase();

  const bs = String(
    getAny(ix, row, ["Buy/Sell", "Buy Sell", "Side", "B/S", "Action"]) || ""
  )
    .trim()
    .toUpperCase();

  const tradeDate = parseDateAny(
    getAny(ix, row, ["TradeDate", "Trade Date", "Date", "TradeDate/Time", "Date/Time"])
  );

  let qty = Math.abs(toNum(getAny(ix, row, ["Quantity", "Qty", "Units"])));
  const side = bs.includes("SELL") ? "SELL" : bs.includes("BUY") ? "BUY" : bs;
  qty = side === "SELL" ? -qty : qty;

  const price = toNum(getAny(ix, row, ["TradePrice", "Trade Price", "Price"]));
  const proceeds = toNum(getAny(ix, row, ["Proceeds", "Amount", "Net Amount", "Total"]));
  const comm = toNum(
    getAny(ix, row, ["IBCommission", "IB Commission", "Commission", "Commissions", "Comm/Fee", "Fee"])
  );

  const conid = String(getAny(ix, row, ["Conid", "Contract ID", "ContractId", "ConId"]) || "").trim();
  const tradeId = String(getAny(ix, row, ["TradeID", "Trade ID", "TradeId", "ID"]) || "").trim();

  const strike = toNum(getAny(ix, row, ["Strike", "Strike Price", "StrikePrice"]));
  const expiry = parseDateAny(
    getAny(ix, row, ["Expiry", "Expiration", "Expiration Date", "Exp Date", "ExpDate"])
  );
  const pc = String(getAny(ix, row, ["Put/Call", "Put Call", "P/C", "Right"]) || "")
    .trim()
    .toUpperCase();
  const mult = toNum(getAny(ix, row, ["Multiplier", "Mult"])) || 100;

  if (assetClass !== "STK" && assetClass !== "OPT") {
    if (expiry || strike || pc) assetClass = "OPT";
    else assetClass = "STK";
  }

  const exec: Exec & {
    UnderlyingSymbol?: string | null;
    Conid?: string | null;
    Strategy?: string | null;
    WheelTag?: string | null;
  } = {
    AssetClass: assetClass as "STK" | "OPT",
    Symbol: symbol,
    BuySell: side as "BUY" | "SELL",
    TradeDate: tradeDate || "",
    Quantity: qty,
    TradePrice: price,
    Proceeds: proceeds,
    IBCommission: comm,
    TradeID: tradeId || "",
    Strike: strike || undefined,
    Expiry: expiry || undefined,
    PutCall: (pc === "P" || pc === "C" ? pc : undefined) as "P" | "C" | undefined,
    Multiplier: mult || 100,
    Source: "CSV",
  };

  exec.UnderlyingSymbol = underlying || symbol;
  exec.Conid = conid || undefined;
  exec.Strategy = execStrategy(exec);
  exec.WheelTag = null;

  return exec;
}

export function parseIbgCsv(text: string): Exec[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];

  const header = rows[0].map((x) => String(x || "").trim());
  const ix = indexHeaders(header);
  const format = detectCsvFormat(ix);

  console.log("CSV format:", format);
  console.log("CSV headers:", header);

  const execs: Exec[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    try {
      const ex = rowToExecNormalized(r, ix);

      if (!ex.TradeDate || !ex.Symbol) continue;
      if (ex.AssetClass !== "STK" && ex.AssetClass !== "OPT") continue;

      execs.push(ex);
    } catch (err) {
      console.error("CSV row parse error:", err, r);
    }
  }

  execs.sort(
    (a, b) =>
      String(a.TradeDate || "").localeCompare(String(b.TradeDate || "")) ||
      String(a.TradeID || "").localeCompare(String(b.TradeID || ""))
  );

  console.log("Parsed execs sample:", execs.slice(0, 10));

  return execs;
}