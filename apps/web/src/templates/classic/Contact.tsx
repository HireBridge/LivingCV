import type { FooterProps } from '@livingcv/shared';
import { RevealOnScroll } from './RevealOnScroll';

// Contact section — a proper in-page section that lives in the section order
// and is separately scrollable from the footer strip. The footer props (links +
// note) are reused: mailto: links become a prominent CTA, other links become
// smaller secondary actions. To show the Contact section, include 'contact' in
// the section order (admin → Order tab or SQL into site_content order row).

export function Contact({
  footer,
  kicker = 'Get in touch',
  title = 'Contact',
}: {
  footer: FooterProps;
  kicker?: string;
  title?: string;
}) {
  const emails = footer.links.filter((l) => l.href.startsWith('mailto:'));
  const others = footer.links.filter((l) => !l.href.startsWith('mailto:'));

  return (
    <section id="contact">
      <p className="section-kicker">{kicker}</p>
      <h2 className="section-title">{title}</h2>
      <RevealOnScroll>
        <div className="contact-body">
          {emails.length > 0 && (
            <div className="contact-emails">
              {emails.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="contact-email-cta u-url u-email"
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="contact-links">
              {others.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="pill u-url"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}
          {footer.note && (
            <p className="contact-note footer-note">{footer.note}</p>
          )}
        </div>
      </RevealOnScroll>
    </section>
  );
}
