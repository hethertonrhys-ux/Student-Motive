import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { categoryLabel, DEFAULT_CLEANUP_DAYS, deleteEvent, deleteSocietyPastEvents, eventAdminAvailable, eventLink, formatEventTime, hasEnded, hasFeature, initialOf, isLive, loadManagedSociety, nowMs, societyPastEventsSummary, updateSociety, type MotiveEvent, type Society, type SocietyPastSummary } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Icon } from "@/components/icon";
import { pickPhotos, type Picked } from "@/components/photos/pick-photos";
import { ShareButton } from "@/components/share-button";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// One society's dashboard: Post an event, its upcoming events (drafts
// marked), its details and members, then past events at the bottom (each
// can be deleted). Arriving from a claim link (?claimed=1) says you're now a
// manager; after posting (?posted=1&event=…) it says the event is live, with
// its link to copy or share right there, or (with
// &draft=1) that it was saved as a draft until the SU approves it.
export default function SocietyDashboardScreen() {
  const { societyId, posted, claimed, draft, event: postedId } = useLocalSearchParams<{ societyId: string; posted?: string; claimed?: string; draft?: string; event?: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const page = useQuery({ queryKey: ["managed", societyId], queryFn: () => loadManagedSociety(supabase, societyId), enabled: !!session && !!societyId });
  // Set once the committee has deleted past events, so the cleanup card stays put.
  const [cleaned, setCleaned] = useState(false);
  const now = nowMs();

  if (!session) return <Screen><Muted>Log in to manage your society.</Muted></Screen>;
  if (page.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  const d = page.data;
  if (!d) return <Screen><Heading>Not found</Heading><Muted className="mt-2">You don&apos;t run this society, or it doesn&apos;t exist.</Muted></Screen>;
  const upcoming = d.events.filter((e) => !hasEnded(e.ends_at, now));
  const past = d.events.filter((e) => hasEnded(e.ends_at, now)).reverse();
  // An LSE society with Event admin on: a new event is a draft until "SU approved" is ticked.
  const withAdmin = hasFeature(d.features, "event_admin") && eventAdminAvailable(d.society.university);

  return (
    <Screen>
      <Heading>{d.society.name}</Heading>
      {claimed && <T variant="semibold" className="mt-3 rounded-xl bg-ok/10 px-4 py-3 text-ok" testID="claimed">You&apos;re now a manager of {d.society.name}.</T>}
      <Link href={`/dashboard/${societyId}/events/new` as never} asChild>
        <Button className="mt-4" testID="post-event">+ Post an event</Button>
      </Link>
      {d.pendingCount > 0 && (
        <Link href={`/dashboard/${societyId}/members` as never} asChild>
          <Pressable className="mt-3 min-h-11 flex-row items-center justify-between gap-3 rounded-xl bg-brand-soft px-4 py-3 active:opacity-80" testID="members-waiting">
            <T variant="semibold" className="flex-1 text-brand">{d.pendingCount} {d.pendingCount === 1 ? "person is" : "people are"} waiting to join</T>
            <T variant="semibold" className="text-brand">Review →</T>
          </Pressable>
        </Link>
      )}
      {posted && draft === "1" ? (
        <T variant="semibold" className="mt-6 rounded-xl bg-brand-soft px-4 py-3" testID="posted-draft">Saved as a draft. It goes live once your committee ticks &ldquo;SU approved&rdquo;.</T>
      ) : posted ? (
        <View className="mt-6 gap-3 rounded-xl bg-ok/10 px-4 py-3" testID="posted">
          <T variant="semibold" className="text-ok">Your event is live on Function. Share its link to get more people going.</T>
          {postedId && <PostedLink url={eventLink(SITE_URL, postedId)} />}
        </View>
      ) : null}

      <T variant="display" className="mt-8 text-xl">Upcoming</T>
      {upcoming.length === 0 ? (
        <Muted className="mt-3" testID="no-upcoming">
          {withAdmin ? <>No upcoming events. Post one and it goes live once your committee ticks &ldquo;SU approved&rdquo;.</> : "No upcoming events. Post one and it appears on the map straight away."}
        </Muted>
      ) : <View className="mt-3 gap-3">{upcoming.map((e) => <EventRow key={e.id} event={e} live={isLive(e.starts_at, e.ends_at, now)} />)}</View>}
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

      <Link href={`/dashboard/${societyId}/members` as never} asChild>
        <Pressable className="mt-4 min-h-11 flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 active:opacity-80" testID="members-link">
          <Icon name="people-outline" size={22} color="#DA291C" />
          <View className="min-w-0 flex-1">
            <T variant="semibold">Members</T>
            <Muted className="text-xs">{d.pendingCount ? `${d.pendingCount} waiting to join` : "Approve requests and see who's in"}</Muted>
          </View>
          <Icon name="chevron-forward" size={18} color="#5e5d78" />
        </Pressable>
      </Link>

      {/* Past events last: the committee can delete any of them from the history. */}
      {(past.length > 0 || cleaned) && (
        <View className="mt-12" testID="past-events">
          {past.length > 0 && (
            <>
              <T variant="display" className="text-xl">Past events</T>
              <View className="mt-3 gap-3">
                {past.slice(0, 20).map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    live={false}
                    past
                    onDelete={() =>
                      void deleteEvent(supabase, societyId, e.id).then(() =>
                        Promise.all([queryClient.invalidateQueries({ queryKey: ["managed", societyId] }), queryClient.invalidateQueries({ queryKey: ["society"] })]),
                      )
                    }
                  />
                ))}
              </View>
            </>
          )}
          <PastCleanup societyId={societyId} onDeleted={() => setCleaned(true)} />
        </View>
      )}
    </Screen>
  );
}

