"use client";

type SheetSyncFormProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function SheetSyncForm({ action }: SheetSyncFormProps) {
  return (
    <form
      action={action}
      className="sync-form"
      onSubmit={(event) => {
        const confirmed = window.confirm("スプレッドシートと同期しますか？\n既存の同期済みイベントはシートの内容で更新されます。");
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <button className="secondary-button" type="submit">
        スプレッドシート同期
      </button>
    </form>
  );
}
