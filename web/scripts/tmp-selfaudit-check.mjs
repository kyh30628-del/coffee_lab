import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const sample = await sql`SELECT id,name,char_scores,review_dates FROM cafes WHERE published=true AND char_scores IS NOT NULL LIMIT 2`;
console.log('SAMPLE:', JSON.stringify(sample, null, 1));
