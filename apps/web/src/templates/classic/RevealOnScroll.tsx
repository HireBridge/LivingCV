'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Progressive-enhancement scroll reveal. Content is hidden via the `.reveal`
// class only when JS runs; a <noscript> override in the public layout forces it
// visible for no-JS visitors (and reduced-motion is handled in CSS).
export function RevealOnScroll({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = className ? `reveal ${className}` : 'reveal';
  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
