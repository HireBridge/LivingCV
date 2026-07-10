import { NextResponse } from 'next/server';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { getUploadPath, mimeForFilename } from '@/lib/uploads';

// Serves uploaded images at /uploads/[name]. Filenames are sanitized at write
// time and re-checked here; any name containing '/' or '..' is refused to
// block path traversal. Content-Type comes from an extension whitelist; any
// non-image extension returns 404.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!name || name.includes('/') || name.includes('..') || name.includes('\\')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const mime = mimeForFilename(name);
  if (!mime) {
    return new NextResponse('Not found', { status: 404 });
  }

  const path = getUploadPath(name);
  try {
    statSync(path);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const nodeStream = createReadStream(path);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(webStream, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}