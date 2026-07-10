'use client';
import { useState } from 'react';

export function OrderTab({ initialOrder, initialHidden, customSections, slug }: { initialOrder: string[]; initialHidden: string[]; customSections: { id: string; title: string }[]; slug: string }) {
  // Default order if none is set
  const defaultOrder = ['hero', 'projects', 'alsoShipped', 'signals', 'background', 'contact'];
  
  // Ensure all custom sections are present in the list
  const baseOrder = initialOrder.length > 0 ? initialOrder : defaultOrder;
  const missingCustoms = customSections.map(c => c.id).filter(id => !baseOrder.includes(id));
  
  const [items, setItems] = useState<string[]>([...baseOrder, ...missingCustoms]);
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set(initialHidden));
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const newItems = [...items];
    const item = newItems.splice(draggedIdx, 1)[0];
    newItems.splice(index, 0, item!);
    setDraggedIdx(index);
    setItems(newItems);
  };

  const handleDrop = (e: React.DragEvent) => {
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
        
        <input type="hidden" name="hidden_json" value={JSON.stringify(Array.from(hiddenItems))} />
        
        <p style={{ color: 'var(--ink-soft)', marginBottom: 20 }}>
          Drag and drop to rearrange the static sections on your homepage. The footer is always at the bottom.
          You can also hide specific sections from being displayed.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 450 }}>
          {items.map((item, idx) => {
            const isHidden = hiddenItems.has(item);
            return (
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
                  opacity: draggedIdx === idx ? 0.5 : (isHidden ? 0.6 : 1),
                }}
              >
                <span style={{ marginRight: 12, color: 'var(--ink-soft)' }}>☰</span>
                <span style={{ fontWeight: 500, flex: 1, textDecoration: isHidden ? 'line-through' : 'none' }}>
                  {item === 'alsoShipped' ? 'Smaller Tools' : (item.startsWith('custom_') ? `Custom: ${customSections.find(c => c.id === item)?.title || item}` : item.charAt(0).toUpperCase() + item.slice(1))}
                </span>
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', marginLeft: 8 }}
                  onClick={() => {
                    const next = new Set(hiddenItems);
                    if (next.has(item)) next.delete(item);
                    else next.add(item);
                    setHiddenItems(next);
                  }}
                >
                  {isHidden ? 'Show' : 'Hide'}
                </button>
              </div>
            );
          })}
        </div>
        <div className="actions" style={{ marginTop: 24 }}>
          <button type="submit">Save Order</button>
        </div>
      </form>
    </section>
  );
}
