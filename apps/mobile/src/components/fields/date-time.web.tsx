// On the web the browser's own date and time pickers are the best ones.
const CLASS = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans text-base text-ink outline-none focus:border-brand";

export function DateField({ value, onChange, testID, accessibilityLabel }: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testID} aria-label={accessibilityLabel} className={CLASS} style={{ minHeight: 44 }} />;
}

export function TimeField({ value, onChange, testID, accessibilityLabel }: { value: string; onChange: (value: string) => void; testID?: string; accessibilityLabel?: string }) {
  return <input type="time" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testID} aria-label={accessibilityLabel} className={CLASS} style={{ minHeight: 44 }} />;
}
