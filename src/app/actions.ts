"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginAsMember, logout, requireUser } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { hashPassword } from "@/lib/security";
import { fetchSheetEvents } from "@/lib/sheets";
import type { RsvpStatus } from "@/lib/types";

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

function eventTitle(category: string, opponent: string) {
  if ((category === "練習試合" || category === "県リーグ") && opponent) {
    return `${category} vs ${opponent}`;
  }

  return category;
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

export async function createMemberAction(formData: FormData) {
  await requireUser();
  await ensureSchema();

  const name = readString(formData, "name");
  if (!name) return;

  await sql`
    INSERT INTO members (id, name, email, password_hash, role)
    VALUES (${crypto.randomUUID()}, ${name}, ${memberLoginEmail(name)}, ${hashPassword(crypto.randomUUID())}, 'member')
  `;

  revalidatePath("/");
}

export async function createEventAction(formData: FormData) {
  const user = await requireUser();
  await ensureSchema();

  const category = readString(formData, "category");
  const opponent = readString(formData, "opponent");
  const title = eventTitle(category, opponent);
  const description = readString(formData, "description");
  const location = readString(formData, "location");
  const datetimeRange = readString(formData, "datetime_range");

  if (!category || !datetimeRange) return;

  const range = japanDateTimeRangeToIso(datetimeRange);
  if (!range) return;

  await sql`
    INSERT INTO events (id, title, description, location, start_at, end_at, created_by)
    VALUES (
      ${crypto.randomUUID()},
      ${title},
      ${description || null},
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
  const category = readString(formData, "category");
  const opponent = readString(formData, "opponent");
  const title = eventTitle(category, opponent);
  const description = readString(formData, "description");
  const location = readString(formData, "location");
  const datetimeRange = readString(formData, "datetime_range");

  if (!eventId || !category || !datetimeRange) return;

  const range = japanDateTimeRangeToIso(datetimeRange);
  if (!range) return;

  await sql`
    UPDATE events
    SET title = ${title},
        description = ${description || null},
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

  const events = await fetchSheetEvents();
  for (const event of events) {
    await sql`
      INSERT INTO events (id, sheet_id, title, description, location, start_at, end_at, created_by)
      VALUES (
        ${crypto.randomUUID()},
        ${event.sheetId},
        ${event.title},
        ${event.description},
        ${event.location},
        ${event.startIso},
        ${event.endIso},
        ${user.id}
      )
      ON CONFLICT (sheet_id) WHERE sheet_id IS NOT NULL DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          start_at = EXCLUDED.start_at,
          end_at = EXCLUDED.end_at
    `;
  }

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/history");
}
