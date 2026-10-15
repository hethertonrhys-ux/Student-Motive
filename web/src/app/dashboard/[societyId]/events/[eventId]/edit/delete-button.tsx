"use client";

export function DeleteButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this event? This can't be undone.")) e.preventDefault();
      }}
    >
      <button className="text-sm font-semibold text-danger hover:underline">Delete event</button>
    </form>
  );
}
