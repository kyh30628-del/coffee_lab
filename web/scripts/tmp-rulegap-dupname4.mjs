import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const dups = await sql`
  SELECT regexp_replace(lower(name), '\\s+', '', 'g') AS norm, count(*) c,
         array_agg(id) ids, array_agg(name) names, array_agg(area) areas, array_agg(published) pubs
  FROM cafes
  GROUP BY norm
  HAVING count(*) > 1 AND count(DISTINCT area) > 1
  ORDER BY c DESC
`;
const bothPub = dups.filter(d => d.pubs.every(p => p === true));
console.log('both-published count:', bothPub.length);
for (const d of bothPub) {
  console.log(d.norm, d.ids, d.areas);
}
