"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { createMemberAction, type MemberFormState } from "@/app/actions";

const initialState: MemberFormState = {
  message: "",
  needsConfirmation: false,
  pendingName: "",
};

export function MemberForm() {
  const [state, action, pending] = useActionState(createMemberAction, initialState);

  return (
    <form action={action} className="stack-form">
      <label>
        <span>名前</span>
        <input name="name" defaultValue={state.needsConfirmation ? state.pendingName : ""} required />
      </label>

      {state.message ? <p className={state.needsConfirmation ? "warning-message" : "form-message"}>{state.message}</p> : null}
      {state.needsConfirmation ? <input type="hidden" name="confirm_duplicate" value="yes" /> : null}

      <button className={state.needsConfirmation ? "danger-button" : "secondary-button"} type="submit" disabled={pending}>
        <UserPlus size={18} />
        {state.needsConfirmation ? "確認して登録" : "登録"}
      </button>
    </form>
  );
}
