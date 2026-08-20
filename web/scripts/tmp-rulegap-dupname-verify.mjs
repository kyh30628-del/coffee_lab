import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const pairs = await sql`
  SELECT regexp_replace(lower(name), '\\s+', '', 'g') AS norm,
         array_agg(id ORDER BY id) ids, array_agg(area ORDER BY id) areas,
         array_agg(dong ORDER BY id) dongs, array_agg(address ORDER BY id) addrs
  FROM cafes
  WHERE published = true
  GROUP BY norm
  HAVING count(*) > 1 AND count(DISTINCT area) > 1
`;

let suspects = [];
for (const p of pairs) {
  const [idA, idB] = p.ids;
  const [dongA, dongB] = p.dongs;
  const rows = await sql`SELECT id, synth_reviews::text t FROM cafes WHERE id IN (${idA}, ${idB})`;
  const rA = rows.find(r => r.id === idA)?.t || '';
  const rB = rows.find(r => r.id === idB)?.t || '';
  const crossA = dongB && rA.includes(dongB);
  const crossB = dongA && rB.includes(dongA);
  if (crossA || crossB) {
    suspects.push({ norm: p.norm, idA, idB, dongA, dongB, crossA, crossB });
  }
}
console.log('checked pairs:', pairs.length, '| suspects:', suspects.length);
console.log(JSON.stringify(suspects, null, 1));
