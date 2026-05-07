import { CalendarPlus, Check, Clock, Download, MapPin, Shield, UserPlus, Users, X } from "lucide-react";
import { createEventAction, createMemberAction, deleteEventAction, logoutAction, rsvpAction, toggleMemberActiveAction } from "@/app/actions";
import { LoginForm } from "@/app/login-form";
import { getCurrentUser } from "@/lib/auth";
import { googleCalendarUrl, formatDateTime } from "@/lib/calendar";
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

async function getDashboardData() {
  await ensureSchema();
  const [events, rsvps, members] = await Promise.all([
    sql`SELECT * FROM events ORDER BY start_at ASC`,
    sql`SELECT * FROM rsvps ORDER BY updated_at DESC`,
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

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-visual">
          <div className="orbital-panel">
            <span />
            <strong>Persistent</strong>
            <p>Vercel Postgresに保存し、端末やブラウザが変わっても同じ予定を共有します。</p>
          </div>
        </section>
        <LoginForm />
      </main>
    );
  }

  const { events, members } = await getDashboardData();
  const isAdmin = user.role === "admin";

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
            <button className="ghost-button" type="submit">ログアウト</button>
          </form>
        </div>
      </header>

      <section className="summary-grid">
        <div className="metric-card">
          <CalendarPlus size={20} />
          <span>予定</span>
          <strong>{events.length}</strong>
        </div>
        <div className="metric-card">
          <Users size={20} />
          <span>メンバー</span>
          <strong>{members.filter((member) => member.active).length}</strong>
        </div>
        <div className="metric-card">
          <Check size={20} />
          <span>あなたの回答済み</span>
          <strong>{events.filter((event) => myStatus(event.rsvps, user.id)).length}</strong>
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
            {events.map((event) => {
              const currentStatus = myStatus(event.rsvps, user.id);
              return (
                <article className="event-card" key={event.id}>
                  <div className="event-main">
                    <div>
                      <h3>{event.title}</h3>
                      <p className="event-time">
                        <Clock size={16} />
                        {formatDateTime(event.start_at)} - {formatDateTime(event.end_at)}
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

                  <form action={rsvpAction} className="rsvp-form">
                    <input type="hidden" name="event_id" value={event.id} />
                    {(["attending", "declined", "maybe"] as RsvpStatus[]).map((status) => (
                      <button
                        className={currentStatus === status ? "status-button active" : "status-button"}
                        key={status}
                        name="status"
                        value={status}
                        type="submit"
                      >
                        {status === "attending" ? <Check size={16} /> : status === "declined" ? <X size={16} /> : <Clock size={16} />}
                        {statusLabels[status]}
                      </button>
                    ))}
                    <input name="note" placeholder="メモ任意" aria-label="メモ" />
                  </form>

                  {isAdmin ? (
                    <form action={deleteEventAction}>
                      <input type="hidden" name="event_id" value={event.id} />
                      <button className="danger-button" type="submit">イベント削除</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {isAdmin ? (
          <aside className="admin-panel">
            <section className="tool-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Admin</p>
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
                  <h2>メンバー登録</h2>
                </div>
              </div>
              <form action={createMemberAction} className="stack-form">
                <label>
                  <span>名前</span>
                  <input name="name" required />
                </label>
                <label>
                  <span>メール</span>
                  <input name="email" type="email" required />
                </label>
                <label>
                  <span>初期パスワード</span>
                  <input name="password" type="password" minLength={8} required />
                </label>
                <label>
                  <span>権限</span>
                  <select name="role" defaultValue="member">
                    <option value="member">メンバー</option>
                    <option value="admin">管理者</option>
                  </select>
                </label>
                <button className="secondary-button" type="submit">
                  <UserPlus size={18} />
                  登録
                </button>
              </form>

              <div className="member-list">
                {members.map((member) => (
                  <form className="member-row" action={toggleMemberActiveAction} key={member.id}>
                    <input type="hidden" name="member_id" value={member.id} />
                    <div>
                      <strong>{member.name}</strong>
                      <span>{member.email}</span>
                    </div>
                    <button className={member.active ? "pill active" : "pill"} type="submit">
                      {member.active ? member.role : "停止中"}
                    </button>
                  </form>
                ))}
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
