import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { eventAdminAvailable, FEATURE_GROUPS, FEATURES, hasFeature, loadFeatureInterest, setFeatureInterest, setSocietyFeature, type FeatureDef, type FeatureKey, type FeatureSubject } from "@function/shared";
import { Icon } from "@/components/icon";
import { Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// The society's features as a checklist, grouped (Sign-ups, Money, On the
// night…), used by the Hub's setup and its Features page. Live features
// switch on or off with one tap and save straight away (the tick shows at
// once and goes back with a message if saving fails). Coming-soon features
// can be marked "We want this" so the Function team knows what to build.
export function FeatureChecklist({ societyId, subject, university }: { societyId: string; subject: FeatureSubject; university: string }) {
  const queryClient = useQueryClient();
  const interest = useQuery({ queryKey: ["feature-interest", societyId], queryFn: () => loadFeatureInterest(supabase, societyId) });
  // What you've tapped, shown straight away while it saves.
  const [shown, setShown] = useState<Partial<Record<FeatureKey, boolean>>>({});
  const [wantShown, setWantShown] = useState<Partial<Record<FeatureKey, boolean>>>({});
  const [saving, setSaving] = useState<Set<FeatureKey>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const isOn = (key: FeatureKey) => shown[key] ?? hasFeature(subject, key);
  const isWanted = (key: FeatureKey) => wantShown[key] ?? interest.data?.has(key) ?? false;
  const busy = (key: FeatureKey, on: boolean) => setSaving((s) => { const next = new Set(s); if (on) next.add(key); else next.delete(key); return next; });

  async function toggle(def: FeatureDef) {
    if (saving.has(def.key)) return;
    const next = !isOn(def.key);
    setError(null);
    setShown((s) => ({ ...s, [def.key]: next }));
    busy(def.key, true);
    const r = await setSocietyFeature(supabase, societyId, def.key, next);
    busy(def.key, false);
    if (r.error) {
      setShown((s) => ({ ...s, [def.key]: !next }));
      setError(`Couldn't save ${def.name}. Try again.`);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["hub", societyId] });
    void queryClient.invalidateQueries({ queryKey: ["managed", societyId] });
  }

  async function toggleWant(def: FeatureDef) {
    if (saving.has(def.key) || !interest.data) return;
    const next = !isWanted(def.key);
    setError(null);
    setWantShown((s) => ({ ...s, [def.key]: next }));
    busy(def.key, true);
    const r = await setFeatureInterest(supabase, societyId, def.key, next);
    busy(def.key, false);
    if (r.error) {
      setWantShown((s) => ({ ...s, [def.key]: !next }));
      setError("Couldn't save that. Try again.");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["feature-interest", societyId] });
  }

  return (
    <View className="gap-8" testID="feature-checklist">
      {error && <T variant="semibold" className="rounded-xl bg-danger/10 px-4 py-3 text-danger" testID="feature-error">{error}</T>}
      {FEATURE_GROUPS.map((group) => {
        const defs = FEATURES.filter((f) => f.group === group).sort((a, b) => (a.status === b.status ? 0 : a.status === "live" ? -1 : 1));
        if (defs.length === 0) return null;
        return (
          <View key={group} className="gap-3">
            <T variant="display-bold" className="text-lg">{group}</T>
            {defs.map((def) =>
              def.status === "live" ? (
                <LiveRow key={def.key} def={def} on={isOn(def.key)} unavailable={def.key === "event_admin" && !eventAdminAvailable(university)} onPress={() => void toggle(def)} />
              ) : (
                <SoonRow key={def.key} def={def} wanted={isWanted(def.key)} ready={!!interest.data} onPress={() => void toggleWant(def)} />
              ),
            )}
          </View>
        );
      })}
    </View>
  );
}

function LiveRow({ def, on, unavailable, onPress }: { def: FeatureDef; on: boolean; unavailable: boolean; onPress: () => void }) {
  const ticked = on && !unavailable;
  return (
    <Pressable
      onPress={onPress}
      disabled={unavailable}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked, disabled: unavailable }}
      aria-checked={ticked}
      className={`min-h-[64px] flex-row items-start gap-4 rounded-2xl border px-4 py-4 ${ticked ? "border-brand bg-brand-soft" : "border-line bg-surface"} ${unavailable ? "opacity-60" : "active:opacity-90"}`}
      testID={`feature-${def.key}`}
    >
      <View className={`mt-0.5 h-7 w-7 items-center justify-center rounded-lg border-2 ${ticked ? "border-brand bg-brand" : "border-line bg-surface"}`}>
        {ticked && <Icon name="checkmark" size={18} color="#ffffff" />}
      </View>
      <View className="flex-1 gap-1">
        <T variant="semibold" className="text-base">{def.name}</T>
        <Muted className="text-sm">{def.description}</Muted>
        <Muted className="text-xs">For example: {def.example}</Muted>
        {unavailable && <T variant="semibold" className="mt-1 text-sm text-muted" testID="event-admin-unavailable">Event admin isn&apos;t available for your uni yet</T>}
      </View>
    </Pressable>
  );
}

function SoonRow({ def, wanted, ready, onPress }: { def: FeatureDef; wanted: boolean; ready: boolean; onPress: () => void }) {
  return (
    <View className="min-h-[64px] gap-2 rounded-2xl border border-line bg-surface px-4 py-4" testID={`soon-${def.key}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        <T variant="semibold" className="text-base">{def.name}</T>
        <View className="rounded-full border border-line px-2.5 py-0.5">
          <T variant="bold" className="text-xs text-muted">Coming soon</T>
        </View>
      </View>
      <Muted className="text-sm">{def.description}</Muted>
      <Muted className="text-xs">For example: {def.example}</Muted>
      <Pressable
        onPress={onPress}
        disabled={!ready}
        accessibilityRole="switch"
        accessibilityState={{ checked: wanted, disabled: !ready }}
        aria-checked={wanted}
        className={`mt-1 min-h-[44px] flex-row items-center gap-2 self-start rounded-full border px-4 py-2 ${wanted ? "border-brand bg-brand" : "border-line bg-surface"} ${ready ? "active:opacity-90" : "opacity-50"}`}
        testID={`want-${def.key}`}
      >
        <Icon name={wanted ? "heart" : "heart-outline"} size={16} color={wanted ? "#ffffff" : "#DA291C"} />
        <T variant="semibold" className={`text-sm ${wanted ? "text-brand-ink" : ""}`}>We want this</T>
      </Pressable>
      {wanted && <T variant="semibold" className="text-sm text-ok" testID={`wanted-${def.key}`}>We&apos;ll tell you when it&apos;s ready</T>}
    </View>
  );
}
