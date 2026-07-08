import type { ProjectBodyColumn } from '@livingcv/shared';

// The project `body` column is free-form JSON that has been written by several
// producers over time (the admin UI, seed scripts, and MCP clients issuing raw
// SQL). Normalize any of those shapes into the canonical `{ columns: [...] }`
// form at read time so the template always has clean data — and so data written
// with the wrong key casing (e.g. an MCP client guessing `design_decision`
// instead of `designDecision`) still renders instead of showing blank columns.

export interface NormalizedProjectBody {
  columns: ProjectBodyColumn[];
  diagramCaption?: string;
}

// Legacy fixed-trio keys → their default heading. Each entry lists every key
// spelling we've seen so both camelCase and snake_case variants are picked up.
const LEGACY_COLUMNS: { keys: string[]; heading: string }[] = [
  { keys: ['designDecision', 'design_decision'], heading: 'Design decision' },
  { keys: ['whatsReal', 'whats_real', 'whatsreal'], heading: 'What’s real' },
  { keys: ['honestConstraint', 'honest_constraint'], heading: 'Honest constraint' },
];

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function normalizeProjectBody(raw: unknown): NormalizedProjectBody {
  const obj: Record<string, unknown> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const diagramCaption = asString(obj.diagramCaption) || undefined;

  // Canonical format: { columns: [{ heading, body }, ...] }.
  if (Array.isArray(obj.columns)) {
    const columns = obj.columns
      .map((c) => {
        const cc: Record<string, unknown> =
          c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
        return { heading: asString(cc.heading), body: asString(cc.body) };
      })
      .filter((c) => c.heading.trim() !== '' || c.body.trim() !== '');
    return { columns, diagramCaption };
  }

  // Legacy fixed-trio format (tolerating snake_case variants).
  const columns: ProjectBodyColumn[] = [];
  for (const { keys, heading } of LEGACY_COLUMNS) {
    let value = '';
    for (const k of keys) {
      const v = asString(obj[k]);
      if (v.trim() !== '') {
        value = v;
        break;
      }
    }
    if (value) columns.push({ heading, body: value });
  }
  return { columns, diagramCaption };
}
