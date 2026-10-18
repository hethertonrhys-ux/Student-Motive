import { Bar, CardSkeleton } from "@/components/skeleton";

// Shown the moment you tap an event, while it loads.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8" role="status" aria-label="Loading">
      <Bar className="h-4 w-16" />
      <div className="mt-4 flex gap-2">
        <Bar className="h-6 w-16 rounded-full" />
        <Bar className="h-6 w-14 rounded-full" />
      </div>
      <Bar className="mt-3 h-9 w-3/4" />
      <Bar className="mt-3 h-6 w-40" />
      <div className="mt-5">
        <CardSkeleton />
      </div>
    </div>
  );
}
