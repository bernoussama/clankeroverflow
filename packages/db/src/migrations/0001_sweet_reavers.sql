CREATE TABLE `solution_vote` (
	`user_id` text NOT NULL,
	`solution_id` text NOT NULL,
	`is_upvote` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `solution_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`solution_id`) REFERENCES `solution`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `solutionVote_solutionId_idx` ON `solution_vote` (`solution_id`);--> statement-breakpoint
ALTER TABLE `solution` ADD `score` integer DEFAULT 0 NOT NULL;