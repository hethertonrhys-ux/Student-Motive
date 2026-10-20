import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import {
  agreeToFounding,
  eventAdminAvailable,
  eventLink,
  finishOnboarding,
  FOUNDING_FUNCTION_COMMITS,
  FOUNDING_SOCIETY_COMMITS,
  FOUNDING_STAY_ACTIVE,
  hasFeature,
  HUB_STEP_LABELS,
  hubSteps,
  isHubStep,
  loadEvent,
  nextHubStep,
  pretickedFeatures,
  previousHubStep,
  setSocietyFeatures,
  setSocietyType,
  societyLink,
  SOCIETY_TYPES,
  storyLines,
  uniShort,
  updateSociety,
  whatsappShareUrl,
  whatsappText,
  type HubSociety,
  type HubStep,
  type StoryEvent,
} from "@function/shared";
import { BackButton } from "@/components/back-button";
import { FeatureChecklist } from "@/components/hub/feature-checklist";
import { BigButton, HubFrame, HubGate, SocietyLogo, useWide } from "@/components/hub/hub-layout";
import { ManagersPanel } from "@/components/hub/managers";
import { ProgressBar } from "@/components/hub/progress-bar";
import { StoryCard } from "@/components/hub/story-card";
import { Icon } from "@/components/icon";
import { pickPhotos, type Picked } from "@/components/photos/pick-photos";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

type IconName = ComponentProps<typeof Icon>["name"];
const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));

// The Society Hub's setup: one decision per screen, with a progress bar.
// Welcome, check your page, pick your type, choose features, the Founding
// Society agreement (only for Founding Societies), add your committee, post
// your first event, and share it. The step is in the address (?step=…), so
// refreshing keeps your place, and the back arrow (and the browser's or
// phone's back) goes to the step before.
// Everything is filled in from the society's import; typing is only needed
// for what's missing.
export default function HubSetupScreen() {
  const { societyId } = useLocalSearchParams<{ societyId: string }>();
  return <HubGate societyId={societyId}>{(hub) => <Wizard hub={hub} />}</HubGate>;
}

