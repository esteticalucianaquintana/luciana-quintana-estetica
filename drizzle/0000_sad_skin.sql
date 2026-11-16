CREATE TABLE `agenda_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`patient` text NOT NULL,
	`phone` text NOT NULL,
	`service` integer NOT NULL,
	`zones` integer NOT NULL,
	`duration` integer NOT NULL,
	`day` text NOT NULL,
	`start` integer NOT NULL,
	`status` text NOT NULL,
	`proposal` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_bookings_token_unique` ON `agenda_bookings` (`token`);--> statement-breakpoint
CREATE TABLE `agenda_locks` (
	`day` text NOT NULL,
	`minute` integer NOT NULL,
	`booking` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`day`, `minute`)
);
--> statement-breakpoint
CREATE TABLE `agenda_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`booking` text NOT NULL,
	`kind` text NOT NULL,
	`due` text NOT NULL,
	`state` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agenda_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
