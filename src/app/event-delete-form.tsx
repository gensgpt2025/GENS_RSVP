"use client";

type EventDeleteFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  eventId: string;
  eventTitle: string;
};

export function EventDeleteForm({ action, eventId, eventTitle }: EventDeleteFormProps) {
  return (
    <form
      action={action}
      className="admin-inline-form"
      onSubmit={(event) => {
        const confirmed = window.confirm(`「${eventTitle}」を削除しますか？\nこの操作は取り消せません。\n出欠回答も一緒に削除されます。`);
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      <button className="danger-button" type="submit">
        イベント削除
      </button>
    </form>
  );
}
