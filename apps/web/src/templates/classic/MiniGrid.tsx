import type { MiniProjectProps } from '@mohith-das/portfolio-shared';
import { RevealOnScroll } from './RevealOnScroll';

export function MiniGrid({ items }: { items: MiniProjectProps[] }) {
  if (items.length === 0) return null;
  return (
    <RevealOnScroll>
      <div className="mini-grid">
        {items.map((m) => (
          <div className="mini-card" key={m.slug}>
            <h4>{m.name}</h4>
            <p>{m.description}</p>
          </div>
        ))}
      </div>
    </RevealOnScroll>
  );
}
