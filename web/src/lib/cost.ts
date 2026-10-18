// An event's cost, display only: nobody pays through the app. Kept in pence
// so £6.50 is exactly 650. Empty means the host didn't say; 0 means Free.

export function formatCost(pence: number | null | undefined) {
  if (pence == null) return null;
  if (pence === 0) return "Free";
  return pence % 100 === 0 ? `£${pence / 100}` : `£${(pence / 100).toFixed(2)}`;
}

// The cost from the form's Cost field (see CostField).
export function readCost(formData: FormData): { value: number | null } | { error: string } {
  const kind = String(formData.get("cost_kind") ?? "");
  if (kind === "free") return { value: 0 };
  if (kind !== "paid") return { value: null };
  const raw = String(formData.get("cost_amount") ?? "").trim().replace(/^£/, "");
  const pounds = Number(raw);
  if (!raw || !Number.isFinite(pounds) || pounds <= 0 || pounds > 1000) return { error: "Enter the cost in pounds, e.g. 6 or 6.50 (up to £1,000)." };
  return { value: Math.round(pounds * 100) };
}
