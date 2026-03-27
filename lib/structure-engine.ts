import type { OptionRow } from "./ibkr-engine";

export type ExpiringStructure = {
  key: string;
  underlying: string;
  expiry?: string;
  structure:
    | "IRON_CONDOR"
    | "PUT_CREDIT_SPREAD"
    | "CALL_CREDIT_SPREAD"
    | "COVERED_CALL"
    | "CASH_SECURED_PUT"
    | "OTHER";
  contracts: number;
  premium: number;
  legs: OptionRow[];
};

function byStrikeAsc(a: OptionRow, b: OptionRow) {
  return Number(a.strike || 0) - Number(b.strike || 0);
}

function takeContracts(row?: OptionRow) {
  return Math.abs(Number(row?.netQty || 0));
}

function sumPremium(rows: OptionRow[]) {
  return rows.reduce((acc, r) => acc + Number(r.cashflow || 0), 0);
}

function makeKey(underlying: string, expiry?: string) {
  return `${underlying}__${expiry || ""}`;
}

export function buildExpiringStructures(openRows: OptionRow[]): ExpiringStructure[] {
  const rows = (openRows || []).filter((r) => r.status === "OPEN" && r.expiry);

  const byGroup = new Map<string, OptionRow[]>();

  rows.forEach((r) => {
    const key = makeKey(r.underlying, r.expiry);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(r);
  });

  const out: ExpiringStructure[] = [];

  for (const [groupKey, groupRows] of byGroup.entries()) {
    const underlying = groupRows[0]?.underlying || "";
    const expiry = groupRows[0]?.expiry;

    const putsShort = groupRows
      .filter((r) => String(r.pc).toUpperCase() === "P" && Number(r.netQty) < 0)
      .sort(byStrikeAsc);

    const putsLong = groupRows
      .filter((r) => String(r.pc).toUpperCase() === "P" && Number(r.netQty) > 0)
      .sort(byStrikeAsc);

    const callsShort = groupRows
      .filter((r) => String(r.pc).toUpperCase() === "C" && Number(r.netQty) < 0)
      .sort(byStrikeAsc);

    const callsLong = groupRows
      .filter((r) => String(r.pc).toUpperCase() === "C" && Number(r.netQty) > 0)
      .sort(byStrikeAsc);

    const used = new Set<string>();

    function rowId(r: OptionRow) {
      return [
        r.underlying,
        r.expiry,
        r.pc,
        r.strike,
        r.netQty,
        r.conid,
      ].join("|");
    }

    function mark(rowsToMark: OptionRow[]) {
      rowsToMark.forEach((r) => used.add(rowId(r)));
    }

    function isUsed(r: OptionRow) {
      return used.has(rowId(r));
    }

    // 1) Iron Condor = put spread + call spread same expiry/underlying
    while (true) {
      const shortPut = putsShort.find((r) => !isUsed(r));
      const longPut = putsLong.find(
        (r) => !isUsed(r) && Number(r.strike || 0) < Number(shortPut?.strike || 0)
      );

      const shortCall = callsShort.find((r) => !isUsed(r));
      const longCall = callsLong.find(
        (r) => !isUsed(r) && Number(r.strike || 0) > Number(shortCall?.strike || 0)
      );

      if (!shortPut || !longPut || !shortCall || !longCall) break;

      const contracts = Math.min(
        takeContracts(shortPut),
        takeContracts(longPut),
        takeContracts(shortCall),
        takeContracts(longCall)
      );

      if (contracts <= 0) break;

      const legs = [shortPut, longPut, shortCall, longCall];
      mark(legs);

      out.push({
        key: `${groupKey}__IC__${out.length}`,
        underlying,
        expiry,
        structure: "IRON_CONDOR",
        contracts,
        premium: sumPremium(legs),
        legs,
      });
    }

    // 2) Put Credit Spread
    while (true) {
      const shortPut = putsShort.find((r) => !isUsed(r));
      const longPut = putsLong.find(
        (r) => !isUsed(r) && Number(r.strike || 0) < Number(shortPut?.strike || 0)
      );

      if (!shortPut || !longPut) break;

      const contracts = Math.min(takeContracts(shortPut), takeContracts(longPut));
      if (contracts <= 0) break;

      const legs = [shortPut, longPut];
      mark(legs);

      out.push({
        key: `${groupKey}__PCS__${out.length}`,
        underlying,
        expiry,
        structure: "PUT_CREDIT_SPREAD",
        contracts,
        premium: sumPremium(legs),
        legs,
      });
    }

    // 3) Call Credit Spread
    while (true) {
      const shortCall = callsShort.find((r) => !isUsed(r));
      const longCall = callsLong.find(
        (r) => !isUsed(r) && Number(r.strike || 0) > Number(shortCall?.strike || 0)
      );

      if (!shortCall || !longCall) break;

      const contracts = Math.min(takeContracts(shortCall), takeContracts(longCall));
      if (contracts <= 0) break;

      const legs = [shortCall, longCall];
      mark(legs);

      out.push({
        key: `${groupKey}__CCS__${out.length}`,
        underlying,
        expiry,
        structure: "CALL_CREDIT_SPREAD",
        contracts,
        premium: sumPremium(legs),
        legs,
      });
    }

    // 4) Remaining short puts = CSP
    putsShort.filter((r) => !isUsed(r)).forEach((r) => {
      mark([r]);
      out.push({
        key: `${groupKey}__CSP__${out.length}`,
        underlying,
        expiry,
        structure: "CASH_SECURED_PUT",
        contracts: takeContracts(r),
        premium: sumPremium([r]),
        legs: [r],
      });
    });

    // 5) Remaining short calls = CC
    callsShort.filter((r) => !isUsed(r)).forEach((r) => {
      mark([r]);
      out.push({
        key: `${groupKey}__CC__${out.length}`,
        underlying,
        expiry,
        structure: "COVERED_CALL",
        contracts: takeContracts(r),
        premium: sumPremium([r]),
        legs: [r],
      });
    });

    // 6) Anything else
    groupRows.filter((r) => !isUsed(r)).forEach((r) => {
      mark([r]);
      out.push({
        key: `${groupKey}__OTHER__${out.length}`,
        underlying,
        expiry,
        structure: "OTHER",
        contracts: takeContracts(r),
        premium: sumPremium([r]),
        legs: [r],
      });
    });
  }

  return out;
}