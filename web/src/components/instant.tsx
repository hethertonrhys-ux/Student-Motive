"use client";

import { createContext, useContext } from "react";
import { useInstant } from "@/lib/use-instant";

type Result = { error?: string } | void | undefined;
type Run = (next: React.ReactNode, action: () => Promise<Result>) => void;
const AreaContext = createContext<Run | null>(null);

// A part of a page that switches straight away to how it will look after a
// tap. The server prepares that "after" version alongside the page, so the
// layout and wording are exactly the same; the database catches up in the
// background, and if it says no the area goes back with a short message.
export function InstantArea({ children }: { children: React.ReactNode }) {
  const [after, run] = useInstant<React.ReactNode>(null);
  return (
    <AreaContext.Provider value={run}>
      {/* While waiting, the "after" version can't be tapped again. */}
      {after === null ? children : after === HIDE ? null : <div inert className="contents">{after}</div>}
    </AreaContext.Provider>
  );
}

// Use as the "after" version to make the area disappear (e.g. a removed row).
export const HIDE = "__hide__";

export function useInstantArea() {
  return useContext(AreaContext);
}

// A button inside a form, like the plain ones it replaces, that runs its
// action straight away and shows the "after" version of its area.
export function InstantFormButton({
  action,
  after,
  className,
  formClassName,
  confirmText,
  label,
  children,
}: {
  action: () => Promise<Result>;
  after: React.ReactNode;
  className?: string;
  formClassName?: string;
  confirmText?: string;
  label?: string;
  children: React.ReactNode;
}) {
  const run = useInstantArea();
  return (
    <form
      className={formClassName}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !confirm(confirmText)) return;
        if (run) run(after, action);
        else void action();
      }}
    >
      <button className={className} aria-label={label}>{children}</button>
    </form>
  );
}
