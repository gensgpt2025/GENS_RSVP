"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { ok: false, message: "" });

  return (
    <form action={action} className="login-panel">
      <div>
        <p className="eyebrow">Private Schedule</p>
        <h1>GENS Schedule</h1>
        <p className="muted">登録済みメンバーだけが予定と出欠を確認できます。</p>
      </div>

      <label>
        <span>メールアドレス</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>

      <label>
        <span>パスワード</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>

      {state?.message ? <p className="form-message">{state.message}</p> : null}

      <button className="primary-button" type="submit" disabled={pending}>
        <LogIn size={18} />
        {pending ? "確認中" : "ログイン"}
      </button>
    </form>
  );
}
