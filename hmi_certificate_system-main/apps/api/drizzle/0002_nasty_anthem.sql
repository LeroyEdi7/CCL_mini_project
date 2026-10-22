CREATE TYPE "public"."event_member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "event_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "event_member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_memberships" ADD CONSTRAINT "event_memberships_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_memberships" ADD CONSTRAINT "event_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_memberships_event_user_uidx" ON "event_memberships" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_memberships_user_id_idx" ON "event_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_memberships_event_id_idx" ON "event_memberships" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_archived_at_idx" ON "events" USING btree ("archived_at");--> statement-breakpoint
INSERT INTO "event_memberships" ("event_id", "user_id", "role")
SELECT "id", "owner_id", 'admin'::"event_member_role"
FROM "events"
ON CONFLICT ("event_id", "user_id") DO NOTHING;
