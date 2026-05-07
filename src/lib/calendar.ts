import type { EventItem } from "@/lib/types";

function toCalendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function googleCalendarUrl(event: EventItem) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toCalendarDate(event.start_at)}/${toCalendarDate(event.end_at)}`,
    details: event.description ?? "",
    location: event.location ?? "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function icsForEvent(event: EventItem) {
  const now = toCalendarDate(new Date().toISOString());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GENS Schedule//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@gens-schedule`,
    `DTSTAMP:${now}`,
    `DTSTART:${toCalendarDate(event.start_at)}`,
    `DTEND:${toCalendarDate(event.end_at)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description ?? "")}`,
    `LOCATION:${escapeIcs(event.location ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function parts(value: string) {
  const date = new Date(value);
  const items = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).formatToParts(date);

  return Object.fromEntries(items.map((item) => [item.type, item.value]));
}

export function formatEventRange(start: string, end: string) {
  const startParts = parts(start);
  const endParts = parts(end);
  const startDate = `${startParts.year}/${startParts.month}/${startParts.day}`;
  const endDate = `${endParts.year}/${endParts.month}/${endParts.day}`;
  const startTime = `${startParts.hour}:${startParts.minute}`;
  const endTime = `${endParts.hour}:${endParts.minute}`;

  if (startDate === endDate) {
    return `${startDate} ${startTime}-${endTime}`;
  }

  return `${startDate} ${startTime}-${endDate} ${endTime}`;
}

export function toDatetimeLocalValue(value: string) {
  const valueParts = parts(value);
  return `${valueParts.year}-${valueParts.month.padStart(2, "0")}-${valueParts.day.padStart(2, "0")}T${valueParts.hour}:${valueParts.minute}`;
}

export function toDateTimeRangeInput(start: string, end: string) {
  const startParts = parts(start);
  const endParts = parts(end);
  return `${startParts.year}/${startParts.month.padStart(2, "0")}/${startParts.day.padStart(2, "0")} ${startParts.hour}:${startParts.minute}-${endParts.hour}:${endParts.minute}`;
}