function Wizard({ hub }: { hub: HubSociety }) {
  const params = useLocalSearchParams<{ step?: string; event?: string; draft?: string }>();
  const router = useRouter();
  const wide = useWide();
  const steps = hubSteps({ isFounding: hub.society.is_founding });
  const asked: HubStep = isHubStep(params.step) ? params.step : "welcome";
  // The Founding step for a society that isn't Founding: the step after it.
  const step: HubStep = steps.includes(asked) ? asked : "committee";
  const index = steps.indexOf(step);
  const back = previousHubStep(steps, step);
  const id = hub.society.id;
  // Each step is its own page in the history, so the browser's back button
  // and a phone's back go to the step before.
  const go = (next: HubStep) => router.push({ pathname: "/hub/[societyId]/setup", params: { societyId: id, step: next } } as never);
  const next = () => {
    const n = nextHubStep(steps, step);
    if (n) go(n);
  };

  const body: Record<HubStep, () => ReactNode> = {
    welcome: () => <WelcomeStep hub={hub} onNext={next} />,
    page: () => <PageStep hub={hub} onNext={next} />,
    type: () => <TypeStep hub={hub} onNext={next} />,
    features: () => <FeaturesStep hub={hub} onNext={next} />,
    founding: () => <FoundingStep hub={hub} onNext={next} />,
    committee: () => <CommitteeStep hub={hub} onNext={next} />,
    event: () => <EventStep hub={hub} onLater={() => go("live")} />,
    live: () => <LiveStep hub={hub} eventId={typeof params.event === "string" ? params.event : null} savedAsDraft={params.draft === "1"} />,
  };

  const sidebar = wide ? (
    <View className="gap-6">
      <BackButton fallback={`/hub/${id}`} />
      <View className="flex-row items-center gap-3">
        <SocietyLogo name={hub.society.name} url={hub.society.logo_url} size={44} />
        <View className="min-w-0 flex-1">
          <T variant="bold" numberOfLines={2}>{hub.society.name}</T>
          <Muted className="text-xs">Setting up · {uniShort(hub.society.university)}</Muted>
        </View>
      </View>
      <View className="gap-1">
        {steps.map((s, i) => {
          const done = i < index;
          const current = i === index;
          return (
            <Pressable key={s} onPress={() => done && go(s)} disabled={!done} accessibilityRole="button" accessibilityState={{ selected: current, disabled: !done }} className={`min-h-[44px] flex-row items-center gap-3 rounded-xl px-3 py-2 ${current ? "bg-brand-soft" : ""}`} testID={`hub-step-${s}`}>
              {done ? (
                <Icon name="checkmark-circle" size={22} color="#DA291C" />
              ) : (
                <View className={`h-[22px] w-[22px] items-center justify-center rounded-full border ${current ? "border-brand bg-brand" : "border-line"}`}>
                  <T variant="bold" className={`text-xs ${current ? "text-brand-ink" : "text-muted"}`}>{i + 1}</T>
                </View>
              )}
              <T variant="semibold" className={`flex-1 ${current ? "text-brand" : done ? "" : "text-muted"}`}>{HUB_STEP_LABELS[s]}</T>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => router.dismissTo(`/hub/${id}` as never)} testID="hub-setup-exit"><T variant="semibold" className="text-sm text-muted">Finish later →</T></Pressable>
    </View>
  ) : undefined;

  return (
    <HubFrame sidebar={sidebar}>
      <View className="mb-8 gap-5">
        {!wide && (
          <View className="flex-row items-center gap-3">
            {back ? <StepBack onPress={() => go(back)} /> : <BackButton fallback={`/hub/${id}`} />}
            <T variant="display-bold" className="flex-1 text-lg" numberOfLines={1}>{hub.society.name}</T>
            {step !== "live" && (
              <Pressable onPress={() => router.dismissTo(`/hub/${id}` as never)} hitSlop={8} testID="hub-setup-exit"><T variant="semibold" className="text-sm text-muted">Finish later</T></Pressable>
            )}
          </View>
        )}
        {wide && back && (
          <View className="self-start">
            <StepBack onPress={() => go(back)} />
          </View>
        )}
        <ProgressBar step={index + 1} total={steps.length} />
      </View>
      <View className="gap-5" testID={`hub-step-body-${step}`}>{body[step]()}</View>
    </HubFrame>
  );
}

// Back to the step before (the same look as the usual back button).
function StepBack({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Back to the step before" hitSlop={8} className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface active:opacity-80" testID="hub-step-back">
      <Icon name="chevron-back" size={22} color={colors.ink} />
    </Pressable>
  );
}

function StepTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View className="gap-2">
      <Heading>{title}</Heading>
      {children && <Muted className="text-base">{children}</Muted>}
    </View>
  );
}

function Problem({ children }: { children: string | null }) {
  if (!children) return null;
  return <T variant="semibold" className="rounded-xl bg-danger/10 px-4 py-3 text-danger" testID="hub-step-error">{children}</T>;
}

// Refreshes everything that shows the society after a change.
function useRefreshSociety(hub: HubSociety) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["hub", hub.society.id] }),
      queryClient.invalidateQueries({ queryKey: ["managed", hub.society.id] }),
      queryClient.invalidateQueries({ queryKey: ["society", hub.society.slug] }),
      queryClient.invalidateQueries({ queryKey: ["my-hub"] }),
      queryClient.invalidateQueries({ queryKey: ["societies-tab"] }),
      queryClient.invalidateQueries({ queryKey: ["founding-progress", hub.society.id] }),
      queryClient.invalidateQueries({ queryKey: ["founding-badge", hub.society.id] }),
    ]);
}

// ---- 1. Welcome ----

function WelcomeStep({ hub, onNext }: { hub: HubSociety; onNext: () => void }) {
  return (
    <>
      <View className="items-center gap-5 py-4">
        <SocietyLogo name={hub.society.name} url={hub.society.logo_url} size={96} />
        <Heading className="text-center" testID="hub-welcome">{hub.society.name} is on Function.</Heading>
        <T variant="semibold" className="text-center text-xl">Let&apos;s get you live in 5 minutes.</T>
        <Muted className="text-center text-base">Check your page, choose the features you want, add your committee and post your first event.</Muted>
      </View>
      <BigButton onPress={onNext} testID="hub-start">Let&apos;s go</BigButton>
    </>
  );
}

// ---- 2. Check your page ----

