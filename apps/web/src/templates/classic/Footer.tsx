import type { FooterProps } from '@livingcv/shared';

export function Footer({ footer }: { footer: FooterProps }) {
  if (!footer.note) return null;
  return (
    <footer className="wrap p-contact" id="footer">
      <p className="footer-note">{footer.note}</p>
    </footer>
  );
}
