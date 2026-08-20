import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, name, area, dong, address, synth_grade, synth_count FROM cafes WHERE id IN (15198, 18115)`;
console.log(JSON.stringify(rows, null, 1));
