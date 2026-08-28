-- ============================================================
-- GA4Fix Database Schema
-- Safe to run multiple times
-- ============================================================

-- ============================================================
-- Users
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Sites monitored by each user
-- ============================================================

CREATE TABLE IF NOT EXISTS sites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  gtm_container_id TEXT,
  ga4_measurement_id TEXT,
  gads_conversion_id TEXT,
  meta_pixel_id TEXT,
  tiktok_pixel_id TEXT,
  linkedin_partner_id TEXT,
  bing_uet_tag_id TEXT,
  snapchat_pixel_id TEXT,
  api_key TEXT NOT NULL UNIQUE,
  first_party_domain TEXT,
  slack_webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns that may be missing from older databases
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS gtm_container_id TEXT,
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT,
  ADD COLUMN IF NOT EXISTS gads_conversion_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_partner_id TEXT,
  ADD COLUMN IF NOT EXISTS bing_uet_tag_id TEXT,
  ADD COLUMN IF NOT EXISTS snapchat_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS first_party_domain TEXT,
  ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS previous_api_key TEXT,
  ADD COLUMN IF NOT EXISTS previous_api_key_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_routing_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sites_user
  ON sites(user_id);

CREATE INDEX IF NOT EXISTS idx_sites_api_key
  ON sites(api_key);

CREATE INDEX IF NOT EXISTS idx_sites_fp_domain
  ON sites(first_party_domain);

