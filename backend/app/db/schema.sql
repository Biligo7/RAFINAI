-- Azure AI Chat template schema. PostgreSQL DDL.
-- Idempotent: each statement uses IF NOT EXISTS so the runner can re-apply safely.
-- gen_random_uuid() is built into Postgres 13+; pgcrypto is not required.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version text NOT NULL PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    external_subject text NULL,
    display_name text NULL,
    email text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_app_users_external_subject
    ON app_users(external_subject)
    WHERE external_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS chats (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NULL REFERENCES app_users(id),
    title text NOT NULL,
    system_prompt text NULL,
    model text NULL,
    temperature double precision NULL,
    archived_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    chat_id uuid NOT NULL REFERENCES chats(id),
    role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
    content text NOT NULL,
    token_count integer NULL,
    provider text NULL,
    model text NULL,
    latency_ms integer NULL,
    error_code text NULL,
    metadata_json text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_feedback (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id uuid NOT NULL REFERENCES messages(id),
    rating integer NOT NULL CHECK (rating IN (-1, 1)),
    comment text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_datasets (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_examples (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    dataset_id uuid NULL REFERENCES training_datasets(id),
    source_chat_id uuid NULL REFERENCES chats(id),
    source_user_message_id uuid NULL REFERENCES messages(id),
    source_assistant_message_id uuid NULL REFERENCES messages(id),
    input_text text NOT NULL,
    expected_output_text text NOT NULL,
    tags_json text NULL,
    metadata_json text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_events (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id text NULL,
    event_type text NOT NULL,
    severity text NOT NULL,
    message text NULL,
    properties_json text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chats_updated_at ON chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_chats_user_updated_at ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_messages_chat_created_at ON messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS ix_training_examples_dataset ON training_examples(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_app_events_created_at ON app_events(created_at DESC);
