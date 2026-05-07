import { CalendarPlus, Check, Clock, Download, MapPin, Shield, UserPlus, Users, X } from "lucide-react";
import {
  createEventAction,
  createMemberAction,
  deleteEventAction,
  deleteMemberAction,
  logoutAction,
  rsvpAction,
  syncSheetEventsAction,
  updateEventAction,
} from "@/app/actions";
import { EventForm } from "@/app/event-form";
import { LoginForm } from "@/app/login-form";
import { getCurrentUser } from "@/lib/auth";
import { formatEventRange, googleCalendarUrl, toDateTimeRangeInput } from "@/lib/calendar";
import { ensureSchema, sql } from "@/lib/db";
import { attendeeNames, countByStatus, getEventsWithRsvps, getMembers, type EventWithRsvps } from "@/lib/events";
import type { Member, Rsvp, RsvpStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabels: Record<RsvpStatus, string> = {
  attending: "出席",
  declined: "欠席",
  maybe: "未定",
};

async function getActiveMembers() {
  await ensureSchema();
  const { rows } = await sql`
    SELECT id, name, email, role, active, created_at
    FROM members
    WHERE active = TRUE
    ORDER BY created_at ASC
  `;

  return rows as Member[];
}

function myStatus(rsvps: Rsvp[], userId: string) {
  return rsvps.find((rsvp) => rsvp.user_id === userId)?.status;
}

function eventFormDefaults(event: EventWithRsvps) {
  const match = event.title.match(/^(練習試合|県リーグ)\s+vs\s+(.+)$/);
  return {
    id: event.id,
    category: match ? match[1] : event.title === "県リーグ" || event.title === "練習試合" || event.title === "トレーニング" ? event.title : "トレーニング",
    opponent: match?.[2] ?? "",
    datetimeRange: toDateTimeRangeInput(event.start_at, event.end_at),
    location: event.location ?? "",
    description: event.description ?? "",
  };
}

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    const members = await getActiveMembers();
    return (
      <main className="auth-screen">
        <section className="auth-visual">
          <div className="orbital-panel">
            <span />
            <strong>Persistent</strong>
            <p>予定と出欠はデータベースに保存され、端末やブラウザを変えても同じ情報を共有できます。</p>
          </div>
        </section>
        <LoginForm members={members} />
      </main>
    );
  }

  const [events, members] = await Promise.all([getEventsWithRsvps("upcoming"), getMembers()]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">GENS Schedule</p>
          <h1>予定と出欠</h1>
        </div>
        <div className="user-chip">
          <a className="ghost-button" href="/calendar">
            カレンダー
          </a>
          <a className="ghost-button" href="/history">
            過去ログ
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

      <section className="summary-grid">
        <div className="metric-card">
          <CalendarPlus size={18} />
          <span>予定</span>
          <strong>{events.length}</strong>
        </div>
        <div className="metric-card">
          <Users size={18} />
          <span>メンバー</span>
          <strong>{members.length}</strong>
        </div>
      </section>

      <div className="content-grid">
        <section className="events-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Events</p>
              <h2>イベント一覧</h2>
            </div>
          </div>

          <div className="event-list">
            {events.length === 0 ? <p className="empty-state">まだ予定はありません。</p> : null}
            {events.map((event: EventWithRsvps) => {
              const currentStatus = myStatus(event.rsvps, user.id);
              const attendees = attendeeNames(event.rsvps);
              return (
                <article className="event-card" key={event.id}>
                  <div className="event-main">
                    <div>
                      <h3>{event.title}</h3>
                      <p className="event-time">
                        <Clock size={16} />
                        {formatEventRange(event.start_at, event.end_at)}
                      </p>
                      {event.location ? (
                        <p className="event-time">
                          <MapPin size={16} />
                          {event.location}
                        </p>
                      ) : null}
                      {event.description ? <p className="event-description">{event.description}</p> : null}
                    </div>
                    <div className="calendar-actions">
                      <a className="icon-link" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
                        <CalendarPlus size={16} />
                        Google
                      </a>
                      <a className="icon-link" href={`/api/events/${event.id}/ics`}>
                        <Download size={16} />
                        ICS
                      </a>
                    </div>
                  </div>

                  <div className="status-row">
                    <span>出席 {countByStatus(event.rsvps, "attending")}</span>
                    <span>欠席 {countByStatus(event.rsvps, "declined")}</span>
                    <span>未定 {countByStatus(event.rsvps, "maybe")}</span>
                  </div>

                  <div className="attendee-box">
                    <strong>出席メンバー</strong>
                    <p>{attendees.length > 0 ? attendees.join("、") : "まだ出席回答はありません。"}</p>
                  </div>

                  <form action={rsvpAction} className="rsvp-form">
                    <input type="hidden" name="event_id" value={event.id} />
                    {(["attending", "declined", "maybe"] as RsvpStatus[]).map((status) => (
                      <button className={currentStatus === status ? "status-button active" : "status-button"} key={status} name="status" value={status} type="submit">
                        {status === "attending" ? <Check size={16} /> : status === "declined" ? <X size={16} /> : <Clock size={16} />}
                        {statusLabels[status]}
                      </button>
                    ))}
                  </form>

                  <details className="edit-event-panel">
                    <summary>予定を修正</summary>
                    <EventForm action={updateEventAction} buttonLabel="修正を保存" defaults={eventFormDefaults(event)} />
                  </details>

                  <form action={deleteEventAction} className="admin-inline-form">
                    <input type="hidden" name="event_id" value={event.id} />
                    <button className="danger-button" type="submit">
                      イベント削除
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="admin-panel">
          <section className="tool-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Events</p>
                <h2>イベント追加</h2>
              </div>
            </div>
            <form action={syncSheetEventsAction} className="sync-form">
              <button className="secondary-button" type="submit">
                スプレッドシート同期
              </button>
            </form>
            <EventForm action={createEventAction} buttonLabel="追加" />
          </section>

          <section className="tool-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Members</p>
                <h2>メンバー追加</h2>
              </div>
            </div>
            <form action={createMemberAction} className="stack-form">
              <label>
                <span>名前</span>
                <input name="name" required />
              </label>
              <button className="secondary-button" type="submit">
                <UserPlus size={18} />
                登録
              </button>
            </form>

            <form action={deleteMemberAction} className="stack-form member-control-form">
              <label>
                <span>削除するメンバー</span>
                <select name="member_id" required defaultValue="">
                  <option value="" disabled>
                    メンバーを選択
                  </option>
                  {members
                    .filter((member) => member.id !== user.id)
                    .map((member) => (
                      <option value={member.id} key={member.id}>
                        {member.name}
                      </option>
                    ))}
                </select>
              </label>
              <button className="danger-button" type="submit">
                メンバーを削除
              </button>
            </form>

            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.id}>
                  <strong>{member.name}</strong>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
