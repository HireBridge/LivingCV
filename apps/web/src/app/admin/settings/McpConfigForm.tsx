'use client';

import { useState } from 'react';

export function McpConfigForm({ 
  initialData, 
  domain 
}: { 
  initialData: Record<string, string>;
  domain: string;
}) {
  const [enabled, setEnabled] = useState(initialData['mcp.enabled'] === '1');
  const [keyVisible, setKeyVisible] = useState(false);
  const [masterKey, setMasterKey] = useState(initialData['mcp.master_key'] || '');
  
  const connectionString = `https://${domain}/mcp-admin/sse`;

  const handleRotate = () => {
    // Generate a random 32-character hex string for the new key
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const newKey = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    setMasterKey(newKey);
    setKeyVisible(true);
  };

  return (
    <form method="post" action="/api/admin/settings/save" className="row">
      <input type="hidden" name="group" value="mcp" />
      <input type="hidden" name="redirect" value="/admin/settings?tab=mcp" />
      
      <div className="row">
        <label>
          <input 
            type="checkbox" 
            name="mcp.enabled" 
            checked={enabled} 
            onChange={(e) => setEnabled(e.target.checked)} 
            style={{ marginRight: 8 }}
          /> 
          Enable Master MCP
        </label>
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginTop: 4 }}>
          When enabled, the Master Relay MCP will be available for external LLM clients (like Claude Desktop) to connect to and interact with your portfolio.
        </p>
      </div>

      <div className="row">
        <label>Connection String (SSE URL)</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input 
            value={connectionString} 
            readOnly 
            style={{ flex: 1, fontFamily: 'monospace', backgroundColor: '#f5f5f5', color: '#666' }} 
          />
          <button 
            type="button" 
            className="secondary" 
            onClick={() => navigator.clipboard.writeText(connectionString)}
          >
            Copy
          </button>
        </div>
      </div>

      <div className="row">
        <label>Master Key (Bearer Token)</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input 
            type={keyVisible ? 'text' : 'password'}
            name="mcp.master_key" 
            value={masterKey} 
            readOnly
            style={{ flex: 1, fontFamily: 'monospace' }} 
          />
          <button 
            type="button" 
            className="secondary" 
            onClick={() => setKeyVisible(!keyVisible)}
          >
            {keyVisible ? 'Hide Key' : 'View Key'}
          </button>
          <button 
            type="button" 
            className="secondary" 
            onClick={handleRotate}
          >
            Rotate Key
          </button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 24 }}>
        <h4 style={{ margin: '0 0 10px 0' }}>Client Configuration (Claude Desktop)</h4>
        <pre style={{ background: 'var(--paper)', padding: 16, borderRadius: 6, fontSize: '0.85rem', overflowX: 'auto', border: '1px solid var(--rule)' }}>
{`{
  "mcpServers": {
    "livingcv-master": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${connectionString}",
        "--header",
        "Authorization: Bearer ${keyVisible ? masterKey : '••••••••••••••••••••••••••••••••'}"
      ]
    }
  }
}`}
        </pre>
      </div>

      <div className="actions" style={{ marginTop: 24 }}>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
