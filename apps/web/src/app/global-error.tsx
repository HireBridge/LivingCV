'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ color: '#e53e3e', fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong!</h2>
          <p style={{ marginBottom: '1rem', color: '#4a5568' }}>
            A critical error occurred while rendering this page. If this persists, there may be a database connection issue.
          </p>
          <pre style={{ background: '#edf2f7', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '0.875rem' }}>
            {error.message || 'Unknown error'}
          </pre>
          <button
            onClick={() => reset()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              background: '#3182ce',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
