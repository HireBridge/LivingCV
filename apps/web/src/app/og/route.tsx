import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title')?.slice(0, 100);
    const kind = searchParams.get('kind'); // 'blog' | 'case-study'

    const db = getDb();
    const s = getAllSettings(db);
    const siteTitle = s['site.title'] || 'Portfolio';

    const paper = s['theme.paper'] || '#F2F0EA';
    const ink = s['theme.ink'] || '#1B2430';
    const signal = s['theme.signal'] || '#2F6F5E';
    const rust = s['theme.rust'] || '#9C5333';

    const displayTitle = title || siteTitle;
    const isRoot = !title || title === siteTitle;

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: paper,
            color: ink,
            padding: '80px',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Top section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 'bold',
                  letterSpacing: '-0.02em',
                  color: signal,
                  textTransform: 'uppercase',
                }}
              >
                {isRoot ? 'Portfolio' : kind === 'blog' ? 'Blog Post' : kind === 'case-study' ? 'Case Study' : siteTitle}
              </div>
            </div>
          </div>

          {/* Middle section (Title) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: isRoot ? '120px' : '84px',
                fontWeight: 'bold',
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                marginBottom: '20px',
              }}
            >
              {displayTitle}
            </div>
          </div>

          {/* Bottom section */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              borderTop: `4px solid ${rust}`,
              paddingTop: '40px',
            }}
          >
            <div style={{ fontSize: '36px', fontWeight: 600 }}>
              {siteTitle}
            </div>
            {s['site.domain'] && (
              <div style={{ fontSize: '36px', color: rust }}>
                {s['site.domain']}
              </div>
            )}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch {
    return new Response(`Failed to generate image`, {
      status: 500,
    });
  }
}
