-- Replace partial unique index (if present) so INSERT ... ON CONFLICT (external_subject)
-- in auth / user upsert paths works on databases that applied an older schema.

DROP INDEX IF EXISTS ix_app_users_external_subject;
CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_external_subject ON app_users (external_subject);
