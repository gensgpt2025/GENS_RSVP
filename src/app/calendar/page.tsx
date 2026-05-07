import { ArrowLeft, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatEventRange } from "@/lib/calendar";
import { getEventsWithRsvps } from "@/lib/events";

export const dynamic = "force-dynamic";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

function monthFromParam(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventDateKey(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="app-shell">
        <div className="tool-panel">
          <p className="empty-state">ログイン後にカレンダーを確認できます。</p>
          <a className="primary-button" href="/">
            ログインへ
          </a>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const month = monthFromParam(params.month);
  const prev = new Date(month);
  prev.setMonth(month.getMonth() - 1);
  const next = new Date(month);
  next.setMonth(month.getMonth() + 1);

  const events = await getEventsWithRsvps("all");
  const eventsByDate = new Map<string, typeof events>();
  for (const event of events) {
    const key = eventDateKey(event.start_at);
    eventsByDate.set(key, [...(eventsByDate.get(key) ?? []), event]);
  }

  const days = buildCalendarDays(month);
  const title = `${month.getFullYear()}年${month.getMonth() + 1}月`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>{title}</h1>
        </div>
        <div className="user-chip">
          <a className="ghost-button" href="/">
            <ArrowLeft size={16} />
            戻る
          </a>
          <Shield size={16} />
          <span>{user.name}</span>
          <form action={logoutAction}>
            <button className="ghost-button" type="submit">
              退出
            </button>
          </form>
        </div>
      </header>

      <section className="calendar-toolbar">
        <a className="ghost-button" href={`/calendar?month=${monthKey(prev)}`}>
          <ChevronLeft size={16} />
          前月
        </a>
        <strong>{title}</strong>
        <a className="ghost-button" href={`/calendar?month=${monthKey(next)}`}>
          翌月
          <ChevronRight size={16} />
        </a>
      </section>

      <section className="calendar-panel">
        <div className="calendar-grid calendar-weekdays">
          {weekdays.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDate.get(key) ?? [];
            const outside = day.getMonth() !== month.getMonth();

            return (
              <div className={outside ? "calendar-day outside" : "calendar-day"} key={key}>
                <span className="calendar-date">{day.getDate()}</span>
                <div className="calendar-events">
                  {dayEvents.map((event) => (
                    <div className="calendar-event" key={event.id}>
                      <strong>{event.title}</strong>
                      <span>{formatEventRange(event.start_at, event.end_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
