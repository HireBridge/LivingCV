-- Add index for daily message budget query (plan.md M9).
-- chat_messages.session_id is already indexed (006_indexes.sql);
-- created_at needs coverage for date-range scans.
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
