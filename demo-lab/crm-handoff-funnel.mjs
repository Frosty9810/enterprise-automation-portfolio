import { DatabaseSync } from 'node:sqlite';

const stages = ['inquiry', 'qualified', 'handed_off', 'intake_started'];
const eventFields = ['eventId', 'leadId', 'stage', 'occurredAt', 'source', 'campaign'];
const slugPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const isoPattern = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

function timestamp(value) {
  if (typeof value !== 'string' || !isoPattern.test(value)) {
    throw new TypeError('Expected a canonical UTC timestamp with milliseconds.');
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    throw new TypeError('Expected a real UTC timestamp.');
  }
  return ms;
}

function slug(value) {
  return typeof value === 'string' && slugPattern.test(value);
}

function validateEvent(event) {
  if (!event || Object.getPrototypeOf(event) !== Object.prototype ||
      Reflect.ownKeys(event).length !== eventFields.length ||
      eventFields.some(field => !Object.hasOwn(Object.getOwnPropertyDescriptor(event, field) ?? {}, 'value'))) {
    throw new TypeError('Expected exactly the six CRM event fields.');
  }
  const { eventId, leadId, stage, occurredAt, source, campaign } = event;
  if (!slug(eventId) || !slug(leadId) || !stages.includes(stage)) {
    throw new TypeError('Invalid event ID, lead ID or stage.');
  }
  if (stage === 'inquiry' ? !slug(source) || !slug(campaign) : source !== null || campaign !== null) {
    throw new TypeError('Only inquiry events carry source and campaign slugs.');
  }
  return { eventId, leadId, stage, occurredMs: timestamp(occurredAt), source, campaign };
}

// Each stage uses the first event at or after its prerequisite. Use event time
// even when the batch arrives out of order.
const funnelQuery = `
  WITH visible AS (
    SELECT * FROM crm_funnel_events WHERE occurredMs <= ?
  ),
  ranked_inquiries AS (
    SELECT leadId, source, campaign, occurredMs,
           row_number() OVER (PARTITION BY leadId ORDER BY occurredMs, eventId) AS position
    FROM visible WHERE stage = 'inquiry'
  ),
  qualified AS (
    SELECT i.leadId, i.source, i.campaign, min(e.occurredMs) AS qualified_at
    FROM ranked_inquiries i
    LEFT JOIN visible e ON e.leadId = i.leadId AND e.stage = 'qualified'
      AND e.occurredMs >= i.occurredMs
    WHERE i.position = 1
    GROUP BY i.leadId, i.source, i.campaign
  ),
  handed_off AS (
    SELECT q.*, min(e.occurredMs) AS handed_off_at
    FROM qualified q
    LEFT JOIN visible e ON e.leadId = q.leadId AND e.stage = 'handed_off'
      AND e.occurredMs >= q.qualified_at
    GROUP BY q.leadId, q.source, q.campaign, q.qualified_at
  ),
  started AS (
    SELECT h.*, min(e.occurredMs) AS intake_at
    FROM handed_off h
    LEFT JOIN visible e ON e.leadId = h.leadId AND e.stage = 'intake_started'
      AND e.occurredMs >= h.handed_off_at
    GROUP BY h.leadId, h.source, h.campaign, h.qualified_at, h.handed_off_at
  )
  SELECT source, campaign,
         count(*) AS inquiries,
         count(qualified_at) AS qualified,
         count(handed_off_at) AS handed_off,
         count(intake_at) AS intake_started,
         1.0 * count(qualified_at) / count(*) AS inquiry_to_qualified_rate,
         1.0 * count(handed_off_at) / nullif(count(qualified_at), 0) AS qualified_to_handoff_rate,
         1.0 * count(intake_at) / nullif(count(handed_off_at), 0) AS handoff_to_intake_rate,
         1.0 * count(intake_at) / count(*) AS inquiry_to_intake_rate,
         avg(handed_off_at - qualified_at) AS average_handoff_ms
  FROM started GROUP BY source, campaign
  ORDER BY source, campaign
`;

export function openCrmHandoffFunnel(path = ':memory:') {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS crm_funnel_events (
        eventId TEXT NOT NULL PRIMARY KEY,
        leadId TEXT NOT NULL,
        stage TEXT NOT NULL CHECK (stage IN ('inquiry', 'qualified', 'handed_off', 'intake_started')),
        occurredMs INTEGER NOT NULL,
        source TEXT,
        campaign TEXT,
        CHECK ((stage = 'inquiry' AND source IS NOT NULL AND campaign IS NOT NULL)
          OR (stage <> 'inquiry' AND source IS NULL AND campaign IS NULL))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS crm_funnel_event_time ON crm_funnel_events(occurredMs);
    `);
    const find = db.prepare('SELECT leadId, stage, occurredMs, source, campaign FROM crm_funnel_events WHERE eventId = ?');
    const insert = db.prepare('INSERT INTO crm_funnel_events (eventId, leadId, stage, occurredMs, source, campaign) VALUES (?, ?, ?, ?, ?, ?)');
    const report = db.prepare(funnelQuery);

    return {
      ingest(events) {
        if (!Array.isArray(events) || events.length === 0 || events.length > 1000) {
          throw new TypeError('Supply a batch of 1 to 1000 CRM events.');
        }
        const rows = Array.from(events, validateEvent);
        let inserted = 0;
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const { eventId, ...row } of rows) {
            const existing = find.get(eventId);
            if (existing) {
              if (Object.keys(row).some(field => existing[field] !== row[field])) {
                throw new Error('CRM event ID already has a different payload.');
              }
              continue;
            }
            const { leadId, stage, occurredMs, source, campaign } = row;
            if (insert.run(eventId, leadId, stage, occurredMs, source, campaign).changes !== 1) {
              throw new Error('CRM event insert did not persist one row.');
            }
            inserted++;
          }
          db.exec('COMMIT');
        } catch (error) {
          if (db.isTransaction) db.exec('ROLLBACK');
          throw error;
        }
        return { inserted, replayed: rows.length - inserted };
      },
      report(asOf) {
        return report.all(timestamp(asOf)).map(row => ({ ...row }));
      },
      close() {
        db.close();
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
