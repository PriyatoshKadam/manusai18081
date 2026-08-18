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
  ADD COLUMN IF NOT EXISTS first_party_domain TEXT,
  ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;

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
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_events_site_time
  ON events(site_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_site_vendor
  ON events(site_id, vendor);

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
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_alerts_site_time
  ON alerts(site_id, created_at DESC);

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
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
