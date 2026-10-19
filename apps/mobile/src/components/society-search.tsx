import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { KIND_LABEL, logSearchAllUnis, searchAllSocieties, searchOwnSocieties, uniShort, type FoundSociety, type SocietyRelation } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Input, Muted, T } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";

// Searches your own uni's societies (loaded with the tab, so results are
// instant). A row at the bottom widens the same search to every London uni,
// which the database does. Without a uni (logged out) it always searches
// every uni. Widening lasts until the box is cleared or you leave the tab.
export function SocietySearch({ societies, myUni, relations = {} }: { societies: FoundSociety[]; myUni?: string | null; relations?: Record<string, SocietyRelation> }) {
  const [query, setQuery] = useState("");
  const [widened, setWidened] = useState(false);
  const [found, setFound] = useState<{ query: string; list: FoundSociety[] } | null>(null);
  const searching = query.trim().length > 0;
  const allUnis = !myUni || widened;
  const mine = uniShort(myUni);

  const ownResults = useMemo(() => searchOwnSocieties(societies, query), [societies, query]);

  // All unis: ask the database a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (!allUnis || !q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const list = await searchAllSocieties(supabase, q, myUni ?? null);
      if (!cancelled) setFound({ query: q, list });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [allUnis, query, myUni]);

  const loading = allUnis && searching && found?.query !== query.trim();
  const results = allUnis ? (found?.list ?? []) : ownResults;

  function widen() {
    setWidened(true);
    if (myUni) void logSearchAllUnis(supabase, myUni, query);
  }
  const claimHref = `${SITE_URL}/dashboard/claim`;

  return (
    <View className="mt-8">
      <T variant="display" className="text-xl">Find a society</T>
      <View className="relative mt-3">
        <View className="pointer-events-none absolute left-3.5 top-0 z-10 h-full justify-center">
          <Icon name="search" size={20} color="#5e5d78" />
        </View>
        <Input
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            // A new search starts at your own uni again.
            if (!v.trim()) setWidened(false);
          }}
          placeholder={allUnis ? "Search societies, e.g. Poker, Economics, Law" : `Search ${mine} societies, e.g. Poker, Economics, Law`}
          accessibilityLabel="Search societies"
          autoCapitalize="none"
          autoCorrect={false}
          className="pl-11"
          testID="society-search"
        />
      </View>

      {searching && (
        <>
          <View className="mt-2 flex-row flex-wrap items-center gap-x-2">
            <Muted className="text-xs font-sans-semibold" testID="search-scope">{allUnis ? "Showing societies from all London unis" : `Showing ${mine} societies`}</Muted>
            {widened && (
              <Pressable onPress={() => setWidened(false)} testID="narrow">
                <T variant="semibold" className="text-xs text-brand">Back to {mine} only</T>
              </Pressable>
            )}
          </View>
          <View className="mt-1.5 overflow-hidden rounded-2xl border border-line bg-surface" testID="society-results">
            {results.map((s, i) => {
              const relation = relations[s.id];
              return (
                <Link key={s.id} href={`/s/${s.slug}` as never} asChild>
                  <Pressable className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} testID={`society-${s.slug}`}>
                    <Avatar name={s.name} url={s.logo_url} size={36} />
                    <View className="min-w-0 flex-1">
                      <T variant="semibold" numberOfLines={1}>{s.name}</T>
                      <Muted className="text-xs">{KIND_LABEL[s.kind]}</Muted>
                    </View>
                    {allUnis && (
                      <View className="rounded-full border border-line px-2 py-0.5">
                        <T variant="bold" className="text-[11px] text-muted">{uniShort(s.university)}</T>
                      </View>
                    )}
                    {relation && (
                      <View className={`rounded-full px-2.5 py-0.5 ${relation === "pending" ? "bg-brand-soft" : "bg-ok/10"}`}>
                        <T variant="bold" className={`text-xs ${relation === "pending" ? "text-brand" : "text-ok"}`}>{relation === "runs" ? "You run this" : relation === "member" ? "Member" : "Awaiting approval"}</T>
                      </View>
                    )}
                    <Icon name="chevron-forward" size={16} color="#5e5d78" />
                  </Pressable>
                </Link>
              );
            })}
            {loading && results.length === 0 && <Muted className="px-4 py-3 text-sm">Searching…</Muted>}

            {/* Own uni: always offer to look further, louder when nothing matched. */}
            {!allUnis &&
              (results.length > 0 ? (
                <Pressable onPress={widen} className="border-t border-line px-4 py-3" testID="widen">
                  <Muted className="text-sm">
                    Society not from {mine}? <T variant="semibold" className="text-sm text-brand">Search all London unis</T>
                  </Muted>
                </Pressable>
              ) : (
                <Pressable onPress={widen} className="px-4 py-4" testID="widen">
                  <T variant="semibold">
                    No {mine} societies match &ldquo;{query.trim()}&rdquo;. <T variant="semibold" className="text-brand">Search all London unis?</T>
                  </T>
                </Pressable>
              ))}

            {(allUnis ? !loading && results.length === 0 : results.length === 0) && (
              <Pressable onPress={() => Linking.openURL(claimHref)} className={`px-4 py-3 ${!allUnis ? "border-t border-line" : ""}`}>
                <Muted className="text-sm">
                  {allUnis ? `No society called “${query.trim()}” on Function yet. ` : "Not on Function yet? "}
                  <T variant="semibold" className="text-sm text-brand">Run one? Ask to add it →</T>
                </Muted>
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}
