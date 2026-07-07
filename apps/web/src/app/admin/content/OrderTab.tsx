'use client';
import { useState } from 'react';

export function OrderTab({ initialOrder, slug }: { initialOrder: string[]; slug: string }) {
  // Default order if none is set
  const defaultOrder = ['hero', 'projects', 'alsoShipped', 'background'];
  const [items, setItems] = useState<string[]>(initialOrder.length > 0 ? initialOrder : defaultOrder);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: any, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: any, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const newItems = [...items];
    const item = newItems.splice(draggedIdx, 1)[0];
    newItems.splice(index, 0, item!);
    setDraggedIdx(index);
    setItems(newItems);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    setDraggedIdx(null);
  };

  return (
    <section className="admin-card">
      <h3>Homepage Section Order</h3>
      <form method="post" action="/api/admin/content/save">
        <input type="hidden" name="template_slug" value={slug} />
        <input type="hidden" name="section" value="order" />
        <input type="hidden" name="order_json" value={JSON.stringify(items)} />
        
        <p style={{ color: 'var(--ink-soft)', marginBottom: 20 }}>
          Drag and drop to rearrange the static sections on your homepage. The footer is always at the bottom.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
          {items.map((item, idx) => (
            <div
              key={item}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              onDragEnd={() => setDraggedIdx(null)}
              style={{
                padding: '12px 16px',
                background: draggedIdx === idx ? 'var(--paper)' : '#fff',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                boxShadow: draggedIdx === idx ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
                opacity: draggedIdx === idx ? 0.5 : 1,
              }}
            >
              <span style={{ marginRight: 12, color: 'var(--ink-soft)' }}>☰</span>
              <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                {item === 'alsoShipped' ? 'Smaller Tools' : item}
              </span>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: 24 }}>
          <button type="submit">Save Order</button>
        </div>
      </form>
    </section>
  );
}
