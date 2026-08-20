import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const inbox = await sql`
  SELECT id, from_team, to_team, type, topic, detail, stage, status, created_at
  FROM coordination
  WHERE status IN ('open','in_progress')
    AND (to_team ILIKE '%폐업%' OR to_team ILIKE '%closure%' OR topic ILIKE '%폐업%')
  ORDER BY created_at DESC
`;
console.log('=== INBOX ===');
console.log(JSON.stringify(inbox, null, 1));

const queue = await sql`
  SELECT id, name, area, address, lat, lng, closure_misses, published, updated_at, review_dates
  FROM cafes
  WHERE closure_misses >= 3 AND published = true
  ORDER BY closure_misses DESC, updated_at ASC
  LIMIT 20
`;
console.log('=== QUEUE (' + queue.length + ') ===');
for (const c of queue) {
  const dates = Array.isArray(c.review_dates) ? c.review_dates : [];
  const sorted = dates.filter(Boolean).sort();
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  console.log(JSON.stringify({
    id: c.id, name: c.name, area: c.area, address: c.address,
    lat: c.lat, lng: c.lng, misses: c.closure_misses, updated_at: c.updated_at,
    latest_review: latest, review_count: dates.length,
  }));
}
