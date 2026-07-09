import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir } from './db';

const FAVICON_DIR = 'favicon';
const FAVICON_FILENAME = 'favicon';

export function getFaviconDir(): string {
  const dir = join(getDataDir(), FAVICON_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getFaviconPath(): string {
  return join(getFaviconDir(), FAVICON_FILENAME);
}

export function faviconExists(): boolean {
  return existsSync(getFaviconPath());
}

const MIME_MAP: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function getFaviconMimeType(): string {
  const dir = getFaviconDir();
  for (const ext of Object.keys(MIME_MAP) as (keyof typeof MIME_MAP)[]) {
    if (existsSync(join(dir, FAVICON_FILENAME + ext))) {
      return MIME_MAP[ext]!;
    }
  }
  return 'image/png';
}

export function getResolvedFaviconPath(): string | null {
  const dir = getFaviconDir();
  for (const ext of Object.keys(MIME_MAP) as (keyof typeof MIME_MAP)[]) {
    const path = join(dir, FAVICON_FILENAME + ext);
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

export function removeFavicon(): void {
  const dir = getFaviconDir();
  for (const ext of Object.keys(MIME_MAP) as (keyof typeof MIME_MAP)[]) {
    const path = join(dir, FAVICON_FILENAME + ext);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }
}

export function isAllowedFaviconType(mimeType: string): boolean {
  return mimeType === 'image/x-icon' ||
    mimeType === 'image/vnd.microsoft.icon' ||
    mimeType === 'image/png' ||
    mimeType === 'image/svg+xml' ||
    mimeType === 'image/jpeg' ||
    mimeType === 'image/gif' ||
    mimeType === 'image/webp';
}

export function faviconExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/x-icon': case 'image/vnd.microsoft.icon': return '.ico';
    case 'image/png': return '.png';
    case 'image/svg+xml': return '.svg';
    case 'image/jpeg': return '.jpg';
    case 'image/gif': return '.gif';
    case 'image/webp': return '.webp';
    default: return '.png';
  }
}
