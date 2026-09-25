"use client";

import { create } from "zustand";
import type { NocturneData, RouteChange } from "@/core/types";
import { diffData, isEmptyChange, type Repository } from "@/data/repository";

export type SessionMode = "demo" | "cloud";

export interface Notice {
  id: number;
  headline: string;
  lines: string[];
  tone: "route" | "info" | "error";
}

interface StoreState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  mode: SessionMode | null;
  repo: Repository | null;
  data: NocturneData | null;
  notice: Notice | null;
  syncError: string | null;
  saving: boolean;
}

interface StoreActions {
  begin(mode: SessionMode, repo: Repository): void;
  ready(data: NocturneData): void;
  fail(message: string): void;
  /** Replace the dataset, persist the diff and optionally announce a route change. */
  commit(next: NocturneData, change?: RouteChange | null): void;
  replaceAll(next: NocturneData): Promise<void>;
  notify(notice: Omit<Notice, "id">): void;
  dismissNotice(): void;
  reset(): void;
}

let noticeSeq = 0;
let queue: Promise<void> = Promise.resolve();

export const useStore = create<StoreState & StoreActions>()((set, get) => ({
  status: "idle",
  error: null,
  mode: null,
  repo: null,
  data: null,
  notice: null,
  syncError: null,
  saving: false,

  begin(mode, repo) {
    set({ status: "loading", mode, repo, error: null, data: null });
  },

  ready(data) {
    set({ status: "ready", data, error: null });
  },

  fail(message) {
    set({ status: "error", error: message });
  },

  commit(next, change) {
    const { data: prev, repo } = get();
    if (!prev || prev === next) return;
    set({ data: next });
    if (change) get().notify({ headline: change.headline, lines: change.lines, tone: "route" });
    if (!repo) return;
    const changes = diffData(prev, next);
    if (isEmptyChange(changes)) return;
    set({ saving: true });
    queue = queue
      .then(() => repo.save(next, changes))
      .then(() => set({ syncError: null }))
      .catch((e: unknown) => set({ syncError: e instanceof Error ? e.message : "Changes could not be saved." }))
      .finally(() => set({ saving: false }));
  },

  async replaceAll(next) {
    const { repo } = get();
    set({ data: next });
    if (repo) await repo.replaceAll(next);
  },

  notify(notice) {
    set({ notice: { ...notice, id: ++noticeSeq } });
  },

  dismissNotice() {
    set({ notice: null });
  },

  reset() {
    set({ status: "idle", error: null, mode: null, repo: null, data: null, notice: null, syncError: null });
  },
}));

/** Selector helper for components that only render once data is loaded. */
export function useData(): NocturneData {
  const data = useStore((s) => s.data);
  if (!data) throw new Error("useData called before data was ready");
  return data;
}
