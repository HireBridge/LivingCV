CREATE INDEX IF NOT EXISTS idx_site_content_lookup ON site_content(template_slug, section_key);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
