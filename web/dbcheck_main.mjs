import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

// heal_attempts unread progress since coord#319 created (03:12:46 UTC)
const healProgress = await sql`SELECT job, count(*) FILTER (WHERE note ILIKE '%사람판독%') AS read, count(*) FILTER (WHERE note NOT ILIKE '%사람판독%' OR note IS NULL) AS unread FROM heal_attempts WHERE frozen_until > now() AND (job ILIKE '%attraction%' OR job ILIKE '%noncafe-biz%' OR job ILIKE '%generic-term%') GROUP BY job`;
console.log('=== heal_attempts progress ===');
healProgress.forEach(r => console.log(JSON.stringify(r)));

// 5 sample cafes named in coord#319
const ids = [3480,4733,6100,4008,12968];
const cafes = await sql`SELECT id,name,area,published,synth_grade,synth_count,offctx_rate FROM cafes WHERE id = ANY(${ids})`;
console.log('=== sample cafes ===');
cafes.forEach(r => console.log(JSON.stringify(r)));

// H11: published cafes with very few reviews (<=1) but top grade
const h11 = await sql`SELECT id,name,synth_grade,jsonb_array_length(synth_reviews) AS n FROM cafes WHERE published=true AND synth_grade='검증' AND jsonb_array_length(synth_reviews) <= 1 LIMIT 10`;
console.log('=== H11 top-grade-few-reviews ===');
h11.forEach(r => console.log(JSON.stringify(r)));

// H12: name contains abnormal chars (url, phone pattern, emoji-like)
const h12 = await sql`SELECT id,name,area FROM cafes WHERE published=true AND (name ~ '[0-9]{3,4}-[0-9]{4}' OR name ILIKE '%http%') LIMIT 10`;
console.log('=== H12 abnormal-name ===');
h12.forEach(r => console.log(JSON.stringify(r)));

// H13: address contains 폐업/이전/영업종료 but still published
const h13 = await sql`SELECT id,name,address FROM cafes WHERE published=true AND (address ILIKE '%폐업%' OR address ILIKE '%영업종료%' OR name ILIKE '%폐업%') LIMIT 10`;
console.log('=== H13 closure-word-in-address ===');
h13.forEach(r => console.log(JSON.stringify(r)));
