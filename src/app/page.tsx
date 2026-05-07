import { CalendarPlus, Check, Clock, Download, MapPin, Shield, UserPlus, Users, X } from "lucide-react";
import {
  createEventAction,
  createMemberAction,
  deleteEventAction,
  deleteMemberAction,
  logoutAction,
  rsvpAction,
  updateEventAction,
} from "@/app/actions";
import { LoginForm } from "@/app/login-form";
import { getCurrentUser } from "@/lib/auth";
import { formatEventRange, googleCalendarUrl, toDatetimeLocalValue } from "@/lib/calendar";
import { ensureSchema, sql } from "@/lib/db";
import type { EventItem, Member, Rsvp, RsvpStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type EventWithRsvps = EventItem & {
  rsvps: Rsvp[];
};

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

async function getDashboardData() {
  await ensureSchema();
  const [events, rsvps, members] = await Promise.all([
    sql`SELECT * FROM events ORDER BY start_at ASC`,
    sql`
      SELECT rsvps.*, members.name AS member_name
      FROM rsvps
      INNER JOIN members ON members.id = rsvps.user_id
      ORDER BY rsvps.updated_at DESC
    `,
    sql`SELECT id, name, email, role, active, created_at FROM members ORDER BY created_at ASC`,
  ]);

  const grouped = new Map<string, Rsvp[]>();
  for (const rsvp of rsvps.rows as Rsvp[]) {
    grouped.set(rsvp.event_id, [...(grouped.get(rsvp.event_id) ?? []), rsvp]);
  }

  return {
    events: (events.rows as EventItem[]).map((event) => ({ ...event, rsvps: grouped.get(event.id) ?? [] })),
    members: members.rows as Member[],
  };
}

function countByStatus(rsvps: Rsvp[], status: RsvpStatus) {
  return rsvps.filter((rsvp) => rsvp.status === status).length;
}

function myStatus(rsvps: Rsvp[], userId: string) {
  return rsvps.find((rsvp) => rsvp.user_id === userId)?.status;
}

function attendeeNames(rsvps: Rsvp[]) {
  return rsvps.filter((rsvp) => rsvp.status === "attending").map((rsvp) => rsvp.member_name).filter(Boolean);
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

  const { events, members } = await getDashboardData();

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">GENS Schedule</p>
          <h1>予定と出欠</h1>
        </div>
        <div className="user-chip">
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
                    <form action={updateEventAction} className="stack-form">
                      <input type="hidden" name="event_id" value={event.id} />
                      <label>
                        <span>タイトル</span>
                        <input name="title" defaultValue={event.title} required />
                      </label>
                      <label>
                        <span>場所</span>
                        <input name="location" defaultValue={event.location ?? ""} />
                      </label>
                      <label>
                        <span>開始</span>
                        <input name="start_at" type="datetime-local" defaultValue={toDatetimeLocalValue(event.start_at)} required />
                      </label>
                      <label>
                        <span>終了</span>
                        <input name="end_at" type="datetime-local" defaultValue={toDatetimeLocalValue(event.end_at)} required />
                      </label>
                      <label>
                        <span>詳細</span>
                        <textarea name="description" rows={3} defaultValue={event.description ?? ""} />
                      </label>
                      <button className="secondary-button" type="submit">
                        修正を保存
                      </button>
                    </form>
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
            <form action={createEventAction} className="stack-form">
              <label>
                <span>タイトル</span>
                <input name="title" required />
              </label>
              <label>
                <span>場所</span>
                <input name="location" />
              </label>
              <label>
                <span>開始</span>
                <input name="start_at" type="datetime-local" required />
              </label>
              <label>
                <span>終了</span>
                <input name="end_at" type="datetime-local" required />
              </label>
              <label>
                <span>詳細</span>
                <textarea name="description" rows={4} />
              </label>
              <button className="primary-button" type="submit">
                <CalendarPlus size={18} />
                追加
              </button>
            </form>
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
                  <div>
                    <strong>{member.name}</strong>
                    <span>メンバー選択で入室</span>
                  </div>
                  <span className="pill active">利用中</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
