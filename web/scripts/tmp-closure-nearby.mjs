import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const targets = [
  {id:'4371', lat:37.7353632, lng:127.1102919, name:'비건베이커리 도야팡'},
  {id:'14402', lat:37.5272897, lng:127.1323484, name:'러셀 도넛 둔촌성내점'},
  {id:'15026', lat:37.4795749, lng:126.9485014, name:'후즈베이커리'},
  {id:'15846', lat:37.5422893, lng:126.6749623, name:'브리즈 브루어스 카페 서구청점'},
  {id:'17554', lat:37.2826815, lng:127.0166927, name:'모인'},
  {id:'17290', lat:37.555332, lng:126.9038259, name:'스콘포드로그'},
];

for (const t of targets) {
  const d = 0.0006; // ~50-60m
  const rows = await sql`
    SELECT id, name, published, updated_at
    FROM cafes
    WHERE lat BETWEEN ${t.lat - d} AND ${t.lat + d}
      AND lng BETWEEN ${t.lng - d} AND ${t.lng + d}
      AND id::text != ${t.id}
  `;
  console.log(`--- ${t.id} ${t.name} nearby(${rows.length}) ---`);
  for (const r of rows) console.log(JSON.stringify(r));
}
