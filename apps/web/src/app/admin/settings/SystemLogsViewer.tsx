'use client';
import { useState, useEffect } from 'react';

interface LogEntry { id: number; timestamp: string; level: string; message: string; meta?: string; }

export function SystemLogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [oldestId, setOldestId] = useState<number | null>(null);

  const fetchLogs = async (before?: number, append = false) => {
    setLoading(true);
    let url = `/api/admin/system-logs?q=${encodeURIComponent(search)}`;
    if (before) url += `&before=${before}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.logs) {
        setLogs(prev => append ? [...prev, ...data.logs] : data.logs);
        if (data.logs.length > 0) {
          setOldestId(data.logs[data.logs.length - 1].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <input 
          type="text" 
          placeholder="Search logs..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '8px 12px', width: '100%', maxWidth: 400 }}
        />
      </div>
      
      <div style={{ 
        height: 500, 
        overflowY: 'auto', 
        background: 'var(--ink)', 
        color: '#a8ff60', 
        padding: 16, 
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <button 
            type="button" 
            onClick={() => fetchLogs(oldestId || undefined, true)}
            disabled={loading}
            style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'var(--rule)', color: 'var(--ink)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {loading ? 'Loading...' : 'Load older logs'}
          </button>
        </div>
        
        {/* We reverse so oldest is at top when appended, or maybe latest is at top? The API returns DESC (latest first) */}
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <span style={{ color: '#888' }}>[{log.timestamp}]</span>{' '}
            <span style={{ color: log.level === 'error' ? '#ff5555' : log.level === 'warn' ? '#ffb86c' : '#8be9fd' }}>[{log.level.toUpperCase()}]</span>{' '}
            {log.message}
            {log.meta ? <div style={{ opacity: 0.7, paddingLeft: 20 }}>{log.meta}</div> : null}
          </div>
        ))}
        {logs.length === 0 && !loading && (
          <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No logs found</div>
        )}
      </div>
    </div>
  );
}
