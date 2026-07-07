// Safely parse a JSON text column. Returns `fallback` on null/empty/invalid
// JSON. For a valid parse, missing fields are filled in from `fallback` via a
// shallow spread — so callers can rely on every field of the typed shape being
// present (e.g., `paragraphs` is always an array, never undefined).
export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(fallback)) {
      if (Array.isArray(parsed)) return parsed as T;
      return fallback;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...fallback, ...parsed } as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
