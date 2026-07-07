import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';
import { SETTING_KEYS } from '@mohith-das/portfolio-shared';

export const dynamic = 'force-dynamic';

// Admin Voice page (§8 + §9). Renders only when authenticated; the admin
// layout enforces that. Phase 3 ships the form + persistence; Phase 5 polish
// wires "Test STT" / "Test TTS" buttons to the voice service's
// /admin/test/* endpoints once providers + keys are configured.
//
// voice.* keys live in app_settings; the form here POSTs to
// /api/admin/settings/save (group=voice).

export default function VoicePage() {
  const db = getDb();
  const s = getAllSettings(db);

  const enabled = (s[SETTING_KEYS.voiceEnabled] ?? '0') === '1';
  const mode = (s['voice.mode'] ?? 'cloud').trim().toLowerCase() === 'local' ? 'local' : 'cloud';
  const sttProvider = s['voice.stt_provider'] ?? 'deepgram';
  const ttsProvider = s['voice.tts_provider'] ?? 'cartesia';
  const ttsVoiceId = s['voice.tts_voice_id'] ?? '';

  return (
    <div>
      <h1>Voice</h1>

      <section className="admin-card">
        <h3>Status</h3>
        <p>
          When enabled, the voice widget appears on the public landing page and
          recruits can speak to the concierge. Phase 3 ships the harness +
          orchestrator WS bridge with MockSTT/MockTTS; real Deepgram / Whisper /
          Cartesia / Piper adapters slot in behind the same STT/TTS interfaces
          (<code>apps/voice/src/voice_service/stt.py</code> and{' '}
          <code>tts.py</code>) when credentials are added.
        </p>
        <p>
          Voice sessions appear in <a href="/admin/leads">Leads</a> with{' '}
          <code>channel=\'voice\'</code>; the same email gate as text chat runs
          server-side.
        </p>
      </section>

      <form method="post" action="/api/admin/settings/save" className="admin-card">
        <input type="hidden" name="group" value="voice" />

        <div className="row">
          <label>
            <input type="checkbox" name="voice.enabled" defaultChecked={enabled} /> Enable voice widget
          </label>
        </div>

        <div className="row">
          <label>Mode</label>
          <select name="voice.mode" defaultValue={mode}>
            <option value="cloud">cloud (default — Deepgram + Cartesia/ElevenLabs)</option>
            <option value="local">local (whisper.cpp + Piper)</option>
          </select>
        </div>

        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>STT provider</label>
            <select name="voice.stt_provider" defaultValue={sttProvider}>
              <option value="mock">mock (Phase 3 harness)</option>
              <option value="deepgram">deepgram (cloud; STT API key on cloud)</option>
              <option value="whisper">whisper.cpp (local; bundled with voice image)</option>
            </select>
          </div>
          <div>
            <label>TTS provider</label>
            <select name="voice.tts_provider" defaultValue={ttsProvider}>
              <option value="mock">mock (Phase 3 harness)</option>
              <option value="cartesia">cartesia (cloud)</option>
              <option value="elevenlabs">elevenlabs (cloud)</option>
              <option value="piper">piper (local)</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>STT API key (encrypted when set)</label>
            <input
              type="password"
              name="voice.stt_api_key"
              placeholder="paste to set (Phase 5 wiring)"
              autoComplete="off"
            />
          </div>
          <div>
            <label>TTS API key (encrypted when set)</label>
            <input
              type="password"
              name="voice.tts_api_key"
              placeholder="paste to set (Phase 5 wiring)"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="row">
          <label>TTS voice id (provider-specific)</label>
          <input
            name="voice.tts_voice_id"
            defaultValue={ttsVoiceId}
            placeholder="e.g. 79a125e8-cowie or piper model path"
          />
        </div>

        <div className="actions">
          <button type="submit">Save voice settings</button>
        </div>
      </form>

      <section className="admin-card">
        <h3>Tests</h3>
        <p>
          Phase 3 ships the harness; the <code>Test STT</code> / <code>Test TTS</code>{' '}
          buttons wire to the voice service&apos;s <code>/admin/test/*</code> endpoints in
          Phase 5 polish once credentials are configured. For now, the voice widget
          itself drives the test surface (it echoes back whatever&apos;s typed).
        </p>
      </section>
    </div>
  );
}
