CREATE TABLE `sprint_sessions` (
	`code` text PRIMARY KEY NOT NULL,
	`distance` integer NOT NULL,
	`athlete` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`finish_connected` integer DEFAULT false NOT NULL,
	`start_at` integer,
	`finish_at` integer,
	`created_at` integer NOT NULL
);
