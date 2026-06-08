import { ArrowLeft, Shield } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { formatEventRange } from "@/lib/calendar";
import { attendeeNames, countByStatus, eventDisplayTitle, getEventsWithRsvps, getMembers } from "@/lib/events";
import { getPlayerStats, getPlayerStatSummary, statsForEvent } from "@/lib/stats";

export const dynamic = "force-dynamic";

function resultText(event: { result_home: number | null; result_away: number | null; outcome: string | null }) {
  if (event.result_home === null || event.result_away === null) return "-";
  return `${event.result_home}-${event.result_away}${event.outcome ? ` ${event.outcome}` : ""}`;
}

export default async function HistoryPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="app-shell">
        <div className="tool-panel">
          <p className="empty-state">ログイン後に過去ログを確認できます。</p>
          <a className="primary-button" href="/">
            ログインへ
          </a>
        </div>
      </main>
    );
  }

  const [events, members, stats] = await Promise.all([getEventsWithRsvps("past"), getMembers(), getPlayerStats()]);
  const rankings = await getPlayerStatSummary(members);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Archive</p>
          <h1>過去ログ</h1>
        </div>
        <div className="user-chip">
          <a className="ghost-button" href="/calendar">
            カレンダー
          </a>
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

      <section className="history-panel">
        {events.length === 0 ? (
          <p className="empty-state">終了済みイベントはまだありません。</p>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>イベント</th>
                  <th>結果</th>
                  <th>個人成績</th>
                  <th>場所</th>
                  <th>出席者</th>
                  <th>出席</th>
                  <th>欠席</th>
                  <th>未定</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const attendees = attendeeNames(event.rsvps);
                  const eventStats = statsForEvent(stats, event.sheet_id);
                  return (
                    <tr key={event.id}>
                      <td>{formatEventRange(event.start_at, event.end_at)}</td>
                      <td>{eventDisplayTitle(event)}</td>
                      <td>{resultText(event)}</td>
                      <td>
                        {eventStats.length > 0
                          ? eventStats.map((stat) => {
                              const member = members.find((item) => item.id === stat.member_id || item.name === stat.member_id || item.name.startsWith(`${stat.member_id}_`));
                              return `${member?.name ?? stat.member_id} G${stat.goals} A${stat.assists}`;
                            }).join(" / ")
                          : "-"}
                      </td>
                      <td>{event.location || "-"}</td>
                      <td>{attendees.length > 0 ? attendees.join("、") : "-"}</td>
                      <td>{countByStatus(event.rsvps, "attending")}</td>
                      <td>{countByStatus(event.rsvps, "declined")}</td>
                      <td>{countByStatus(event.rsvps, "maybe")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="history-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Stats</p>
            <h2>個人成績</h2>
          </div>
        </div>
        {rankings.length === 0 ? (
          <p className="empty-state">個人成績はまだありません。</p>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table stats-table">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>メンバー</th>
                  <th>得点</th>
                  <th>アシスト</th>
                  <th>合計</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((player, index) => (
                  <tr key={player.member_id}>
                    <td>{index + 1}</td>
                    <td>{player.member_name}</td>
                    <td>{player.goals}</td>
                    <td>{player.assists}</td>
                    <td>{player.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
