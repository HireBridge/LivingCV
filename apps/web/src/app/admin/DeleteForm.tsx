'use client';

import { ReactNode } from 'react';

export function DeleteForm({ action, id, children }: { action: string, id: number | string, children?: ReactNode }) {
  return (
    <form
      method="post"
      action={action}
      style={{ display: 'inline' }}
      onSubmit={(e) => {
        if (!confirm('Are you sure you want to delete this item? This cannot be undone.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="_action" value="delete" />
      <input type="hidden" name="id" value={id} />
      {children || <button type="submit" className="danger">delete</button>}
    </form>
  );
}
