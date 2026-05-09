import { CalendarPlus, Check, Clock, Download, MapPin, Shield, Users, X } from "lucide-react";
import {
  createEventAction,
  deleteEventAction,
  deleteMemberAction,
  logoutAction,
  rsvpAction,
  syncSheetEventsAction,
  updateEventAction,
} from "@/app/actions";
import { EventForm } from "@/app/event-form";
import { CountdownBlock, LoginForm } from "@/app/login-form";
import { MemberForm } from "@/app/member-form";
import { getCurrentUser } from "@/lib/auth";
import { formatEventRange, googleCalendarUrl, toDateTimeRangeInput } from "@/lib/calendar";
import { ensureSchema, sql } from "@/lib/db";
import { eventMeta, getEventsWithRsvps, getMembers, type EventWithRsvps } from "@/lib/events";
import type { EventItem, Member, Rsvp, RsvpStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusLabels: Record<RsvpStatus, string> = {
  attending: "参加",
  declined: "不参加",
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

async function getNextLeagueEvent() {
  await ensureSchema();
  const { rows } = await sql`
    SELECT *
    FROM events
    WHERE start_at >= NOW()
      AND (
        title LIKE '県リーグ%'
        OR description LIKE '%"type":"league"%'
        OR description LIKE '%"type": "league"%'
      )
    ORDER BY start_at ASC
    LIMIT 1
  `;

  return (rows[0] as EventItem | undefined) ?? null;
}

function daysUntil(startAt: string) {
  const dateParts = (value: Date) => {
    const parts = new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Tokyo",
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    return Date.UTC(values.year, values.month - 1, values.day);
  };
  const diff = dateParts(new Date(startAt)) - dateParts(new Date());
  const days = Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  return {
    days,
    label: days === 0 ? "今日" : `${days}日`,
  };
}

function myStatus(rsvps: Rsvp[], userId: string) {
  return rsvps.find((rsvp) => rsvp.user_id === userId)?.status;
}

function memberNamesByStatus(rsvps: Rsvp[], members: Member[], status: RsvpStatus) {
  const rsvpByUser = new Map(rsvps.map((rsvp) => [rsvp.user_id, rsvp]));

  return members
    .filter((member) => {
      const memberStatus = rsvpByUser.get(member.id)?.status;
      if (status === "maybe") {
        return !memberStatus || memberStatus === "maybe";
      }
      return memberStatus === status;
    })
    .map((member) => member.name);
}

function eventFormDefaults(event: EventWithRsvps) {
  const meta = eventMeta(event);
  const match = event.title.match(/^(練習試合|県リーグ)\s+vs\s+(.+)$/);
  return {
    id: event.id,
    category: match ? match[1] : event.title === "県リーグ" || event.title === "練習試合" || event.title === "トレーニング" ? event.title : "トレーニング",
    opponent: match?.[2] ?? meta.opponent,
    datetimeRange: toDateTimeRangeInput(event.start_at, event.end_at),
    location: event.location ?? "",
    description: meta.notes,
  };
}

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    const [members, nextLeagueEvent] = await Promise.all([getActiveMembers(), getNextLeagueEvent()]);
    const nextLeagueMeta = nextLeagueEvent ? eventMeta(nextLeagueEvent) : null;
    const leagueDays = nextLeagueEvent ? daysUntil(nextLeagueEvent.start_at) : null;
    const leagueCountdown = nextLeagueEvent
      ? {
          daysLabel: leagueDays?.label ?? "",
          isSoon: (leagueDays?.days ?? 999) <= 60,
          dateLabel: formatEventRange(nextLeagueEvent.start_at, nextLeagueEvent.end_at),
          location: nextLeagueEvent.location ?? "",
          opponent: nextLeagueMeta?.opponent ?? "",
        }
      : null;

    return (
      <main className="auth-screen">
        <section className="auth-visual">
          <div className="orbital-panel">
            <img src="/gens-emblem.png" alt="GENS ICHIHARA" />
          </div>
          <CountdownBlock leagueCountdown={leagueCountdown} />
        </section>
        <LoginForm members={members} leagueCountdown={leagueCountdown} />
      </main>
    );
  }

  const [events, members] = await Promise.all([getEventsWithRsvps("upcoming"), getMembers()]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Schedule / RSVP</p>
          <h1>GENS Schedule Board</h1>
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
              const attendingMembers = memberNamesByStatus(event.rsvps, members, "attending");
              const declinedMembers = memberNamesByStatus(event.rsvps, members, "declined");
              const maybeMembers = memberNamesByStatus(event.rsvps, members, "maybe");
              const meta = eventMeta(event);
              const showOpponent = (meta.type === "match" || meta.type === "league") && meta.opponent;
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
                      {showOpponent ? (
                        <p className="event-time">
                          <Shield size={16} />
                          対戦相手: {meta.opponent}
                        </p>
                      ) : null}
                      {meta.notes ? <p className="event-description">{meta.notes}</p> : null}
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
                    <span>参加 {attendingMembers.length}</span>
                    <span>不参加 {declinedMembers.length}</span>
                    <span>未定 {maybeMembers.length}</span>
                  </div>

                  <div className="response-tabs">
                    <div className="response-tab">
                      <strong>参加</strong>
                      <p>{attendingMembers.length > 0 ? attendingMembers.join("、") : "まだ参加回答はありません。"}</p>
                    </div>
                    <div className="response-tab">
                      <strong>不参加</strong>
                      <p>{declinedMembers.length > 0 ? declinedMembers.join("、") : "まだ不参加回答はありません。"}</p>
                    </div>
                    <div className="response-tab">
                      <strong>未定</strong>
                      <p>{maybeMembers.length > 0 ? maybeMembers.join("、") : "未定メンバーはいません。"}</p>
                    </div>
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
            <MemberForm />

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
