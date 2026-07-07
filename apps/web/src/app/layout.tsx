import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Portfolio',
};

// Root HTML shell. Public pages render the active template inside <body>
// (each template emits its own <style>). Admin pages render the admin layout
// inside <body>. Google Fonts links + the no-JS reveal override live here so
// every page (template or not) gets the fonts and the progressive fallback.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
        <noscript>
          <style>{'.reveal{opacity:1 !important; transform:none !important;}'}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
