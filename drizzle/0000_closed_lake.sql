CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`x_token` text NOT NULL,
	`o_token` text,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_expiry_idx` ON `rooms` (`expires_at`);