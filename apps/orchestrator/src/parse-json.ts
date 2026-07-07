// Tiny JSON parser fallback for orchestrator-local content (§7). The web has
// a richer parseJson (apps/web/src/lib/parse-json.ts) but it's app-private.
export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
