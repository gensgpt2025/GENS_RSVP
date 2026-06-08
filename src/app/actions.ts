"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginAsMember, logout, requireUser } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { hashPassword } from "@/lib/security";
import { fetchSheetEvents, fetchSheetStats } from "@/lib/sheets";
import type { RsvpStatus } from "@/lib/types";

export type MemberFormState = {
  message: string;
  needsConfirmation: boolean;
  pendingName: string;
};

function readString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function japanDateTimeRangeToIso(value: string) {
  const normalized = value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[／]/g, "/")
    .replace(/[：]/g, ":")
    .replace(/[ー－−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})-(\d{1,2})[:-](\d{2})$/);
  if (!match) return null;

  const [, year, month, day, startHour, startMinute, endHour, endMinute] = match.map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, startHour - 9, startMinute));
  const end = new Date(Date.UTC(year, month - 1, day, endHour - 9, endMinute));
  if (end <= start) return null;

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function normalizeEventType(value: string) {
  if (["match", "league", "training", "other"].includes(value)) return value;
  if (value === "練習試合") return "match";
  if (value === "県リーグ" || value === "公式戦") return "league";
  if (value === "トレーニング" || value === "練習") return "training";
  return "other";
}

function fallbackTitle(eventType: string) {
  if (eventType === "match") return "練習試合";
  if (eventType === "league") return "県リーグ";
  if (eventType === "training") return "トレーニング";
  return "その他";
}

function eventDescription(notes: string, eventType: string, opponent: string) {
  const showOpponent = eventType === "match" || eventType === "league";
  return JSON.stringify({
    notes,
    type: eventType,
    opponent: showOpponent ? opponent : "",
  });
}

function memberLoginEmail(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return `${slug || "member"}-${crypto.randomUUID()}@members.local`;
}

