-- Add AI config columns directly to whatsapp_sessions table
ALTER TABLE whatsapp_sessions ADD COLUMN system_prompt text;
ALTER TABLE whatsapp_sessions ADD COLUMN model text DEFAULT 'gpt-4.1-mini';
ALTER TABLE whatsapp_sessions ADD COLUMN temperature integer DEFAULT 20;
ALTER TABLE whatsapp_sessions ADD COLUMN max_tokens integer DEFAULT 900;
ALTER TABLE whatsapp_sessions ADD COLUMN group_policy text DEFAULT 'mention';
ALTER TABLE whatsapp_sessions ADD COLUMN dm_policy text DEFAULT 'always';
ALTER TABLE whatsapp_sessions ADD COLUMN auto_reply integer DEFAULT 1;
