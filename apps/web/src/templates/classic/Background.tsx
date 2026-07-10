import type { BackgroundProps } from '@livingcv/shared';
import { RevealOnScroll } from './RevealOnScroll';

export function Background({
  background,
  kicker = '03 — Before this',
  title,
}: {
  background: BackgroundProps;
  kicker?: string;
  title?: string;
}) {
  return (
    <section id="background" className="p-experience">
      <p className="section-kicker">{kicker}</p>
      <h2 className="section-title p-org">{title ?? background.title}</h2>
      <div className="bg-text">
        <RevealOnScroll>
          {background.paragraphs.map((p, i) => (
            <p key={i} className="p-description">{p}</p>
          ))}
        </RevealOnScroll>
      </div>
    </section>
  );
}