export async function loginAction(_: unknown, formData: FormData) {
  const result = await loginAsMember(readString(formData, "member_id"));
  if (result.ok) redirect("/");
  return result;
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

export async function createMemberAction(_: MemberFormState, formData: FormData): Promise<MemberFormState> {
  await requireUser();
  await ensureSchema();

  const name = readString(formData, "name");
  const confirmed = readString(formData, "confirm_duplicate") === "yes";
  if (!name) return { message: "名前を入力してください。", needsConfirmation: false, pendingName: "" };

  const existing = await sql`
    SELECT id FROM members
    WHERE lower(regexp_replace(name, '\\s+', ' ', 'g')) = lower(regexp_replace(${name}, '\\s+', ' ', 'g'))
    LIMIT 1
  `;

  if (existing.rowCount > 0 && !confirmed) {
    return {
      message: "同じ名前のメンバーがすでに登録されています。追加する場合は確認して登録してください。",
      needsConfirmation: true,
      pendingName: name,
    };
  }

  await sql`
    INSERT INTO members (id, name, email, password_hash, role)
    VALUES (${crypto.randomUUID()}, ${name}, ${memberLoginEmail(name)}, ${hashPassword(crypto.randomUUID())}, 'member')
  `;

  revalidatePath("/");
  return { message: "メンバーを登録しました。", needsConfirmation: false, pendingName: "" };
}

export async function createEventAction(formData: FormData) {
  const user = await requireUser();
  await ensureSchema();

  const eventType = normalizeEventType(readString(formData, "event_type") || readString(formData, "category"));
  const title = readString(formData, "title_text") || fallbackTitle(eventType);
  const opponent = readString(formData, "opponent");
  const description = readString(formData, "description");
  const location = readString(formData, "location");
  const datetimeRange = readString(formData, "datetime_range");

  if (!eventType || !datetimeRange) return;

  const range = japanDateTimeRangeToIso(datetimeRange);
  if (!range) return;

  await sql`
    INSERT INTO events (id, title, description, location, start_at, end_at, created_by)
    VALUES (
      ${crypto.randomUUID()},
      ${title},
      ${eventDescription(description, eventType, opponent)},
      ${location || null},
      ${range.startIso},
      ${range.endIso},
      ${user.id}
    )
  `;

  revalidatePath("/");
}

export async function updateEventAction(formData: FormData) {
  await requireUser();
  await ensureSchema();

  const eventId = readString(formData, "event_id");
  const eventType = normalizeEventType(readString(formData, "event_type") || readString(formData, "category"));
  const title = readString(formData, "title_text") || fallbackTitle(eventType);
  const opponent = readString(formData, "opponent");
  const description = readString(formData, "description");
  const location = readString(formData, "location");
  const datetimeRange = readString(formData, "datetime_range");

  if (!eventId || !eventType || !datetimeRange) return;

  const range = japanDateTimeRangeToIso(datetimeRange);
  if (!range) return;

  await sql`
    UPDATE events
    SET title = ${title},
        description = ${eventDescription(description, eventType, opponent)},
        location = ${location || null},
        start_at = ${range.startIso},
        end_at = ${range.endIso}
    WHERE id = ${eventId}
  `;

  revalidatePath("/");
}

export async function rsvpAction(formData: FormData) {
  const user = await requireUser();
  await ensureSchema();

  const eventId = readString(formData, "event_id");
  const status = readString(formData, "status") as RsvpStatus;
  if (!eventId || !["attending", "declined", "maybe"].includes(status)) return;

  await sql`
    INSERT INTO rsvps (event_id, user_id, status, note, updated_at)
    VALUES (${eventId}, ${user.id}, ${status}, null, NOW())
    ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        note = null,
        updated_at = NOW()
  `;

  revalidatePath("/");
}

export async function deleteMemberAction(formData: FormData) {
  const user = await requireUser();
  const memberId = readString(formData, "member_id");
  if (!memberId || memberId === user.id) return;

  await ensureSchema();
  await sql`DELETE FROM members WHERE id = ${memberId}`;
  revalidatePath("/");
}

export async function deleteEventAction(formData: FormData) {
  await requireUser();
  const eventId = readString(formData, "event_id");
  if (!eventId) return;

  await ensureSchema();
  await sql`DELETE FROM events WHERE id = ${eventId}`;
  revalidatePath("/");
}

export async function syncSheetEventsAction() {
  const user = await requireUser();
  await ensureSchema();

  const [events, stats] = await Promise.all([fetchSheetEvents(), fetchSheetStats()]);
  const sheetIds = new Set(events.map((event) => event.sheetId));
  const existingSyncedEvents = await sql`SELECT sheet_id FROM events WHERE sheet_id IS NOT NULL`;

  for (const row of existingSyncedEvents.rows as { sheet_id: string }[]) {
    if (!sheetIds.has(row.sheet_id)) {
      await sql`DELETE FROM events WHERE sheet_id = ${row.sheet_id}`;
      await sql`DELETE FROM player_stats WHERE event_sheet_id = ${row.sheet_id}`;
    }
  }

  for (const event of events) {
    await sql`
      INSERT INTO events (id, sheet_id, title, description, location, result_home, result_away, outcome, start_at, end_at, created_by)
      VALUES (
        ${crypto.randomUUID()},
        ${event.sheetId},
        ${event.title},
        ${event.description},
        ${event.location},
        ${event.resultHome},
        ${event.resultAway},
        ${event.outcome},
        ${event.startIso},
        ${event.endIso},
        ${user.id}
      )
      ON CONFLICT (sheet_id) WHERE sheet_id IS NOT NULL DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          result_home = EXCLUDED.result_home,
          result_away = EXCLUDED.result_away,
          outcome = EXCLUDED.outcome,
          start_at = EXCLUDED.start_at,
          end_at = EXCLUDED.end_at
    `;
  }

  const statKeys = new Set(stats.map((stat) => `${stat.eventSheetId}:${stat.memberId}`));
  if (stats.length > 0) {
    const existingStats = await sql`SELECT event_sheet_id, member_id FROM player_stats`;
    for (const row of existingStats.rows as { event_sheet_id: string; member_id: string }[]) {
      if (!statKeys.has(`${row.event_sheet_id}:${row.member_id}`)) {
        await sql`DELETE FROM player_stats WHERE event_sheet_id = ${row.event_sheet_id} AND member_id = ${row.member_id}`;
      }
    }
  }

  for (const stat of stats) {
    await sql`
      INSERT INTO player_stats (event_sheet_id, member_id, goals, assists, notes, updated_at)
      VALUES (${stat.eventSheetId}, ${stat.memberId}, ${stat.goals}, ${stat.assists}, ${stat.notes}, NOW())
      ON CONFLICT (event_sheet_id, member_id) DO UPDATE
      SET goals = EXCLUDED.goals,
          assists = EXCLUDED.assists,
          notes = EXCLUDED.notes,
          updated_at = NOW()
    `;
  }

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/history");
}
