// ---------------------------------------------------------------------------
// Client-side persistence (localStorage) for the family vault configuration
// and the contributor registry. No backend required.
// ---------------------------------------------------------------------------

export interface VaultConfig {
  name: string;
  goalMicro: number;
  lockUntilBlock: number;
  landlordAddress: string;
  createdAt: number;
}

const CONFIG_KEY = "frv.config.v1";
const CONTRIBUTORS_KEY = "frv.contributors.v1";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / privacy errors */
  }
}

function safeDel(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// --- Config ----------------------------------------------------------------

export function loadConfig(): VaultConfig | null {
  const raw = safeGet(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultConfig;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: VaultConfig): void {
  safeSet(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  safeDel(CONFIG_KEY);
}

// --- Contributors ----------------------------------------------------------

export function loadContributors(): string[] {
  const raw = safeGet(CONTRIBUTORS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export function saveContributors(list: string[]): void {
  safeSet(CONTRIBUTORS_KEY, JSON.stringify(list));
}

export function addContributor(addr: string): string[] {
  const a = (addr || "").trim();
  if (!a) return loadContributors();
  const list = loadContributors().filter((x) => x !== a);
  list.push(a);
  saveContributors(list);
  return list;
}

export function removeContributor(addr: string): string[] {
  const list = loadContributors().filter((x) => x !== addr);
  saveContributors(list);
  return list;
}

export function clearContributors(): void {
  safeDel(CONTRIBUTORS_KEY);
}
