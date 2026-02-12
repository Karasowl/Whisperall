-- API Keys (Personal Access Tokens) for MCP and third-party integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT 'Default',
  key_prefix text NOT NULL,       -- "wsp_live_a1b2c3d4" (first 16 chars, for display)
  key_hash   text NOT NULL,       -- SHA-256 hex digest of full key
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_active ON api_keys(user_id) WHERE revoked_at IS NULL;

-- RLS: users can only see/manage their own keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_select ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY api_keys_insert ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY api_keys_update ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY api_keys_delete ON api_keys FOR DELETE
  USING (auth.uid() = user_id);