// The new event's link, right under "Your event is live", to copy or share.
function PostedLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View className="gap-2">
      <T selectable className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" testID="posted-link">{url}</T>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="ghost"
          className="py-2"
          onPress={async () => {
            await Clipboard.setStringAsync(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          testID="copy-posted-link"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </Button>
        <ShareButton url={url} title="Come to our event on Function" />
      </View>
    </View>
  );
}

function EventRow({ event, live, past = false, onDelete }: { event: MotiveEvent; live: boolean; past?: boolean; onDelete?: () => void }) {
  return (
    <Card className={`gap-3 ${past ? "opacity-80" : ""}`} testID={`dash-event-${event.id}`}>
      <View className="flex-row flex-wrap items-center gap-2">
        {live && <Pill box="bg-live" text="text-white">LIVE</Pill>}
        {event.is_cancelled && <Pill box="bg-danger/10" text="text-danger">Cancelled</Pill>}
        {event.is_hidden && <Pill box="bg-danger/10" text="text-danger">Hidden by Function</Pill>}
        {event.is_draft && <Pill box="bg-brand-soft" text="text-brand" testID="draft-pill">Draft</Pill>}
        <T variant="display-bold" className="flex-1 text-lg">{event.title}</T>
      </View>
      <Muted className="text-sm">{formatEventTime(event.starts_at, event.ends_at)} · {categoryLabel(event.category)}</Muted>
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-row items-baseline gap-1">
          <T variant="display-bold" className="text-2xl">{event.going_count}</T>
          <Muted className="text-xs">going</Muted>
        </View>
        <View className="flex-row flex-wrap justify-end gap-4">
          {onDelete && (
            <LinkButton onPress={onDelete} confirmText={`Delete "${event.title}" from your history? Who went, results and its chat go with it. This can't be undone.`} danger testID={`delete-past-${event.id}`}>
              Delete
            </LinkButton>
          )}
          <Link href={`/e/${event.id}` as never} asChild><Pressable><T variant="semibold" className="text-sm text-muted">View</T></Pressable></Link>
          <Link href={`/dashboard/${event.society_id}/events/${event.id}/edit` as never} asChild><Pressable testID="edit-event"><T variant="semibold" className="text-sm text-muted">Edit</T></Pressable></Link>
          <Link href={`/dashboard/${event.society_id}/events/${event.id}` as never} asChild><Pressable testID="manage-event"><T variant="semibold" className="text-sm text-brand">Manage</T></Pressable></Link>
        </View>
      </View>
    </Card>
  );
}

// The committee clearing out old events (and their images). Counts first,
// asks, then deletes. Events with published results are kept unless the
// box is ticked.
function PastCleanup({ societyId, onDeleted }: { societyId: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"idle" | "counting" | "confirm" | "deleting" | "done">("idle");
  const [keepResults, setKeepResults] = useState(true);
  const [summary, setSummary] = useState<SocietyPastSummary | null>(null);
  const [result, setResult] = useState<{ events: number; images: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function count(keep = keepResults) {
    setError(null);
    setStep("counting");
    try {
      setSummary(await societyPastEventsSummary(supabase, societyId, DEFAULT_CLEANUP_DAYS, keep));
      setStep("confirm");
    } catch {
      setError("Couldn't count them. Try again.");
      setStep("idle");
    }
  }
  async function run() {
    setError(null);
    setStep("deleting");
    const r = await deleteSocietyPastEvents(supabase, societyId, DEFAULT_CLEANUP_DAYS, keepResults);
    if (r.error) {
      setError(r.error);
      setStep("confirm");
      return;
    }
    setResult(r.deleted ?? null);
    setStep("done");
    // Keeps this card on screen even if every past event has just gone.
    onDeleted();
    void queryClient.invalidateQueries({ queryKey: ["managed", societyId] });
  }
  function close() {
    setError(null);
    setStep("idle");
  }
  return (
    <Card className="mt-4 gap-3" testID="past-cleanup">
      <View>
        <T variant="display-bold" className="text-lg">Delete past events</T>
        <Muted className="text-sm">Removes this society&apos;s events that ended more than {DEFAULT_CLEANUP_DAYS} days ago, and their images.</Muted>
      </View>
      {step === "idle" && <Button variant="ghost" className="self-start py-2" onPress={() => void count()} testID="past-cleanup-count">See what would be deleted</Button>}
      {step === "counting" && <Muted>Counting…</Muted>}
      {(step === "confirm" || step === "deleting") && summary && (
        <View className="gap-3" testID="past-cleanup-summary">
          <T variant="semibold">{summary.events === 0 ? "Nothing to delete." : `${summary.events} ${summary.events === 1 ? "event" : "events"} (${summary.images} ${summary.images === 1 ? "image" : "images"}).`}</T>
          {(summary.skipped_results > 0 || !keepResults) && (
            <Pressable
              onPress={() => {
                if (step !== "confirm") return;
                const next = !keepResults;
                setKeepResults(next);
                void count(next);
              }}
              disabled={step !== "confirm"}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !keepResults }}
              aria-checked={!keepResults}
              className="flex-row items-center gap-3"
              testID="past-cleanup-include-results"
            >
              <View className={`h-5 w-5 items-center justify-center rounded-md border ${!keepResults ? "border-brand bg-brand" : "border-line bg-surface"}`}>{!keepResults && <T variant="bold" className="text-xs text-brand-ink">✓</T>}</View>
              <T variant="semibold" className="flex-1 text-sm">Also delete events with published results{summary.skipped_results > 0 ? ` (${summary.skipped_results})` : ""}</T>
            </Pressable>
          )}
          <View className="flex-row flex-wrap gap-2">
            {summary.events > 0 && <Button className="py-2" onPress={() => void run()} disabled={step === "deleting"} testID="past-cleanup-confirm">{step === "deleting" ? "Deleting…" : `Delete ${summary.events} for good`}</Button>}
            <Button variant="ghost" className="py-2" onPress={close} disabled={step === "deleting"} testID="past-cleanup-cancel">{summary.events > 0 ? "Keep them" : "Close"}</Button>
          </View>
          <Muted className="text-xs">This can&apos;t be undone.{!keepResults ? " Results and who-pays-who records go with the event." : ""}</Muted>
        </View>
      )}
      {step === "done" && result && (
        <View className="gap-2">
          <T variant="semibold" className="text-ok" testID="past-cleanup-done">Deleted {result.events} {result.events === 1 ? "event" : "events"} and {result.images} {result.images === 1 ? "image" : "images"}.</T>
          <Button variant="ghost" className="self-start py-2" onPress={close}>Done</Button>
        </View>
      )}
      {error && <T variant="semibold" className="text-sm text-danger">{error}</T>}
    </Card>
  );
}

function Pill({ children, box, text, testID }: { children: string; box: string; text: string; testID?: string }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${box}`} testID={testID}>
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
      // The Society Hub shows the page too (its "Your page" card and header).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["managed", society.id] }),
        queryClient.invalidateQueries({ queryKey: ["society", society.slug] }),
        queryClient.invalidateQueries({ queryKey: ["societies-tab"] }),
        queryClient.invalidateQueries({ queryKey: ["hub", society.id] }),
        queryClient.invalidateQueries({ queryKey: ["my-hub"] }),
      ]);
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
