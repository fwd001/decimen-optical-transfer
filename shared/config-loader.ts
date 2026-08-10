// Settings loader: reads config from localStorage (populated by the HTML inline
// script), falls back to a network fetch, then to hardcoded defaults.
//
// The HTML inline script is the primary fetch path — it runs before this module
// and is immune to service-worker module caching. If the inline script was
// blocked (old SW, CSP, network race), loadConfig() detects the empty cache and
// fetches itself as a fallback.

const STORAGE_KEY = "decimen-settings";

export interface SendConfig {
  fps: number;
  bytes: number;
  ecc: string;
  grid: number;
  size: number;
}

export interface ReceiveConfig {
  width: number;
  capfps: number;
  /** Device-specific; absent from JSON, only cached in localStorage. */
  workers?: number;
}

export interface AppConfig {
  send: SendConfig;
  receive: ReceiveConfig;
}

/** Hardcoded fallback — matches the HTML defaults. */
const FALLBACK: AppConfig = {
  send: { fps: 60, bytes: 2953, ecc: "L", grid: 1, size: 900 },
  receive: { width: 1280, capfps: 60 },
};

interface RawSection {
  [key: string]: string | number | undefined;
}
interface RawCache {
  send?: RawSection;
  receive?: RawSection;
}

function readCache(): RawCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RawCache;
  } catch {
    // corrupted cache — treat as empty
  }
  return {};
}

function pick<T extends object>(base: T, overrides: Partial<T> | undefined): T {
  if (!overrides) return base;
  const result = { ...base };
  for (const k of Object.keys(overrides) as (keyof T)[]) {
    if (overrides[k] !== undefined) (result as Record<string, unknown>)[k as string] = overrides[k];
  }
  return result;
}

function build(c: RawCache): AppConfig {
  return {
    send: pick(FALLBACK.send, c.send as Partial<SendConfig> | undefined) as SendConfig,
    receive: pick(FALLBACK.receive, c.receive as Partial<ReceiveConfig> | undefined) as ReceiveConfig,
  };
}

/** Load config from localStorage; if empty, fetch /settings.json as fallback. */
export async function loadConfig(): Promise<AppConfig> {
  const cache = readCache();
  // localStorage has data (populated by the HTML inline script) — use it.
  if (cache.send || cache.receive) return build(cache);

  // Empty cache: the inline script likely didn't run (old SW, race, etc.).
  // Fetch directly as a fallback.
  try {
    const url = location.protocol + "//" + location.host + "/settings.json";
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const d = (await res.json()) as RawCache;
      // Merge into localStorage so next page load is instant.
      const merged: RawCache = {};
      if (d.send) merged.send = { ...d.send };
      if (d.receive) merged.receive = { ...d.receive };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // quota exceeded
      }
      return build(merged);
    }
  } catch {
    // network failure — fall through to hardcoded defaults
  }
  return FALLBACK;
}

/** Persist a single setting change to localStorage. */
export function saveConfig(section: "send" | "receive", key: string, value: string | number): void {
  const cache = readCache();
  const bag: RawSection = (cache[section] ??= {});
  bag[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — silently ignore
  }
}