function PageStep({ hub, onNext }: { hub: HubSociety; onNext: () => void }) {
  const s = hub.society;
  const refresh = useRefreshSociety(hub);
  const missingDescription = !s.description?.trim();
  const missingInstagram = !s.instagram?.trim();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(values: { name: string; description: string; instagram: string; website: string }, logo: Picked | null) {
    setSaving(true);
    setError(null);
    const r = await updateSociety(supabase, s.id, values, logo ? { bytes: logo.bytes, type: logo.type } : null);
    if (r.error) {
      setSaving(false);
      return setError(r.error);
    }
    await refresh();
    setSaving(false);
    onNext();
  }

  // "Looks right": saves anything typed into the missing fields, then on.
  async function looksRight() {
    if (!description.trim() && !instagram.trim()) return onNext();
    await save({ name: s.name, description: description.trim() || s.description || "", instagram: instagram.trim() || s.instagram || "", website: s.website ?? "" }, null);
  }

  if (editing) return <EditPage hub={hub} saving={saving} error={error} onSave={save} onCancel={() => { setEditing(false); setError(null); }} />;

  return (
    <>
      <StepTitle title="Check your page">{s.source === "su_directory" ? "This is what students see. We filled it in from your SU's society directory." : "This is what students see on your society's page."}</StepTitle>
      <Card className="gap-4" testID="page-preview">
        <View className="flex-row items-center gap-4">
          <SocietyLogo name={s.name} url={s.logo_url} size={64} />
          <View className="min-w-0 flex-1">
            <T variant="display-bold" className="text-xl" testID="page-name">{s.name}</T>
            <Muted className="text-sm">{uniShort(s.university)}</Muted>
          </View>
        </View>
        {missingDescription ? (
          <View>
            <Label>About your society</Label>
            <Input value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="One or two sentences about what you do." className="min-h-20" style={{ textAlignVertical: "top" }} testID="page-description" />
          </View>
        ) : (
          <T className="text-base leading-6" testID="page-about">{s.description}</T>
        )}
        {missingInstagram ? (
          <View>
            <Label>Instagram</Label>
            <Input value={instagram} onChangeText={setInstagram} autoCapitalize="none" autoCorrect={false} placeholder="@yoursociety" testID="page-instagram" />
          </View>
        ) : (
          <Row icon="logo-instagram" testID="page-insta">@{s.instagram}</Row>
        )}
        {s.website && <Row icon="globe-outline">{s.website.replace(/^https?:\/\//, "")}</Row>}
      </Card>
      <Problem>{error}</Problem>
      <BigButton onPress={() => void looksRight()} disabled={saving} testID="page-ok">{saving ? "Saving…" : "Looks right"}</BigButton>
      <Button variant="ghost" onPress={() => setEditing(true)} disabled={saving} className="min-h-[52px]" testID="page-edit">Edit</Button>
    </>
  );
}

function Row({ icon, children, testID }: { icon: IconName; children: ReactNode; testID?: string }) {
  return (
    <View className="flex-row items-center gap-2" testID={testID}>
      <Icon name={icon} size={18} color="#5e5d78" />
      <T variant="semibold" className="flex-1 text-sm" numberOfLines={1}>{children}</T>
    </View>
  );
}

function EditPage({ hub, saving, error, onSave, onCancel }: { hub: HubSociety; saving: boolean; error: string | null; onSave: (values: { name: string; description: string; instagram: string; website: string }, logo: Picked | null) => Promise<void>; onCancel: () => void }) {
  const s = hub.society;
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description ?? "");
  const [instagram, setInstagram] = useState(s.instagram ?? "");
  const [website, setWebsite] = useState(s.website ?? "");
  const [logo, setLogo] = useState<Picked | null>(null);
  return (
    <>
      <StepTitle title="Edit your page">Fix anything that&apos;s wrong. It&apos;s on your public page straight away.</StepTitle>
      <Card className="gap-5" testID="page-form">
        <View className="flex-row items-center gap-4">
          <SocietyLogo name={name || s.name} url={s.logo_url} size={64} />
          <Button
            variant="ghost"
            className="min-h-[48px]"
            onPress={async () => {
              const [picked] = await pickPhotos({ count: 1, aspect: 1, output: 512 });
              if (picked) setLogo(picked);
            }}
            testID="page-logo"
          >
            {logo ? "New logo chosen" : s.logo_url ? "Change logo" : "Add a logo"}
          </Button>
        </View>
        <View>
          <Label>Name</Label>
          <Input value={name} onChangeText={setName} maxLength={120} testID="page-edit-name" />
        </View>
        <View>
          <Label>About your society</Label>
          <Input value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="One or two sentences about what you do." className="min-h-20" style={{ textAlignVertical: "top" }} testID="page-edit-description" />
        </View>
        <View>
          <Label>Instagram</Label>
          <Input value={instagram} onChangeText={setInstagram} autoCapitalize="none" autoCorrect={false} placeholder="@yoursociety" testID="page-edit-instagram" />
        </View>
        <View>
          <Label>Website</Label>
          <Input value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" placeholder="https://…" testID="page-edit-website" />
        </View>
      </Card>
      <Problem>{error}</Problem>
      <BigButton onPress={() => void onSave({ name, description, instagram, website }, logo)} disabled={saving} testID="page-save">{saving ? "Saving…" : "Save and continue"}</BigButton>
      <Button variant="ghost" onPress={onCancel} disabled={saving} className="min-h-[52px]" testID="page-cancel">Cancel</Button>
    </>
  );
}

// ---- 3. Society type ----

function TypeStep({ hub, onNext }: { hub: HubSociety; onNext: () => void }) {
  const wide = useWide();
  const refresh = useRefreshSociety(hub);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = hub.society.society_type ?? null;

  async function pick(value: (typeof SOCIETY_TYPES)[number]["value"]) {
    if (saving) return;
    setSaving(value);
    setError(null);
    // A Function admin looking through the setup doesn't choose for the committee.
    const r = value === current || !hub.isCommittee ? {} : await setSocietyType(supabase, hub.society.id, value);
    if (r.error) {
      setSaving(null);
      return setError(r.error);
    }
    // The features step pre-ticks for this type, so it needs the new type first.
    await refresh();
    setSaving(null);
    onNext();
  }

  return (
    <>
      <StepTitle title="What kind of society are you?">We&apos;ll tick the features that suit you. You can change them next.</StepTitle>
      <View className={wide ? "flex-row flex-wrap gap-3" : "gap-3"}>
        {SOCIETY_TYPES.map((t) => {
          const selected = (saving ?? current) === t.value;
          return (
            <Pressable
              key={t.value}
              onPress={() => void pick(t.value)}
              disabled={!!saving}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: !!saving }}
              aria-checked={selected}
              className={`min-h-[72px] flex-row items-center gap-4 rounded-2xl border-2 px-4 py-4 ${selected ? "border-brand bg-brand-soft" : "border-line bg-surface"} ${wide ? "min-w-[45%] flex-1" : ""} active:opacity-90`}
              testID={`type-${t.value}`}
            >
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-brand-soft">
                <Icon name={t.icon as IconName} size={26} color="#DA291C" />
              </View>
              <View className="flex-1">
                <T variant="semibold" className="text-base">{t.label}</T>
                <Muted className="text-sm">{t.description}</Muted>
              </View>
              {saving === t.value && <Muted className="text-sm">Saving…</Muted>}
            </Pressable>
          );
        })}
      </View>
      <Problem>{error}</Problem>
    </>
  );
}

