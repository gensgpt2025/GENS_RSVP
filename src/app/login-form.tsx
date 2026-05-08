"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction } from "@/app/actions";
import type { Member } from "@/lib/types";

export function LoginForm({ members }: { members: Pick<Member, "id" | "name">[] }) {
  const [state, action, pending] = useActionState(loginAction, { ok: false, message: "" });

  return (
    <form action={action} className="login-panel">
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
