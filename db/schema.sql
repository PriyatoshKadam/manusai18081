
CREATE INDEX IF NOT EXISTS idx_events_site_occurrence
  ON events(site_id, event_name, session_id, occurrence_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_signature
  ON events(site_id, request_signature, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_observation
  ON events(site_id, observation_kind, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_time
  ON events(site_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_vendor
  ON events(site_id, vendor);

CREATE INDEX IF NOT EXISTS idx_events_site_failure
  ON events(site_id, vendor, status_code, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_name
  ON events(site_id, event_name);

CREATE INDEX IF NOT EXISTS idx_events_dedupe
  ON events(site_id, event_name, client_id, page_url, received_at);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  vendor TEXT,
  event_name TEXT,
  message TEXT NOT NULL,
  root_cause TEXT,
  fix_steps JSONB DEFAULT '[]'::jsonb,
  page_url TEXT,
  raw JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  muted BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT DEFAULT 'analytics',
  occurrence_count INT,
  distinct_pushes INT,
  confidence TEXT DEFAULT 'confirmed',
  dedupe_key TEXT,
  notification_status TEXT DEFAULT 'pending',
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS severity TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS vendor TEXT,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS fix_steps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS raw JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS muted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'analytics',
  ADD COLUMN IF NOT EXISTS occurrence_count INT,
  ADD COLUMN IF NOT EXISTS distinct_pushes INT,
  ADD COLUMN IF NOT EXISTS confidence TEXT DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS notification_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_alerts_site_category ON alerts(site_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_site_time ON alerts(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_repeat_lookup ON alerts(site_id, code, vendor, event_name, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_site_severity ON alerts(site_id, severity, resolved);

CREATE TABLE IF NOT EXISTS adblock_events (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  detection_method TEXT,
  page_url TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  blocked_vendors JSONB DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE adblock_events
  ADD COLUMN IF NOT EXISTS detection_method TEXT,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS blocked_vendors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS blocked_url TEXT,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS signal TEXT,
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_adblock_site_session ON adblock_events(site_id, session_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_adblock_site_signal ON adblock_events(site_id, signal, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_adblock_site_delivery ON adblock_events(site_id, delivery_mode, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_adblock_site_time ON adblock_events(site_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_adblock_site_vendor ON adblock_events USING GIN(blocked_vendors);

CREATE TABLE IF NOT EXISTS custom_events_seen (
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (site_id, event_name)
);

ALTER TABLE custom_events_seen
  ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS count BIGINT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS audit_runs (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'runtime_evidence',
  score INT NOT NULL DEFAULT 0,
  checks_total INT NOT NULL DEFAULT 0,
  checks_passed INT NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
