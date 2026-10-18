import Link from "next/link";

// "function." — or just "f." on phones when the header is busy.
export function Logo({ className = "", compactOnPhones = false }: { className?: string; compactOnPhones?: boolean }) {
  return (
    <Link href="/" aria-label="Function home" className={`font-display text-2xl font-extrabold tracking-tight ${className}`}>
      {compactOnPhones ? (
        <>
          <span className="sm:hidden">f</span>
          <span className="hidden sm:inline">function</span>
        </>
      ) : (
        "function"
      )}
      <span className="text-live">.</span>
    </Link>
  );
}