// ---- 4. Features ----

function FeaturesStep({ hub, onNext }: { hub: HubSociety; onNext: () => void }) {
  const queryClient = useQueryClient();
  const rows = hub.features.features;
  // A society that hasn't chosen any features yet: save what's ticked
  // (its type's defaults) once, so what it sees is what's saved. Only for the
  // society's own managers: a Function admin looking through the setup sees
  // the pre-ticks without saving them.
  const needsSaving = hub.isCommittee && Array.isArray(rows) && rows.length === 0;
  const [saved, setSaved] = useState(!needsSaving);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const id = hub.society.id;
  const subject = hub.features;
  useEffect(() => {
    if (!needsSaving || started.current) return;
    started.current = true;
    void setSocietyFeatures(supabase, id, pretickedFeatures(subject)).then(async (r) => {
      if (r.error) setError("Couldn't save your features. Check them below.");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["hub", id] }), queryClient.invalidateQueries({ queryKey: ["managed", id] })]);
      setSaved(true);
    });
  }, [needsSaving, id, subject, queryClient]);
  const type = SOCIETY_TYPES.find((t) => t.value === hub.society.society_type);

  return (
    <>
      <StepTitle title="Choose your features">{type ? `We've ticked the ones that suit a ${type.label.toLowerCase()} society.` : "These are the tools your society uses."} Tap to switch one on or off; it saves straight away.</StepTitle>
      <Problem>{error}</Problem>
      {saved ? <FeatureChecklist societyId={id} subject={subject} university={hub.society.university} /> : <Muted>Loading…</Muted>}
      <BigButton onPress={onNext} disabled={!saved} testID="features-continue">Continue</BigButton>
    </>
  );
}

