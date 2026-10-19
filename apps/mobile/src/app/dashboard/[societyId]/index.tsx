import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryLabel, formatEventTime, hasEnded, initialOf, isLive, loadManagedSociety, nowMs, updateSociety, type MotiveEvent, type Society } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { pickPhotos, type Picked } from "@/components/photos/pick-photos";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// One society's dashboard: its events (upcoming and past) and its details.
export default function SocietyDashboardScreen() {
  const { societyId, posted } = useLocalSearchParams<{ societyId: string; posted?: string }>();
  const { session } = useSession();
  const page = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  const now = nowMs();

  if (!session) return <Screen><Muted>Log in to manage your society.</Muted></Screen>;
  if (page.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  const d = page.data;
  if (!d) return <Screen><Heading>Not found</Heading><Muted className="mt-2">You don&apos;t run this society, or it doesn&apos;t exist.</Muted></Screen>;
  const upcoming = d.events.filter((e) => !hasEnded(e.ends_at, now));
  const past = d.events.filter((e) => hasEnded(e.ends_at, now)).reverse();

  return (
    <Screen>
      <Heading>{d.society.name}</Heading>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Link href={`/dashboard/${societyId}/members` as never} asChild>
          <Button variant="ghost" testID="members-link">Members{d.pendingCount ? ` · ${d.pendingCount} waiting` : ""}</Button>
        </Link>
        <Link href={`/dashboard/${societyId}/events/new` as never} asChild>
          <Button testID="post-event">+ Post an event</Button>
        </Link>
      </View>
      {posted && <T variant="semibold" className="mt-6 rounded-xl bg-ok/10 px-4 py-3 text-ok" testID="posted">Your event is live on Function. Share its link to get more people going.</T>}

      <T variant="display" className="mt-8 text-xl">Upcoming</T>
      {upcoming.length === 0 ? <Muted className="mt-3">No upcoming events. Post one and it appears on the map straight away.</Muted> : <View className="mt-3 gap-3">{upcoming.map((e) => <EventRow key={e.id} event={e} live={isLive(e.starts_at, e.ends_at, now)} />)}</View>}
      {past.length > 0 && (
        <View className="mt-10 opacity-70">
          <T variant="display" className="text-xl">Past</T>
          <View className="mt-3 gap-3">{past.slice(0, 20).map((e) => <EventRow key={e.id} event={e} live={false} />)}</View>
        </View>
      )}

      <T variant="display" className="mt-12 text-xl">Society details</T>
      <Muted className="mb-4 mt-1">
        Shown on your public page:{" "}
        <Link href={`/s/${d.society.slug}` as never} asChild>
          <T variant="semibold" className="text-brand">/s/{d.society.slug}</T>
        </Link>
      </Muted>
      <Card>
        <SocietyForm society={d.society} />
      </Card>
    </Screen>
  );
}

function EventRow({ event, live }: { event: MotiveEvent; live: boolean }) {
  return (
    <Card className="gap-3" testID={`dash-event-${event.id}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        {live && <Pill box="bg-live" text="text-white">LIVE</Pill>}
        {event.is_cancelled && <Pill box="bg-danger/10" text="text-danger">Cancelled</Pill>}
        {event.is_hidden && <Pill box="bg-danger/10" text="text-danger">Hidden by Function</Pill>}
        <T variant="display-bold" className="flex-1 text-lg">{event.title}</T>
      </View>
      <Muted className="text-sm">{formatEventTime(event.starts_at, event.ends_at)} · {categoryLabel(event.category)}</Muted>
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-row items-baseline gap-1">
          <T variant="display-bold" className="text-2xl">{event.going_count}</T>
          <Muted className="text-xs">going</Muted>
        </View>
        <View className="flex-row gap-4">
          <Link href={`/e/${event.id}` as never} asChild><Pressable><T variant="semibold" className="text-sm text-muted">View</T></Pressable></Link>
          <Link href={`/dashboard/${event.society_id}/events/${event.id}/edit` as never} asChild><Pressable testID="edit-event"><T variant="semibold" className="text-sm text-muted">Edit</T></Pressable></Link>
          <Link href={`/dashboard/${event.society_id}/events/${event.id}` as never} asChild><Pressable testID="manage-event"><T variant="semibold" className="text-sm text-brand">Manage</T></Pressable></Link>
        </View>
      </View>
    </Card>
  );
}

function Pill({ children, box, text }: { children: string; box: string; text: string }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${box}`}>
      <T variant="bold" className={`text-xs ${text}`}>{children}</T>
    </View>
  );
}

function SocietyForm({ society }: { society: Society }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(society.name);
  const [description, setDescription] = useState(society.description ?? "");
  const [instagram, setInstagram] = useState(society.instagram ?? "");
  const [website, setWebsite] = useState(society.website ?? "");
  const [logo, setLogo] = useState<Picked | null>(null);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    const r = await updateSociety(supabase, society.id, { name, description, instagram, website }, logo ? { bytes: logo.bytes, type: logo.type } : null);
    setPending(false);
    setState(r.error ? { error: r.error } : { saved: true });
    if (!r.error) {
      setLogo(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["managed", society.id] }), queryClient.invalidateQueries({ queryKey: ["society", society.slug] }), queryClient.invalidateQueries({ queryKey: ["societies-tab"] })]);
    }
  }
  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-4">
        {society.logo_url ? (
          <Image source={{ uri: society.logo_url }} style={{ width: 64, height: 64, borderRadius: 16 }} contentFit="cover" />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft">
            <T variant="display-bold" className="text-2xl text-brand">{initialOf(society.name)}</T>
          </View>
        )}
        <View className="flex-1">
          <Label>Logo</Label>
          <Button
            variant="ghost"
            className="self-start py-2"
            onPress={async () => {
              const [picked] = await pickPhotos({ count: 1, aspect: 1, output: 512 });
              if (picked) setLogo(picked);
            }}
            testID="soc-logo"
          >
            {logo ? "Logo chosen ✓" : "Choose a logo"}
          </Button>
        </View>
      </View>
      <View>
        <Label>Name</Label>
        <Input value={name} onChangeText={setName} maxLength={120} testID="soc-name" />
      </View>
      <View>
        <Label>About</Label>
        <Input value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="One or two sentences about your society." className="min-h-20" style={{ textAlignVertical: "top" }} testID="soc-description" />
      </View>
      <View className="flex-row flex-wrap gap-5">
        <View className="min-w-[45%] flex-1">
          <Label>Instagram</Label>
          <Input value={instagram} onChangeText={setInstagram} autoCapitalize="none" placeholder="@yoursociety" testID="soc-instagram" />
        </View>
        <View className="min-w-[45%] flex-1">
          <Label>Website</Label>
          <Input value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="https://…" testID="soc-website" />
        </View>
      </View>
      {state.error && <T variant="semibold" className="text-sm text-danger">{state.error}</T>}
      {state.saved && !pending && <T variant="semibold" className="text-sm text-ok">Saved.</T>}
      <Button variant="ghost" className="self-start" onPress={() => void save()} disabled={pending} testID="soc-save">{pending ? "Saving…" : "Save society details"}</Button>
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback="/dashboard" className="mb-4" />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
