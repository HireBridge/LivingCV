import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { externalBase } from '@/lib/http';
import { decideJobOpsImportChanges } from '@/lib/jobops-import';

export async function POST(request: Request) {
  const form = await request.formData();
  const action = String(form.get('action') || '');
  const ids = form.getAll('change_id').map(String).filter(Boolean);
  if ((action !== 'approve' && action !== 'reject') || ids.length === 0) {
    return NextResponse.redirect(new URL('/admin/packet?import_error=Select at least one change.', externalBase(request)), { status: 303 });
  }
  const count = decideJobOpsImportChanges(getDb(), ids, action === 'approve' ? 'approved' : 'rejected');
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/packet');
  return NextResponse.redirect(new URL(`/admin/packet?imported=${action}&count=${count}`, externalBase(request)), { status: 303 });
}
