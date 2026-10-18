// Grey placeholder shapes shown for a moment while a page loads, so a tap
// always changes the screen straight away instead of looking frozen.

export function Bar({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-line ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card space-y-3 p-4" aria-hidden="true">
      <Bar className="h-3 w-16" />
      <Bar className="h-5 w-2/3" />
      <Bar className="h-4 w-1/2" />
      <Bar className="h-4 w-1/3" />
    </div>
  );
}

// A page heading and a few cards. Screen readers hear "Loading".
export function PageSkeleton({ title, cards = 3, wide = false }: { title?: string; cards?: number; wide?: boolean }) {
  return (
    <div className={`mx-auto ${wide ? "max-w-5xl" : "max-w-2xl"} px-4 py-8`} role="status" aria-label="Loading">
      {title ? <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1> : <Bar className="h-8 w-40" />}
      <Bar className="mt-3 h-4 w-64" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
