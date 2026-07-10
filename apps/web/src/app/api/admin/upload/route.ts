import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { saveUploadStream } from '@/lib/uploads';

const MAX_BYTES = 8 * 1024 * 1024;

// Streams an admin image upload to <DATA_DIR>/uploads/<sanitized filename>.
// Responds with the same { success, url } shape the old implementation used,
// so ImageUploader keeps working unchanged.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Malformed form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
  }

  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return NextResponse.json(
      { success: false, error: 'Only raster image uploads are allowed (svg is rejected)' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: 'File exceeds 8 MB limit' }, { status: 400 });
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  if (!safeName || safeName === '-') {
    return NextResponse.json({ success: false, error: 'Invalid filename' }, { status: 400 });
  }

  const webStream = file.stream();
  const nodeReadable = Readable.fromWeb(
    webStream as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
  );
  await saveUploadStream(safeName, nodeReadable);

  return NextResponse.json({ success: true, url: `/uploads/${safeName}` });
}