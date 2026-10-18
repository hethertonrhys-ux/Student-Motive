import { Bar, CardSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8" role="status" aria-label="Loading">
      <div className="flex items-center gap-4">
        <span className="size-20 shrink-0 animate-pulse rounded-full bg-line" />
        <div className="flex-1 space-y-2">
          <Bar className="h-7 w-40" />
          <Bar className="h-4 w-56" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="aspect-square animate-pulse rounded-xl bg-line" />
        ))}
      </div>
      <div className="mt-6">
        <CardSkeleton />
      </div>
    </div>
  );
}
