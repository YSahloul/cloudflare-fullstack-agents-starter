ALTER TABLE personal_agents ADD COLUMN system_prompt text;
--> statement-breakpoint
ALTER TABLE personal_agents ADD COLUMN model text DEFAULT 'gpt-4.1-mini';
--> statement-breakpoint
ALTER TABLE personal_agents ADD COLUMN temperature integer DEFAULT 20;
--> statement-breakpoint
ALTER TABLE personal_agents ADD COLUMN max_tokens integer DEFAULT 900;
