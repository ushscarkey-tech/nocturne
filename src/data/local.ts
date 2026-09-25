import type { NocturneData } from "@/core/types";
import type { Repository } from "./repository";

const VERSION = 1;

/** Browser storage for the demo traveller (and offline-first development). */
export class LocalRepository implements Repository {
  readonly kind = "local" as const;
  private readonly key: string;

  constructor(namespace = "demo") {
    this.key = `nocturne:v${VERSION}:${namespace}`;
  }

  async load(): Promise<NocturneData | null> {
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as NocturneData;
      return parsed && parsed.profile && Array.isArray(parsed.tasks) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(next: NocturneData): Promise<void> {
    this.write(next);
  }

  async replaceAll(next: NocturneData): Promise<void> {
    this.write(next);
  }

  clear(): void {
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      /* storage unavailable */
    }
  }

  private write(data: NocturneData) {
    try {
      window.localStorage.setItem(this.key, JSON.stringify(data));
    } catch (e) {
      throw new Error(`Could not save locally: ${(e as Error).message}`);
    }
  }
}
