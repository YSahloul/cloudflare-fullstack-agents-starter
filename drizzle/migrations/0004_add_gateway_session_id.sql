ALTER TABLE whatsapp_sessions ADD COLUMN gateway_session_id text;
--> statement-breakpoint
CREATE UNIQUE INDEX whatsapp_sessions_gateway_session_id_unique ON whatsapp_sessions (gateway_session_id);
