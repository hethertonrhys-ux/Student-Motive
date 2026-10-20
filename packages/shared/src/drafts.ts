// Draft events (Part 5, event admin) are only for the society's committee:
// every public list of events leaves them out. The database already hides
// them from everyone else; the committee can see their own drafts, so lists
// they also use (the feed, the map, a society's page…) filter them out here.

type QueryResult = { error: { code?: string; message?: string } | null; status?: number };

// Until supabase/migrations/20261121000000_event_admin.sql has run there's
// no is_draft column (and no drafts) and no published_at column, so lists
// load as before. A count-only request (head: true) gets an empty 400 back.
export function missingColumn(result: QueryResult, column: string): boolean {
  const error = result.error;
  if (!error) return false;
  return error.code === "42703" || (error.message ?? "").includes(column) || (result.status === 400 && !error.message);
}

// Runs a query of events (or of rows with events embedded, with column
// "events.is_draft") without drafts. `build` makes the query and is called
// again for the fallback, so it mustn't have been awaited.
export async function withoutDrafts<R extends QueryResult>(build: () => PromiseLike<R>, column = "is_draft"): Promise<R> {
  const query = build() as unknown as { eq: (column: string, value: boolean) => PromiseLike<R> };
  const first = await query.eq(column, false);
  if (missingColumn(first, "is_draft")) return await build();
  return first;
}
