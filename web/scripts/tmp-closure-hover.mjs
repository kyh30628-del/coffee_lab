import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, address, lat, lng, published, created_at, updated_at FROM cafes WHERE id::text = '8737'`;
console.log(JSON.stringify(rows, null, 1));