// ---- 5. Founding Society (only for Founding Societies) ----

function FoundingStep({ hub, onNext }: { hub: HubSociety; onNext: () => void }) {
  const refresh = useRefreshSociety(hub);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setSaving(true);
    setError(null);
    const r = await agreeToFounding(supabase, hub.society.id);
    if (r.error) {
      setSaving(false);
      return setError(r.error);
    }
    await refresh();
    setSaving(false);
    onNext();
  }

  return (
    <>
      <StepTitle title="Founding Society">You&apos;re one of the first societies on Function. Here&apos;s what we each commit to.</StepTitle>
      <Commitments title="Function commits to" lines={FOUNDING_FUNCTION_COMMITS} testID="founding-function" />
      <Commitments title="Your society commits to" lines={FOUNDING_SOCIETY_COMMITS} testID="founding-society" />
      <Muted className="text-base" testID="founding-stay-active">{FOUNDING_STAY_ACTIVE}</Muted>
      <Problem>{error}</Problem>
      {hub.agreement ? (
        <>
          <T variant="semibold" className="rounded-xl bg-ok/10 px-4 py-3 text-ok" testID="founding-agreed">You&apos;re a Founding Society since {day(hub.agreement.agreed_at)}.</T>
          <BigButton onPress={onNext} testID="founding-continue">Continue</BigButton>
        </>
      ) : (
        <>
          <BigButton onPress={() => void agree()} disabled={saving} testID="founding-agree">{saving ? "Saving…" : "We're in"}</BigButton>
          <Button variant="ghost" onPress={onNext} disabled={saving} className="min-h-[52px]" testID="founding-later">Decide later</Button>
        </>
      )}
    </>
  );
}

function Commitments({ title, lines, testID }: { title: string; lines: string[]; testID: string }) {
  return (
    <Card className="gap-3" testID={testID}>
      <T variant="display-bold" className="text-lg">{title}</T>
      {lines.map((line) => (
        <View key={line} className="flex-row items-start gap-3">
          <Icon name="checkmark-circle" size={22} color="#DA291C" />
          <T className="flex-1 text-base">{line}</T>
        </View>
      ))}
    </Card>
  );
}

// ---- 6. Your committee ----

function CommitteeStep({ hub, onNext }: { hub: HubSociety; onNext: () => void }) {
  return (
    <>
      <StepTitle title="Add your committee">Everyone you add can post events, edit your page and choose features.</StepTitle>
      <ManagersPanel societyId={hub.society.id} />
      <BigButton onPress={onNext} testID="committee-continue">Continue</BigButton>
      <Button variant="ghost" onPress={onNext} className="min-h-[52px]" testID="committee-skip">Skip for now</Button>
    </>
  );
}

// ---- 7. Your first event ----

function EventStep({ hub, onLater }: { hub: HubSociety; onLater: () => void }) {
  // LSE societies with Event admin on: the form asks "Has the SU approved this event?" (Part 5).
  const withAdmin = hasFeature(hub.features, "event_admin") && eventAdminAvailable(hub.society.university);
  return (
    <>
      <StepTitle title="Post your first event">
        {withAdmin
          ? "Function prepares the SU paperwork as you go; your committee checks and submits it. It goes live once the SU has approved it."
          : "It goes on the map and your society page straight away, and your members hear about it."}
      </StepTitle>
      <Card className="gap-3">
        {["What it is and when", "Where it is", "How people sign up"].map((line) => (
          <View key={line} className="flex-row items-center gap-3">
            <Icon name="checkmark-circle-outline" size={20} color="#DA291C" />
            <T className="flex-1 text-base">{line}</T>
          </View>
        ))}
      </Card>
      <Link href={`/dashboard/${hub.society.id}/events/new?from=hub` as never} asChild>
        <BigButton testID="hub-post-event">Post an event</BigButton>
      </Link>
      <Button variant="ghost" onPress={onLater} className="min-h-[52px]" testID="hub-event-later">I&apos;ll do it later</Button>
    </>
  );
}

// ---- 8. You're live ----

