import type { FooterProps } from '@livingcv/shared';

export function Footer({ footer }: { footer: FooterProps }) {
  return (
    <footer className="wrap p-contact" id="contact">
      {footer.links.length > 0 ? (
        <div className="footer-links">
          {footer.links.map((l) => (
            <a key={l.href} className={l.href.startsWith('mailto:') ? 'u-url u-email' : 'u-url'} href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </div>
      ) : null}
      {footer.note ? <p className="footer-note">{footer.note}</p> : null}
    </footer>
  );
}
