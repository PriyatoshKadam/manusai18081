import { query } from './db';

const DEFAULT_RETENTION_DAYS = 7;
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 5000;
const MAX_BATCHES = 10;

export function rawTelemetryRetentionDays() {
  const configured = Number(process.env.RAW_TELEMETRY_RETENTION_DAYS);
  if (!Number.isFinite(configured)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.floor(configured)));
}

export async function purgeRawTelemetry(batchSize = DEFAULT_BATCH_SIZE) {
  const safeBatchSize = Math.min(DEFAULT_BATCH_SIZE, Math.max(100, Math.floor(Number(batchSize) || DEFAULT_BATCH_SIZE)));
  const retentionDays = rawTelemetryRetentionDays();
  let deletedEvents = 0;
  let batches = 0;

  while (batches < MAX_BATCHES) {
    const result = await query(
      `DELETE FROM events
       WHERE id IN (
         SELECT id FROM events
          WHERE received_at < NOW() - ($1::int * INTERVAL '1 day')
          ORDER BY received_at ASC
          LIMIT $2
       )`,
      [retentionDays, safeBatchSize],
    );
    const deleted = Number(result.rowCount || 0);
    deletedEvents += deleted;
    batches += 1;
    if (deleted < safeBatchSize) break;
  }

  return { retentionDays, deletedEvents, batches, capped: batches >= MAX_BATCHES };
}

export const retentionDefaults = Object.freeze({
  defaultDays: DEFAULT_RETENTION_DAYS,
  minDays: MIN_RETENTION_DAYS,
  maxDays: MAX_RETENTION_DAYS,
  batchSize: DEFAULT_BATCH_SIZE,
  maxBatches: MAX_BATCHES,
});

export const retentionPolicy = Object.freeze({
  rawEvents: 'short_retention',
  aggregates: 'long_retention',
  findings: 'long_retention',
});

export type RawTelemetryRetentionResult = Awaited<ReturnType<typeof purgeRawTelemetry>>;
