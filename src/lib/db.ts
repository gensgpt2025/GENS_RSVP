import { neon } from "@neondatabase/serverless";
import { hashPassword } from "@/lib/security";

let schemaReady: Promise<void> | null = null;
let dbClient: ReturnType<typeof neon<false, true>> | null = null;

function getSql() {
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required. Connect a Neon Postgres database on Vercel.");
  }

  dbClient ??= neon(connectionString, { fullResults: true });
  return dbClient;
}

export function sql(strings: TemplateStringsArray, ...params: unknown[]) {
  return getSql()(strings, ...params);
}

export async function ensureSchema() {
  schemaReady ??= createSchema();
  await schemaReady;
}

async function createSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      sheet_id TEXT UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS sheet_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_sheet_id ON events(sheet_id) WHERE sheet_id IS NOT NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS rsvps (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`;

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME?.trim() || "管理者";

  if (adminEmail && adminPassword) {
    const existing = await sql`SELECT id FROM members WHERE email = ${adminEmail} LIMIT 1`;
    if (existing.rowCount === 0) {
      await sql`
        INSERT INTO members (id, name, email, password_hash, role)
        VALUES (${crypto.randomUUID()}, ${adminName}, ${adminEmail}, ${hashPassword(adminPassword)}, 'admin')
      `;
    }
  }
}
