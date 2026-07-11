// Tests for the custom-theme library: save / delete routes, preset-name
// collision, invalid JSON rejection, and regression that the existing
// content/save route still works for applying a saved theme.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';
import crypto from 'node:crypto';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

let db: Db;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'admin-themes-'));
  process.env.DATA_DIR = dir;
  process.env.PORTFOLIO_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  delete (globalThis as { __portfolioDb?: Db }).__portfolioDb;
  db = openDb(join(dir, 'test.db'));
  (globalThis as { __portfolioDb?: Db }).__portfolioDb = db;
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeRequest(path: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request(`http://localhost${path}`, { method: 'POST', body: form });
}

// ── Save route ──────────────────────────────────────────────────────────────

describe('POST /api/admin/themes/save', () => {
  it('persists a new custom theme with name, description, and theme_json', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');
    const res = await POST(makeRequest('/api/admin/themes/save', {
      name: 'Neon Test',
      description: 'A bright neon theme',
      theme_json: '{"paper":"#000","ink":"#0f0","preset":"custom"}',
    }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT * FROM custom_themes WHERE name = ?').get('Neon Test') as {
      id: number; name: string; description: string; theme_json: string; created_at: string; updated_at: string;
    };
    expect(row).toBeTruthy();
    expect(row.name).toBe('Neon Test');
    expect(row.description).toBe('A bright neon theme');
    expect(row.theme_json).toBe('{"paper":"#000","ink":"#0f0","preset":"custom"}');
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  it('updates an existing custom theme by id, preserving created_at', async () => {
    // Seed an existing custom theme.
    const seedAt = new Date().toISOString();
    const r = db.prepare(
      `INSERT INTO custom_themes (name, description, theme_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('Old Name', 'Old desc', '{"ink":"#fff"}', seedAt, seedAt);
    const id = Number(r.lastInsertRowid);

    // Ensure the clock ticks so updated_at will differ.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const { POST } = await import('../src/app/api/admin/themes/save/route');
    const res = await POST(makeRequest('/api/admin/themes/save', {
      id: String(id),
      name: 'Updated Name',
      description: 'Updated desc',
      theme_json: '{"ink":"#000"}',
    }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT * FROM custom_themes WHERE id = ?').get(id) as {
      name: string; description: string; theme_json: string; created_at: string; updated_at: string;
    } | undefined;
    expect(row).toBeTruthy();
    if (!row) return;
    expect(row.name).toBe('Updated Name');
    expect(row.description).toBe('Updated desc');
    expect(row.theme_json).toBe('{"ink":"#000"}');
    // created_at must be preserved from the seed.
    expect(row.created_at).toBe(seedAt);
    // updated_at must be bumped to a strictly later timestamp.
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date(seedAt).getTime());
  });

  it('rejects duplicate names with a redirect error and does not write a second row', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');
    // Insert first.
    await POST(makeRequest('/api/admin/themes/save', {
      name: 'Only One',
      theme_json: '{}',
    }));

    const before = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };

    const res = await POST(makeRequest('/api/admin/themes/save', {
      name: 'Only One',
      theme_json: '{}',
    }));
    expect(res.status).toBe(303);

    const after = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };
    expect(after.c).toBe(before.c);
  });

  it('rejects preset-name collision (case-insensitive)', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');

    for (const badName of ['cyber', 'Classic Default', 'CYBER', 'classic default']) {
      const res = await POST(makeRequest('/api/admin/themes/save', {
        name: badName,
        theme_json: '{}',
      }));
      expect(res.status).toBe(303);
    }

    // No rows should have been created.
    const row = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };
    expect(row.c).toBe(0);
  });

  it('rejects preset-id collision (case-insensitive)', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');

    for (const badId of ['classic', 'solar', 'MINIMAL_DARK']) {
      const res = await POST(makeRequest('/api/admin/themes/save', {
        name: badId,
        theme_json: '{}',
      }));
      expect(res.status).toBe(303);
    }

    const row = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };
    expect(row.c).toBe(0);
  });

  it('rejects unparseable theme_json', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');
    const res = await POST(makeRequest('/api/admin/themes/save', {
      name: 'Broken',
      theme_json: 'not json at all',
    }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };
    expect(row.c).toBe(0);
  });

  it('rejects theme_json that is not a plain object', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');

    for (const badJson of ['[]', '"string"', '42', 'null']) {
      const res = await POST(makeRequest('/api/admin/themes/save', {
        name: `Bad ${badJson}`,
        theme_json: badJson,
      }));
      expect(res.status).toBe(303);
    }

    const row = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };
    expect(row.c).toBe(0);
  });

  it('rejects missing name', async () => {
    const { POST } = await import('../src/app/api/admin/themes/save/route');
    const res = await POST(makeRequest('/api/admin/themes/save', {
      name: '',
      theme_json: '{}',
    }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT COUNT(*) AS c FROM custom_themes').get() as { c: number };
    expect(row.c).toBe(0);
  });
});

// ── Delete route ────────────────────────────────────────────────────────────

describe('POST /api/admin/themes/delete', () => {
  it('deletes an existing custom theme', async () => {
    const now = new Date().toISOString();
    const r = db.prepare(
      `INSERT INTO custom_themes (name, description, theme_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('To Delete', '', '{}', now, now);
    const id = Number(r.lastInsertRowid);

    const { POST } = await import('../src/app/api/admin/themes/delete/route');
    const res = await POST(makeRequest('/api/admin/themes/delete', { id: String(id) }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT * FROM custom_themes WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('is a no-op (not a 500) when the id does not exist', async () => {
    const { POST } = await import('../src/app/api/admin/themes/delete/route');
    const res = await POST(makeRequest('/api/admin/themes/delete', { id: '99999' }));
    expect(res.status).toBe(303);
  });
});

// ── Regression: existing content/save still works with saved-theme JSON ─────

describe('POST /api/admin/content/save (regression)', () => {
  it('applies a saved-theme-style JSON blob without error', async () => {
    // Seed the app_settings row so setActiveTemplate doesn't crash on first read.
    db.prepare(
      `INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)`,
    ).run('site_active_template', 'classic', new Date().toISOString());

    const { POST } = await import('../src/app/api/admin/content/save/route');
    const res = await POST(makeRequest('/api/admin/content/save', {
      template_slug: 'classic',
      section: 'theme',
      theme_json: '{"preset":"saved:42","paper":"#111","ink":"#eee"}',
    }));
    expect(res.status).toBe(303);

    // The site_content row should have been written.
    const row = db
      .prepare<[string, string], { content: string }>(
        'SELECT content FROM site_content WHERE template_slug = ? AND section_key = ? ORDER BY id DESC LIMIT 1',
      )
      .get('classic', 'theme');
    expect(row).toBeTruthy();
    const stored = JSON.parse(row!.content);
    expect(stored.paper).toBe('#111');
    expect(stored.ink).toBe('#eee');
    expect(stored.preset).toBe('saved:42');
  });
});
