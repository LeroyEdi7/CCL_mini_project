DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "certificates"
    GROUP BY "event_id", "participant_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one certificate per event participant: existing duplicates must be reviewed and resolved first';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_event_participant_uidx" ON "certificates" USING btree ("event_id","participant_id");
