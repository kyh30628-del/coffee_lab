import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const rows = await sql`
  SELECT ha.target_id, c.name, c.area, c.address, c.published, c.synth_grade, ha.note, ha.last_at
  FROM heal_attempts ha
  JOIN cafes c ON c.id = ha.target_id
  WHERE ha.job='sentinel.attraction' AND ha.frozen_until IS NOT NULL AND ha.frozen_until > now()
    AND (ha.note IS NULL OR ha.note NOT LIKE '[사람판독%')
  ORDER BY ha.last_at DESC
`;
console.log(JSON.stringify(rows, null, 1));
