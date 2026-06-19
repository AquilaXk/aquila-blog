ALTER TABLE task
    ADD COLUMN IF NOT EXISTS execution_lease_token UUID;
