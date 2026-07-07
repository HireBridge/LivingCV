import { getDb } from '@/lib/db';
import type { Db } from '@livingcv/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type RecruiterSession = { id: string; started_at: string; channel: string; work_email?: string; message_count: number; };
type ChatMessage = { id: number; role: string; content?: string; tool_name?: string; tool_args?: string; tool_result?: string; created_at: string; };

function getSessionDetails(db: Db, id: string) {
  const session = db.prepare<[string], RecruiterSession>('SELECT * FROM recruiter_sessions WHERE id = ?').get(id);
  if (!session) return null;
  
  const messages = db
    .prepare<[string], ChatMessage>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(id);
    
  return { session, messages };
}

export default async function TranscriptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const data = getSessionDetails(db, id);
  
  if (!data) return notFound();
  
  const { session, messages } = data;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin/leads" style={{ color: 'var(--ink-soft)', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Back to Leads
        </Link>
      </div>

      <h1>Session {id.slice(0, 8)}...</h1>
      
      <section className="admin-card" style={{ display: 'flex', gap: 24, fontSize: '0.9rem' }}>
        <div>
          <label style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>Started</label>
          <div>{new Date(session.started_at).toLocaleString()}</div>
        </div>
        <div>
          <label style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>Channel</label>
          <div style={{ textTransform: 'capitalize' }}>{session.channel}</div>
        </div>
        <div>
          <label style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>Email</label>
          <div>{session.work_email || <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>Anonymous</span>}</div>
        </div>
        <div>
          <label style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '0.8rem' }}>Messages</label>
          <div>{session.message_count}</div>
        </div>
      </section>

      <section className="admin-card">
        <h3>Conversation</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <div style={{
                maxWidth: '80%',
                background: m.role === 'user' ? '#1B2430' : m.role === 'assistant' ? '#F2F0EA' : '#e3f2fd',
                color: m.role === 'user' ? '#fff' : '#1B2430',
                padding: '12px 16px',
                borderRadius: '8px',
                border: m.role === 'user' ? 'none' : '1px solid var(--rule)',
                fontFamily: m.role === 'tool' ? 'monospace' : 'inherit',
                fontSize: m.role === 'tool' ? '0.85rem' : '1rem'
              }}>
                {m.role === 'tool' && (
                  <div style={{ fontWeight: 'bold', marginBottom: 4, color: 'var(--ink-soft)' }}>
                    🔧 {m.tool_name}
                  </div>
                )}
                
                {m.content && <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>}
                
                {m.tool_args && (
                  <pre style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 4, overflowX: 'auto' }}>
                    {m.tool_args}
                  </pre>
                )}
                
                {m.tool_result && m.role === 'tool' && (
                  <pre style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 4, overflowX: 'auto' }}>
                    Result: {m.tool_result.length > 500 ? m.tool_result.slice(0, 500) + '...' : m.tool_result}
                  </pre>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                {new Date(m.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>
              No messages recorded for this session.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
