import type { Exec } from "../lib/engine/types";

export const KEY_EXEC = "bitacora_exec_v2";
export const KEY_PREF = "bitacora_pref_v2";

export interface Pref {
  year?: number | "ALL";
  month?: number | "ALL";

  dateFrom?: string;
  dateTo?: string;

  status?: "ALL" | "OPEN" | "CLOSED";
  strategy?: string | "ALL";
}

export interface AppState {
  tab: "dashboard" | "raw";
  execs: Exec[];
  pref: Pref;
}

export type Action =
  | { type: "SET_TAB"; tab: AppState["tab"] }
  | { type: "SET_EXECS"; execs: Exec[] }
  | { type: "ADD_EXEC"; exec: Exec }
  | { type: "DELETE_EXEC"; tradeId: string }
  | { type: "SET_PREF"; pref: Partial<Pref> };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, tab: action.tab };

    case "SET_EXECS":
      return { ...state, execs: action.execs };

    case "ADD_EXEC":
      return { ...state, execs: [...state.execs, action.exec] };

    case "DELETE_EXEC":
      return {
        ...state,
        execs: state.execs.filter(x => x.TradeID !== action.tradeId),
      };

    case "SET_PREF":
      return {
        ...state,
        pref: { ...state.pref, ...action.pref },
      };

    default:
      return state;
  }
}