ALTER TABLE member_legal_acceptance
    ADD COLUMN IF NOT EXISTS client_ip_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS user_agent_hash VARCHAR(64);
