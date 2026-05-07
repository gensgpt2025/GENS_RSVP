import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { icsForEvent } from "@/lib/calendar";
import { ensureSchema, sql } from "@/lib/db";
import type { EventItem } from "@/lib/types";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureSchema();
  const { id } = await params;
  const { rows } = await sql`SELECT * FROM events WHERE id = ${id} LIMIT 1`;
  const event = rows[0] as EventItem | undefined;
  if (!event) notFound();

  return new NextResponse(icsForEvent(event), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${event.id}.ics"`,
    },
  });
}
