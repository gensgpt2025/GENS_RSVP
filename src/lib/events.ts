import { ensureSchema, sql } from "@/lib/db";
import type { EventItem, Member, Rsvp } from "@/lib/types";

export type EventWithRsvps = EventItem & {
  rsvps: Rsvp[];
};

export async function getEventsWithRsvps(where: "upcoming" | "past" | "all" = "all") {
  await ensureSchema();

  const eventQuery =
    where === "upcoming"
      ? sql`SELECT * FROM events WHERE end_at >= NOW() ORDER BY start_at ASC`
      : where === "past"
        ? sql`SELECT * FROM events WHERE end_at < NOW() ORDER BY start_at DESC`
        : sql`SELECT * FROM events ORDER BY start_at ASC`;

  const [events, rsvps] = await Promise.all([
    eventQuery,
    sql`
      SELECT rsvps.*, members.name AS member_name
      FROM rsvps
      INNER JOIN members ON members.id = rsvps.user_id
      ORDER BY rsvps.updated_at DESC
    `,
  ]);

  const grouped = new Map<string, Rsvp[]>();
  for (const rsvp of rsvps.rows as Rsvp[]) {
    grouped.set(rsvp.event_id, [...(grouped.get(rsvp.event_id) ?? []), rsvp]);
  }

  return (events.rows as EventItem[]).map((event) => ({ ...event, rsvps: grouped.get(event.id) ?? [] }));
}

export async function getMembers() {
  await ensureSchema();
  const { rows } = await sql`
    SELECT id, name, email, role, active, created_at
    FROM members
    ORDER BY
      CASE WHEN name ~ '^[0-9]+' THEN 0 ELSE 1 END,
      CASE WHEN name ~ '^[0-9]+' THEN substring(name from '^[0-9]+')::int ELSE NULL END ASC,
      name ASC,
      created_at ASC
  `;
  return rows as Member[];
}

export function countByStatus(rsvps: Rsvp[], status: Rsvp["status"]) {
  return rsvps.filter((rsvp) => rsvp.status === status).length;
}

export function attendeeNames(rsvps: Rsvp[]) {
  return rsvps.filter((rsvp) => rsvp.status === "attending").map((rsvp) => rsvp.member_name).filter(Boolean);
}

export function eventMeta(event: { description: string | null; title: string }) {
  if (!event.description) return { notes: "", type: "", opponent: "" };

  try {
    const parsed = JSON.parse(event.description) as { notes?: string; type?: string; opponent?: string };
    return {
      notes: parsed.notes ?? "",
      type: parsed.type ?? "",
      opponent: parsed.opponent ?? "",
    };
  } catch {
    return { notes: event.description, type: "", opponent: "" };
  }
}

export function eventDisplayTitle(event: { title: string; description: string | null }) {
  const meta = eventMeta(event);
  const match = event.title.match(/^(練習試合|県リーグ)\s+vs\s+(.+)$/i);
  if (match) {
    return `${match[1]} VS ${match[2].trim()}`;
  }

  if ((meta.type === "match" || meta.type === "league") && meta.opponent) {
    const title = meta.type === "match" ? "練習試合" : "県リーグ";
    return `${title} VS ${meta.opponent}`;
  }

  return event.title;
}
