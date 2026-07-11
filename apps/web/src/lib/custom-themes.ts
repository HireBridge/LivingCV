import type { Db } from '@livingcv/db';

export interface CustomThemeRow {
  id: number;
  name: string;
  description: string;
  theme_json: string;
  created_at: string;
  updated_at: string;
}

export function listCustomThemes(db: Db): CustomThemeRow[] {
  return db.prepare<[], CustomThemeRow>(
    'SELECT * FROM custom_themes ORDER BY name ASC',
  ).all();
}

export function getCustomThemeById(db: Db, id: number): CustomThemeRow | null {
  return db
    .prepare<[number], CustomThemeRow>('SELECT * FROM custom_themes WHERE id = ?')
    .get(id) ?? null;
}

export function upsertCustomTheme(
  db: Db,
  fields: { id?: number; name: string; description: string; theme_json: string },
): number {
  const now = new Date().toISOString();
  if (fields.id) {
    db.prepare(
      `UPDATE custom_themes SET name = ?, description = ?, theme_json = ?, updated_at = ? WHERE id = ?`,
    ).run(fields.name, fields.description, fields.theme_json, now, fields.id);
    return fields.id;
  }
  const r = db.prepare(
    `INSERT INTO custom_themes (name, description, theme_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(fields.name, fields.description, fields.theme_json, now, now);
  return Number(r.lastInsertRowid);
}

export function deleteCustomTheme(db: Db, id: number): void {
  db.prepare('DELETE FROM custom_themes WHERE id = ?').run(id);
}
