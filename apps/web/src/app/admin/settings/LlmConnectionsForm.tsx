'use client';

import { useState } from 'react';

export function LlmConnectionsForm({ initialData }: { initialData: Record<string, string> }) {
  const [provider, setProvider] = useState(initialData['agent.llm_provider'] ?? 'anthropic');
  const [model, setModel] = useState(initialData['agent.llm_model'] ?? '');
  const [apiKey, setApiKey] = useState(initialData['agent.llm_api_key'] ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initialData['agent.system_prompt_extra'] ?? '');
  const [searchProvider, setSearchProvider] = useState(initialData['agent.search_provider'] ?? 'tavily');
  const [searchApiKey, setSearchApiKey] = useState(initialData['agent.search_api_key'] ?? '');
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleTest = async (e: React.MouseEvent) => {
    e.preventDefault();
    setTestStatus('testing');
    setErrorMessage('');
    
    const formData = new FormData();
    formData.append('agent.llm_provider', provider);
    formData.append('agent.llm_api_key', apiKey);
    
    try {
      const res = await fetch('/api/admin/test-llm', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      setTestStatus('error');
      setErrorMessage(err.message);
    }
  };

  return (
    <form method="post" action="/api/admin/settings/save" className="row">
      <input type="hidden" name="group" value="connections" />
      <input type="hidden" name="redirect" value="/admin/settings?tab=connections" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <label>LLM provider</label>
          <select name="agent.llm_provider" value={provider} onChange={e => { setProvider(e.target.value); setTestStatus('idle'); }}>
            <option value="anthropic">anthropic</option>
            <option value="openai">openai</option>
            <option value="deepseek">deepseek</option>
            <option value="gemini">gemini</option>
          </select>
        </div>
        <div>
          <label>LLM model</label>
          <input name="agent.llm_model" value={model} onChange={e => { setModel(e.target.value); setTestStatus('idle'); }} />
        </div>
        <div>
          <label>LLM API key (encrypted)</label>
          <input 
            type="password"
            name="agent.llm_api_key" 
            value={apiKey} 
            onChange={e => { setApiKey(e.target.value); setTestStatus('idle'); }} 
            placeholder="paste to set" 
            autoComplete="off" 
          />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 15 }}>
        <div>
          <label>Web Search Provider</label>
          <select name="agent.search_provider" value={searchProvider} onChange={e => { setSearchProvider(e.target.value); }}>
            <option value="none">None</option>
            <option value="tavily">Tavily</option>
            <option value="brave">Brave</option>
          </select>
        </div>
        <div>
          <label>Search API Key (encrypted)</label>
          <input 
            type="password"
            name="agent.search_api_key" 
            value={searchApiKey} 
            onChange={e => { setSearchApiKey(e.target.value); }} 
            placeholder={searchProvider === 'none' ? 'not required' : 'paste API key'}
            disabled={searchProvider === 'none'}
            autoComplete="off" 
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 15 }}>
        <label>Agent System Instructions (Concierge Behavior)</label>
        <textarea 
          name="agent.system_prompt_extra" 
          value={systemPrompt}
          onChange={e => { setSystemPrompt(e.target.value); setTestStatus('idle'); }}
          placeholder="e.g. You are a highly professional, witty assistant. Be concise."
          rows={4}
        />
      </div>
      <div className="actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button 
          type="button" 
          onClick={handleTest} 
          className="secondary"
          disabled={testStatus === 'testing'}
        >
          {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
        </button>
        <button type="submit" disabled={testStatus !== 'success'}>Save</button>
        {testStatus === 'success' && <span style={{ color: 'var(--success, green)', marginLeft: 10, fontWeight: 'bold' }}>✓ Connection successful</span>}
        {testStatus === 'error' && <span style={{ color: 'var(--error, red)', marginLeft: 10, fontWeight: 'bold' }}>✗ {errorMessage}</span>}
        {testStatus === 'idle' && <span style={{ color: 'var(--ink-soft)', marginLeft: 10, fontStyle: 'italic', fontSize: '0.9rem' }}>Test connection before saving.</span>}
      </div>
    </form>
  );
}