-- ============================================================
-- Every event we intercept
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  event_name TEXT,
  event_type TEXT,
  page_url TEXT,
  client_id TEXT,
  params JSONB DEFAULT '{}'::jsonb,
  raw_url TEXT,
  dl_push_index INT,
  source TEXT,
  beacon_accepted BOOLEAN,
  delivery_outcome TEXT DEFAULT 'unknown',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns that may be missing from older databases
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS page_url TEXT,
  ADD COLUMN IF NOT EXISTS client_id TEXT,
  ADD COLUMN IF NOT EXISTS params JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_url TEXT,
  ADD COLUMN IF NOT EXISTS dl_push_index INT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS origin_source TEXT,
  ADD COLUMN IF NOT EXISTS observation_kind TEXT DEFAULT 'network',
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_id TEXT,
  ADD COLUMN IF NOT EXISTS network_occurrence_id TEXT,
  ADD COLUMN IF NOT EXISTS request_signature TEXT,
  ADD COLUMN IF NOT EXISTS transport TEXT,
  ADD COLUMN IF NOT EXISTS gtm_container_id TEXT,
  ADD COLUMN IF NOT EXISTS navigation_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'observed',
  ADD COLUMN IF NOT EXISTS status_code INT,
  ADD COLUMN IF NOT EXISTS latency_ms INT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS beacon_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS delivery_outcome TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consent_state JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS web_vitals JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_events_site_occurrence
  ON events(site_id, event_name, session_id, occurrence_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_signature
  ON events(site_id, request_signature, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_observation
  ON events(site_id, observation_kind, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_site_origin
  ON events(site_id, origin_source, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_time
  ON events(site_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_vendor
  ON events(site_id, vendor);
CREATE INDEX IF NOT EXISTS idx_events_network_delivery
  ON events(site_id, vendor, event_name, received_at DESC)
  WHERE observation_kind = 'network';

CREATE INDEX IF NOT EXISTS idx_events_site_failure
  ON events(site_id, vendor, status_code, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_outcome
  ON events(site_id, vendor, delivery_outcome, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_name
  ON events(site_id, event_name);

CREATE INDEX IF NOT EXISTS idx_events_dedupe
  ON events(
    site_id,
    event_name,
    client_id,
    page_url,
    received_at
  );

-- ============================================================
-- Alerts raised by detection logic
-- ============================================================

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns that may be missing from older databases
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
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_alerts_site_category
  ON alerts(site_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_site_time
  ON alerts(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_repeat_lookup
  ON alerts(site_id, code, vendor, event_name, resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_site_severity
  ON alerts(site_id, severity, resolved);

-- ============================================================
-- Ad-blocker detected sessions
-- ============================================================

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

-- IMPORTANT:
-- This fixes databases where adblock_events already existed
-- without the newer columns.

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

CREATE INDEX IF NOT EXISTS idx_adblock_site_session
  ON adblock_events(site_id, session_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_adblock_site_signal
  ON adblock_events(site_id, signal, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_adblock_site_delivery
  ON adblock_events(site_id, delivery_mode, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_adblock_site_time
  ON adblock_events(site_id, detected_at DESC);

-- ============================================================
-- Track first-seen custom events per site
-- ============================================================

CREATE TABLE IF NOT EXISTS custom_events_seen (
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (site_id, event_name)
);

-- Add potentially missing columns for older databases
ALTER TABLE custom_events_seen
  ADD COLUMN IF NOT EXISTS first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS count BIGINT NOT NULL DEFAULT 1;

-- ============================================================
-- Runtime audit snapshots
-- ============================================================

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

ALTER TABLE audit_runs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'runtime_evidence',
  ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checks_total INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checks_passed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_audit_runs_site_time
  ON audit_runs(site_id, created_at DESC);

-- ============================================================
-- Google Tag Manager OAuth connections
-- ============================================================

CREATE TABLE IF NOT EXISTS gtm_connections (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_email TEXT,
  refresh_token_encrypted TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gtm_connections
  ADD COLUMN IF NOT EXISTS google_email TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS gtm_installations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  workspace_id TEXT,
  tag_id TEXT,
  trigger_id TEXT,
  version_id TEXT,
  status TEXT NOT NULL DEFAULT 'workspace_created',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gtm_installations_user_site
  ON gtm_installations(user_id, site_id, created_at DESC);

-- Versioned, tenant-scoped read-only snapshots of GTM configuration.
CREATE TABLE IF NOT EXISTS gtm_config_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  container_id TEXT NOT NULL,
  container_public_id TEXT,
  workspace_id TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gtm_config_snapshots
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS snapshot_version_id TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_version_name TEXT,
  ADD COLUMN IF NOT EXISTS live_version_id TEXT,
  ADD COLUMN IF NOT EXISTS live_version_name TEXT,
  ADD COLUMN IF NOT EXISTS live_version_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snapshot_stale BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing snapshots were read from workspaces before environment metadata existed;
-- keep them usable for correlation but never present them as live proof.
UPDATE gtm_config_snapshots
   SET environment = 'workspace', snapshot_stale = TRUE
 WHERE COALESCE(environment, 'workspace') = 'workspace' AND snapshot_stale = FALSE;

CREATE INDEX IF NOT EXISTS idx_gtm_snapshots_user_site
  ON gtm_config_snapshots(user_id, site_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_gtm_snapshots_container
  ON gtm_config_snapshots(site_id, container_id, workspace_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_gtm_snapshots_public_container
  ON gtm_config_snapshots(site_id, container_public_id, fetched_at DESC);

-- Legacy unmatched-event reports are correlation evidence, not confirmed ad blocking.
UPDATE adblock_events
SET confidence = CASE
  WHEN detection_method = 'ga4_event_blocked' OR signal = 'ga4_event' THEN 'correlation_gap'
  WHEN detection_method = 'ingest_transport_blocked' OR signal = 'ingest_transport' THEN 'telemetry_gap'
  ELSE COALESCE(NULLIF(confidence, ''), 'confirmed')
END
WHERE detection_method = 'ga4_event_blocked'
   OR signal IN ('ga4_event', 'ingest_transport');

-- ============================================================
-- Tag health, alert operations, revenue, synthetic checks, and compliance
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS revenue_value NUMERIC,
  ADD COLUMN IF NOT EXISTS revenue_currency TEXT,
  ADD COLUMN IF NOT EXISTS revenue_value_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS resource_domain TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gtm_tag_id TEXT,
  ADD COLUMN IF NOT EXISTS gtm_tag_name TEXT,
  ADD COLUMN IF NOT EXISTS gtm_trigger_name TEXT,
  ADD COLUMN IF NOT EXISTS gtm_workspace_id TEXT,
  ADD COLUMN IF NOT EXISTS gtm_correlation_confidence TEXT DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS missing_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observed_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parameter_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS detection_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS detection_error TEXT,
  ADD COLUMN IF NOT EXISTS detection_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detection_last_attempt_at TIMESTAMPTZ;

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS distinct_sessions INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distinct_pages INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_events_site_revenue
  ON events(site_id, transaction_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_resource
  ON events(site_id, resource_domain, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_delivery
  ON events(site_id, delivery_mode, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_site_gtm_tag
  ON events(site_id, gtm_tag_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_site_dedupe
  ON alerts(site_id, dedupe_key, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_policies (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_severity TEXT NOT NULL DEFAULT 'warning',
  duplicate_window_seconds INT NOT NULL DEFAULT 120,
  failure_rate_threshold NUMERIC NOT NULL DEFAULT 0.10,
  latency_multiplier NUMERIC NOT NULL DEFAULT 2.00,
  consent_drift_threshold NUMERIC NOT NULL DEFAULT 0.15,
  flood_window_minutes INT NOT NULL DEFAULT 10,
  flood_limit INT NOT NULL DEFAULT 5,
  slack_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  realtime_min_severity TEXT NOT NULL DEFAULT 'critical',
  digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  digest_hour SMALLINT NOT NULL DEFAULT 9,
  last_digest_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alert_policies
  ADD COLUMN IF NOT EXISTS realtime_min_severity TEXT NOT NULL DEFAULT 'critical',
  ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS digest_hour SMALLINT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS last_digest_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id BIGSERIAL PRIMARY KEY,
  alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_id, channel, destination)
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_due
  ON alert_deliveries(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS detection_failures (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  error TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 1,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detection_failures_due
  ON detection_failures(resolved_at, next_attempt_at, attempts);

CREATE TABLE IF NOT EXISTS blocker_pattern_candidates (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  detection_method TEXT NOT NULL,
  vendor TEXT NOT NULL,
  signal TEXT NOT NULL,
  sample_count INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_page_url TEXT,
  last_blocked_url TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  raw_error TEXT,
  UNIQUE(site_id, detection_method, vendor, signal)
);

ALTER TABLE blocker_pattern_candidates
  ADD COLUMN IF NOT EXISTS raw_error TEXT;

CREATE INDEX IF NOT EXISTS idx_blocker_candidates_review
  ON blocker_pattern_candidates(site_id, status, last_seen DESC);

CREATE TABLE IF NOT EXISTS tag_baselines (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  vendor TEXT NOT NULL,
  event_name TEXT,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  sample_count INT NOT NULL DEFAULT 0,
  fire_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  avg_latency_ms NUMERIC,
  p75_latency_ms NUMERIC,
  consent_denied_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, vendor, event_name, window_start, window_end)
);

CREATE TABLE IF NOT EXISTS anomaly_runs (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_reconciliations (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  currency TEXT,
  vendor_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  vendor_presence JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_vendors JSONB NOT NULL DEFAULT '[]'::jsonb,
  vendor_currencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  delta_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'observed',
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS synthetic_journeys (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_url TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  interval_minutes INT NOT NULL DEFAULT 60,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synthetic_runs (
  id BIGSERIAL PRIMARY KEY,
  journey_id BIGINT NOT NULL REFERENCES synthetic_journeys(id) ON DELETE CASCADE,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS script_allowlist (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  path_prefix TEXT,
  sha256 TEXT,
  page_scope TEXT NOT NULL DEFAULT 'all',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, hostname, path_prefix)
);

CREATE TABLE IF NOT EXISTS compliance_findings (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  page_url TEXT,
  resource_url TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_webhooks (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_encrypted TEXT,
  event_types JSONB NOT NULL DEFAULT '["alert"]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, url)
);

CREATE INDEX IF NOT EXISTS idx_tag_baselines_lookup
  ON tag_baselines(site_id, vendor, event_name, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_runs_site_time
  ON anomaly_runs(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_reconciliation_site_time
  ON revenue_reconciliations(site_id, last_seen DESC);
ALTER TABLE revenue_reconciliations
  ADD COLUMN IF NOT EXISTS vendor_currencies JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_synthetic_runs_site_time
  ON synthetic_runs(site_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_site_status
  ON compliance_findings(site_id, status, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_site_webhooks_site
  ON site_webhooks(site_id, enabled);

-- ============================================================
-- Daily operational digest reports
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_digests (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  total_events INT NOT NULL DEFAULT 0,
  duplicate_events INT NOT NULL DEFAULT 0,
  confirmed_blocked_events INT NOT NULL DEFAULT 0,
  correlation_gaps INT NOT NULL DEFAULT 0,
  transport_failures INT NOT NULL DEFAULT 0,
  root_causes JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, window_start, window_end)
);
CREATE INDEX IF NOT EXISTS idx_alert_digests_site_time ON alert_digests(site_id, window_end DESC);
