import { mkdirSync, createWriteStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from './db';

// Admin-uploaded resume PDF, served at /resume (§9). The file lives under the
// data dir so it persists across container restarts via the portfolio-data
// volume. The DB stores only the filename (app_settings resume.filename).

const RESUME_DIR = 'resume';

export function getResumeDir(): string {
  const dir = join(getDataDir(), RESUME_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getResumePath(filename: string): string {
  // Guard against path traversal: only a basename is allowed.
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  return join(getResumeDir(), safe);
}

export function resumeExists(filename: string): boolean {
  return existsSync(getResumePath(filename));
}

export function resumeSize(filename: string): number {
  return statSync(getResumePath(filename)).size;
}

// Streaming write for uploads. Returns a Promise that resolves when done.
import type { Readable } from 'node:stream';
export function saveResumeStream(filename: string, stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(getResumePath(filename));
    stream.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    stream.on('error', reject);
  });
}
