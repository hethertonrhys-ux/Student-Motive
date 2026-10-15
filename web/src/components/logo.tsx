import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-2xl font-extrabold tracking-tight ${className}`}>
      motive<span className="text-live">.</span>
    </Link>
  );
}
