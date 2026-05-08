import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const sql = neon(connectionString, { fullResults: true });

const targetEvents = await sql`
  SELECT id, title, start_at, end_at
  FROM events
  WHERE title = '250505'
    AND end_at < NOW()
  ORDER BY start_at DESC
`;

const targetMembers = await sql`
  SELECT id, name
  FROM members
  WHERE LOWER(name) = 'sugaya'
`;

console.log(`events to delete: ${targetEvents.rowCount}`);
for (const event of targetEvents.rows) {
  console.log(`- event ${event.id}: ${event.title} ${event.start_at}`);
}

console.log(`members to delete: ${targetMembers.rowCount}`);
for (const member of targetMembers.rows) {
  console.log(`- member ${member.id}: ${member.name}`);
}

const deletedEvents = await sql`
  DELETE FROM events
  WHERE title = '250505'
    AND end_at < NOW()
  RETURNING id, title
`;

const deletedMembers = await sql`
  DELETE FROM members
  WHERE LOWER(name) = 'sugaya'
  RETURNING id, name
`;

console.log(`deleted events: ${deletedEvents.rowCount}`);
console.log(`deleted members: ${deletedMembers.rowCount}`);
