"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction } from "@/app/actions";
import type { Member } from "@/lib/types";

type LeagueCountdown = {
  daysLabel: string;
  isSoon: boolean;
  dateLabel: string;
  location: string;
  opponent: string;
} | null;

export function LoginForm({ members, leagueCountdown }: { members: Pick<Member, "id" | "name">[]; leagueCountdown: LeagueCountdown }) {
  const [state, action, pending] = useActionState(loginAction, { ok: false, message: "" });

  return (
    <form action={action} className="login-panel">
      <div className="login-countdown-mobile">
        <CountdownBlock leagueCountdown={leagueCountdown} />
      </div>

      <div>
        <p className="eyebrow">Schedule / RSVP</p>
        <h1>GENS Schedule Board</h1>
        <p className="muted">メンバー名を選択して入室してください</p>
      </div>

      <label>
        <span>メンバー</span>
        <select name="member_id" required defaultValue="">
          <option value="" disabled>
            名前を選択
          </option>
          {members.map((member) => (
            <option value={member.id} key={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>

      {members.length === 0 ? <p className="form-message">初期メンバーを作成するため、環境変数を確認してください。</p> : null}
      {state?.message ? <p className="form-message">{state.message}</p> : null}

      <button className="primary-button" type="submit" disabled={pending || members.length === 0}>
        <LogIn size={18} />
        {pending ? "確認中" : "入室"}
      </button>
    </form>
  );
}

export function CountdownBlock({ leagueCountdown }: { leagueCountdown: LeagueCountdown }) {
  return (
    <div className="countdown-card">
      <p className="eyebrow">Next League Match</p>
      <span className="countdown-kicker">公式戦（県リーグ）まで</span>
      <strong>{leagueCountdown?.isSoon ? `あと ${leagueCountdown.daysLabel}！` : "積み上げよう！"}</strong>
      {leagueCountdown?.isSoon ? (
        <div className="countdown-details">
          <span>{leagueCountdown.dateLabel}</span>
          {leagueCountdown.opponent ? <span>vs {leagueCountdown.opponent}</span> : null}
          {leagueCountdown.location ? <span>{leagueCountdown.location}</span> : null}
        </div>
      ) : null}
      <p className="countdown-message">
        Switch Zero, Fight Hard.
        <br />
        - 0秒切替･最強球際 -
      </p>
    </div>
  );
}
