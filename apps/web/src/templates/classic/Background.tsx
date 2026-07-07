import type { BackgroundProps } from '@livingcv/shared';
import { RevealOnScroll } from './RevealOnScroll';

export function Background({ background }: { background: BackgroundProps }) {
  return (
    <section id="background">
      <p className="section-kicker">03 — Before this</p>
      <h2 className="section-title">{background.title}</h2>
      <div className="bg-text">
        <RevealOnScroll>
          {background.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </RevealOnScroll>
      </div>
    </section>
  );
}
