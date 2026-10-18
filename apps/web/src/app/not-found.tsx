import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-display text-6xl font-extrabold text-brand">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-muted">It may have been removed, or the link is wrong.</p>
      <Link href="/" className="btn mt-6">Go home</Link>
    </div>
  );
}
