import { mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from './db';

// Admin-uploaded images, served at /uploads/[name] (§9 of the design doc). The
// files live under the data dir so they persist across container restarts via
// the portfolio-data volume. The `public/` directory in this app is baked in
// at `next build` time, so runtime uploads cannot be served from there.

const UPLOADS_DIR = 'uploads';

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function getUploadsDir(): string {
  const dir = join(getDataDir(), UPLOADS_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getUploadPath(filename: string): string {
  // Guard against path traversal: only a basename is allowed.
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(getUploadsDir(), safe);
}

export function mimeForFilename(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXT_TO_MIME[ext] ?? null;
}

// Streaming write for uploads. Returns a Promise that resolves when done.
import type { Readable } from 'node:stream';
export function saveUploadStream(filename: string, stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(getUploadPath(filename));
    stream.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    stream.on('error', reject);
  });
}