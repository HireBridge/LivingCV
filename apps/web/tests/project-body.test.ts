import { describe, it, expect } from 'vitest';
import { normalizeProjectBody } from '../src/lib/project-body';

describe('normalizeProjectBody', () => {
  it('passes through the canonical columns format', () => {
    const { columns } = normalizeProjectBody({
      columns: [
        { heading: 'A', body: 'one' },
        { heading: 'B', body: 'two' },
      ],
    });
    expect(columns).toEqual([
      { heading: 'A', body: 'one' },
      { heading: 'B', body: 'two' },
    ]);
  });

  it('folds the legacy camelCase trio into headed columns', () => {
    const { columns } = normalizeProjectBody({
      designDecision: 'dd',
      whatsReal: 'wr',
      honestConstraint: 'hc',
    });
    expect(columns).toEqual([
      { heading: 'Design decision', body: 'dd' },
      { heading: 'What’s real', body: 'wr' },
      { heading: 'Honest constraint', body: 'hc' },
    ]);
  });

  it('recovers snake_case keys written by an MCP client (the bug)', () => {
    const { columns } = normalizeProjectBody({
      designDecision: '',
      whatsReal: '',
      honestConstraint: '',
      design_decision: 'dd',
      whats_real: 'wr',
      honest_constraint: 'hc',
    });
    expect(columns.map((c) => c.body)).toEqual(['dd', 'wr', 'hc']);
  });

  it('drops empty columns and blank legacy values', () => {
    expect(normalizeProjectBody({ designDecision: '', whatsReal: '', honestConstraint: '' }).columns).toEqual([]);
    expect(
      normalizeProjectBody({ columns: [{ heading: '', body: '' }, { heading: 'X', body: 'x' }] }).columns,
    ).toEqual([{ heading: 'X', body: 'x' }]);
  });

  it('preserves diagramCaption and tolerates junk input', () => {
    expect(normalizeProjectBody({ columns: [], diagramCaption: 'cap' }).diagramCaption).toBe('cap');
    expect(normalizeProjectBody(null)).toEqual({ columns: [], diagramCaption: undefined });
    expect(normalizeProjectBody('nonsense')).toEqual({ columns: [], diagramCaption: undefined });
  });
});
