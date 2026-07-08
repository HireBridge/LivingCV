'use client';

import { useState } from 'react';

interface Column {
  heading: string;
  body: string;
}

// Repeatable editor for a project's body columns. Each column has a custom
// heading + text; admins can add/remove/reorder-by-removing as many as they
// like. Serializes to the canonical `{ columns: [...] }` JSON in a hidden
// `body` input so the existing form POST keeps working. `diagramCaption` (which
// also lives inside the body JSON) is carried through untouched.
export function ProjectBodyEditor({
  initialColumns,
  diagramCaption,
}: {
  initialColumns: Column[];
  diagramCaption?: string;
}) {
  const [columns, setColumns] = useState<Column[]>(
    initialColumns.length ? initialColumns : [{ heading: '', body: '' }],
  );

  const update = (i: number, patch: Partial<Column>) =>
    setColumns((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const add = () => setColumns((cs) => [...cs, { heading: '', body: '' }]);
  const remove = (i: number) => setColumns((cs) => cs.filter((_, idx) => idx !== i));

  const serialized = JSON.stringify({
    columns: columns.filter((c) => c.heading.trim() !== '' || c.body.trim() !== ''),
    ...(diagramCaption ? { diagramCaption } : {}),
  });

  return (
    <div className="row">
      <label>Body columns</label>
      <details className="field-help" style={{ marginBottom: 12 }}>
        <summary>How to use this</summary>
        <div className="field-help-body">
          <p>
            This is the multi-column block in the middle of the project card (the
            old fixed &ldquo;Design decision / What&rsquo;s real / Honest
            constraint&rdquo; row). Each column now has its <strong>own heading</strong>
            {' '}that you type — use any labels you like.
          </p>
          <p>
            Up to <strong>three columns sit on one row</strong>; a fourth or more
            wraps onto the next row, each keeping its heading with its text. Leave
            the list empty to hide this block on the card entirely.
          </p>
        </div>
      </details>
      <input type="hidden" name="body" value={serialized} />

      {columns.map((col, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--rule)',
            borderRadius: 6,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <input
              placeholder="Heading (e.g. Design decision)"
              value={col.heading}
              onChange={(e) => update(i, { heading: e.target.value })}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="secondary"
              onClick={() => remove(i)}
              aria-label={`Remove column ${i + 1}`}
            >
              Remove
            </button>
          </div>
          <textarea
            placeholder="Column text"
            value={col.body}
            onChange={(e) => update(i, { body: e.target.value })}
            rows={3}
          />
        </div>
      ))}

      <button type="button" className="secondary" onClick={add}>
        + Add column
      </button>
    </div>
  );
}
