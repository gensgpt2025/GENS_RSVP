"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loginWithPassword, logout, requireAdmin, requireUser } from "@/lib/auth";
import { ensureSchema, sql } from "@/lib/db";
import { hashPassword } from "@/lib/security";
import type { RsvpStatus } from "@/lib/types";

function readString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function japanDateTimeToIso(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour - 9, minute);
  return new Date(timestamp).toISOString();
}

export async function loginAction(_: unknown, formData: FormData) {
  const result = await loginWithPassword(readString(formData, "email"), readString(formData, "password"));
  if (result.ok) redirect("/");
  return result;
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

export async function createMemberAction(formData: FormData) {
  await requireAdmin();
  await ensureSchema();

  const name = readString(formData, "name");
  const email = readString(formData, "email").toLowerCase();
  const password = readString(formData, "password");
  const role = readString(formData, "role") === "admin" ? "admin" : "member";

  if (!name || !email || password.length < 8) return;

  await sql`
    INSERT INTO members (id, name, email, password_hash, role)
    VALUES (${crypto.randomUUID()}, ${name}, ${email}, ${hashPassword(password)}, ${role})
    ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        active = TRUE
  `;

  revalidatePath("/");
}

export async function createEventAction(formData: FormData) {
  const admin = await requireAdmin();
  await ensureSchema();

  const title = readString(formData, "title");
  const description = readString(formData, "description");
  const location = readString(formData, "location");
  const start = readString(formData, "start_at");
  const end = readString(formData, "end_at");

  if (!title || !start || !end) return;

  const startIso = japanDateTimeToIso(start);
  const endIso = japanDateTimeToIso(end);
  if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) return;

  await sql`
    INSERT INTO events (id, title, description, location, start_at, end_at, created_by)
    VALUES (
      ${crypto.randomUUID()},
      ${title},
      ${description || null},
      ${location || null},
      ${startIso},
      ${endIso},
      ${admin.id}
    )
  `;

  revalidatePath("/");
}

export async function rsvpAction(formData: FormData) {
  const user = await requireUser();
  await ensureSchema();

  const eventId = readString(formData, "event_id");
  const status = readString(formData, "status") as RsvpStatus;
  const note = readString(formData, "note");
  if (!eventId || !["attending", "declined", "maybe"].includes(status)) return;

  await sql`
    INSERT INTO rsvps (event_id, user_id, status, note, updated_at)
    VALUES (${eventId}, ${user.id}, ${status}, ${note || null}, NOW())
    ON CONFLICT (event_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        note = EXCLUDED.note,
        updated_at = NOW()
  `;

  revalidatePath("/");
}

export async function toggleMemberActiveAction(formData: FormData) {
  await requireAdmin();
  const memberId = readString(formData, "member_id");
  if (!memberId) return;

  await ensureSchema();
  await sql`UPDATE members SET active = NOT active WHERE id = ${memberId}`;
  revalidatePath("/");
}

export async function deleteEventAction(formData: FormData) {
  await requireAdmin();
  const eventId = readString(formData, "event_id");
  if (!eventId) return;

  await ensureSchema();
  await sql`DELETE FROM events WHERE id = ${eventId}`;
  revalidatePath("/");
}