function LiveStep({ hub, eventId, savedAsDraft }: { hub: HubSociety; eventId: string | null; savedAsDraft: boolean }) {
  const s = hub.society;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const event = useQuery({ queryKey: ["event", eventId], queryFn: () => loadEvent(supabase, eventId!), enabled: !!eventId });
  const [copied, setCopied] = useState<"bio" | "event" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [story, setStory] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // The setup is done: recorded once, by the society's own managers (a
  // Function admin looking through it doesn't count).
  const finishing = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (finishing.current || !hub.isCommittee || s.onboarded_at) return;
    finishing.current = finishOnboarding(supabase, s.id);
  }, [hub.isCommittee, s.id, s.onboarded_at]);

  const pageLink = societyLink(SITE_URL, s.slug);
  const e = event.data;
  // A draft (waiting for "SU approved") has no public link yet: share the society's page instead.
  const draft = savedAsDraft || e?.is_draft === true;
  const storyEvent: StoryEvent | null = e && !draft ? { id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, place: e.venues?.name ?? e.location_note } : null;
  const society = { name: s.name, slug: s.slug };

  async function copy(what: "bio" | "event", text: string) {
    try {
      await Clipboard.setStringAsync(text);
      setCopyFailed(false);
      setCopied(what);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopyFailed(true);
    }
  }

  async function done() {
    setLeaving(true);
    await finishing.current;
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["hub", s.id] }), queryClient.invalidateQueries({ queryKey: ["my-hub"] })]);
    // Back to the Hub home underneath (or open it if the setup was opened directly).
    router.dismissTo(`/hub/${s.id}` as never);
  }

  return (
    <>
      <View className="items-center gap-3 py-2">
        <Icon name="checkmark-circle" size={64} color="#DA291C" />
        <Heading className="text-center" testID="hub-live">You&apos;re live</Heading>
        <Muted className="text-center text-base">Now tell people where to find you.</Muted>
      </View>

      {eventId && draft && (
        <Card className="gap-2" testID="hub-event-draft">
          <T variant="semibold" className="text-base">Saved as a draft. It goes live once your committee ticks &ldquo;SU approved&rdquo;.</T>
          {e && <Muted className="text-sm">{e.title}</Muted>}
          <Muted className="text-sm">Until then, share your society&apos;s page.</Muted>
        </Card>
      )}

      {eventId && !draft && (
        <Card className="gap-2" testID="hub-event-published">
          {event.isPending ? (
            <Muted>Loading…</Muted>
          ) : (
            <>
              <T variant="semibold" className="text-base">Published, here&apos;s your link</T>
              {e && <Muted className="text-sm">{e.title}</Muted>}
              <View className="rounded-xl border border-line bg-bg px-3 py-2">
                <T selectable className="text-sm" testID="hub-event-link">{eventLink(SITE_URL, eventId)}</T>
              </View>
              <Button variant="ghost" onPress={() => void copy("event", eventLink(SITE_URL, eventId))} className="min-h-[48px] self-start" testID="copy-event-link">{copied === "event" ? "Copied" : "Copy event link"}</Button>
            </>
          )}
        </Card>
      )}

      <View className="gap-2">
        <BigButton onPress={() => void copy("bio", pageLink)} testID="copy-bio-link">
          {copied === "bio" ? "Copied" : "Copy link for Instagram bio"}
        </BigButton>
        <Muted className="text-center text-sm" selectable testID="bio-link">{pageLink}</Muted>
        {copyFailed && <Muted className="text-center text-sm">Couldn&apos;t copy here. Select the link to copy it.</Muted>}
      </View>

      <Button variant="ghost" onPress={() => setStory((v) => !v)} className="min-h-[52px]" testID="share-story">
        <Icon name="phone-portrait-outline" size={20} color={colors.ink} />
        <T variant="semibold" className="text-base">Share to your story</T>
      </Button>
      {story && <StoryCard lines={storyLines(storyEvent, society, SITE_URL)} fileName={`${s.slug}-story.png`} />}

      <Button variant="ghost" onPress={() => void Linking.openURL(whatsappShareUrl(whatsappText(storyEvent, society, SITE_URL)))} className="min-h-[52px]" testID="share-whatsapp">
        <Icon name="logo-whatsapp" size={20} color={colors.ink} />
        <T variant="semibold" className="text-base">Share on WhatsApp</T>
      </Button>

      <BigButton onPress={() => void done()} disabled={leaving} className="mt-4" testID="hub-done">Go to your Hub</BigButton>
    </>
  );
}
