import { getDb } from '@/lib/db';
import { getActiveTemplateSlug } from '@/lib/content';
import type { HeroContent, BackgroundContent, FooterContent } from '@/lib/types';
import { parseJson } from '@/lib/parse-json';

export const dynamic = 'force-dynamic';

// Raw rows from site_content for the active template (we read them directly so
// the editor shows whatever was saved, even if the structure drifted).
function rawSection(db: import('@portfolio/db').Db, slug: string, key: string): string {
  const row = db
    .prepare<[string, string], { content: string }>(
      'SELECT content FROM site_content WHERE template_slug = ? AND section_key = ?',
    )
    .get(slug, key);
  return row?.content ?? '';
}

export default async function ContentEditor() {
  const db = getDb();
  const slug = getActiveTemplateSlug(db);
  // Show what's stored, falling back to empty defaults for first-time edits.
  const hero = parseJson<HeroContent>(rawSection(db, slug, 'hero'), {
    eyebrow: '',
    name: '',
    roleLine: '',
    links: [],
  });
  const background = parseJson<BackgroundContent>(rawSection(db, slug, 'background'), {
    kicker: 'Background',
    title: 'Background',
    paragraphs: [],
  });
  const footer = parseJson<FooterContent>(rawSection(db, slug, 'footer'), {
    links: [],
    note: '',
  });
  return (
    <div>
      <h1>Content</h1>
      <p>Edit the text + links shown by the <strong>{slug}</strong> template.</p>

      <section className="admin-card">
        <h3>Hero</h3>
        <form method="post" action="/api/admin/content/save" className="row">
          <input type="hidden" name="template_slug" value={slug} />
          <input type="hidden" name="section" value="hero" />
          <div className="row">
            <label>Eyebrow</label>
            <input name="eyebrow" defaultValue={hero.eyebrow} />
          </div>
          <div className="row">
            <label>Name (h1, nav brand, project cards link)</label>
            <input name="name" defaultValue={hero.name} />
          </div>
          <div className="row">
            <label>Role line (use **double asterisks** for emphasis)</label>
            <textarea name="roleLine" defaultValue={hero.roleLine} />
          </div>
          <div className="row">
            <label>Hero links (one per line: <code>Label|https://…</code>)</label>
            <textarea
              name="hero_links"
              defaultValue={hero.links.map((l) => `${l.label}|${l.href}`).join('\n')}
              placeholder={'GitHub|https://github.com/yourhandle\nLinkedIn|https://linkedin.com/in/yourhandle'}
            />
          </div>
          <div className="row">
            <label>Hero diagram center label (optional)</label>
            <input name="diagramCenterLabel" defaultValue={hero.diagramCenterLabel ?? ''} />
          </div>
          <div className="actions">
            <button type="submit">Save hero</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>Background</h3>
        <form method="post" action="/api/admin/content/save" className="row">
          <input type="hidden" name="template_slug" value={slug} />
          <input type="hidden" name="section" value="background" />
          <div className="row">
            <label>Kicker (e.g. <code>03 — Before this</code>)</label>
            <input name="kicker" defaultValue={background.kicker} />
          </div>
          <div className="row">
            <label>Title</label>
            <input name="title" defaultValue={background.title} />
          </div>
          <div className="row">
            <label>Paragraphs (one per line)</label>
            <textarea name="paragraphs" defaultValue={background.paragraphs.join('\n\n')} />
          </div>
          <div className="actions">
            <button type="submit">Save background</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3>Footer</h3>
        <form method="post" action="/api/admin/content/save" className="row">
          <input type="hidden" name="template_slug" value={slug} />
          <input type="hidden" name="section" value="footer" />
          <div className="row">
            <label>Footer links (one per line: <code>Label|https://…</code>)</label>
            <textarea
              name="footer_links"
              defaultValue={footer.links.map((l) => `${l.label}|${l.href}`).join('\n')}
            />
          </div>
          <div className="row">
            <label>Note</label>
            <textarea name="note" defaultValue={footer.note ?? ''} />
          </div>
          <div className="actions">
            <button type="submit">Save footer</button>
          </div>
        </form>
      </section>
    </div>
  );
}
