// A round photo, or initials on a colour picked from the name.
const COLOURS = ["#4338ca", "#be185d", "#0f766e", "#b45309", "#7c3aed", "#0369a1", "#15803d", "#c2410c"];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
}

export function Avatar({ name, url, size = 36, ring = false }: { name: string; url?: string | null; size?: number; ring?: boolean }) {
  let hash = 2166136261;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const colour = COLOURS[(hash >>> 0) % COLOURS.length];
  const style = { width: size, height: size, fontSize: size * 0.38 };
  const ringClass = ring ? "ring-2 ring-live ring-offset-2 ring-offset-[var(--surface)]" : "";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} title={name} style={style} className={`rounded-full object-cover ${ringClass}`} />;
  }
  return (
    <span
      title={name}
      style={{ ...style, background: colour }}
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold text-white ${ringClass}`}
    >
      {initials(name)}
    </span>
  );
}
