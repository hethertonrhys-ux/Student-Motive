import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { addSociety, allowEmail, approveClaim, DEFAULT_UNI, deleteReportedMessage, dismissPhotoReports, dismissReport, dismissSocialReport, hideReportedEvent, hideReportedSocialEvent, loadAdmin, loadSocialReports, rejectClaim, removeAllowedEmail, removeReportedPhoto, SOCIETY_KINDS, UNIVERSITIES } from "@function/shared";
import { AdminTabs } from "@/components/admin-tabs";
import { MediaPreview, MediaViewer } from "@/components/chat/media";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Select } from "@/components/select";
import { Button, Card, Heading, Input, Label, Muted, T } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

// The Function team's panel, reached from the Me tab. Overview: requests to
// manage societies, reports (society events, messages, people and Social
// plans, each also emailed to help@studentfunction.com), reported photos, who
// can join, adding societies, every society.
// Users and Events have their own sections. The database refuses anyone
// who isn't an admin, so this screen being hidden is only a courtesy.
export default function AdminScreen() {
  const { profile, loading } = useProfile();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["admin"], queryFn: () => loadAdmin(supabase), enabled: !!profile?.is_admin });
  const socialReports = useQuery({ queryKey: ["admin", "social-reports"], queryFn: () => loadSocialReports(supabase), enabled: !!profile?.is_admin });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin"] });
  const [viewer, setViewer] = useState<{ kind: "photo" | "video"; url: string } | null>(null);
  const d = data.data;
  const personName = (id: string | null | undefined) => (id ? (d?.people.get(id)?.name ?? "Member") : "someone");

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10" keyboardShouldPersistTaps="handled">
        <BackButton fallback={"/(tabs)/me"} />
        <Heading className="mt-3">Admin panel</Heading>
        {loading ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : !profile?.is_admin ? (
          <Card className="mt-6"><Muted>This page is for the Function team.</Muted></Card>
        ) : !d ? (
          <Muted className="mt-6">Loading…</Muted>
        ) : (
          <>
            <AdminTabs current="overview" />
            <Section title={`Requests to manage a society (${d.claims.length})`} empty={d.claims.length === 0 ? "Nothing waiting." : undefined}>
              {d.claims.map((c) => (
                <Card key={c.id} className="gap-3" testID={`admin-claim-${c.id}`}>
                  <View>
                    <T variant="bold">{c.societies?.name} <Muted className="text-sm font-sans-semibold">· {c.societies?.university}</Muted></T>
                    <T className="text-sm">{c.profiles?.email} · {c.committee_role}</T>
                    {c.message && <Muted className="mt-1 text-sm">&ldquo;{c.message}&rdquo;</Muted>}
                  </View>
                  <View className="flex-row gap-2">
                    <Button className="py-2" onPress={() => void approveClaim(supabase, c.id).then(refresh)} testID="approve-claim">Approve</Button>
                    <Button variant="ghost" className="py-2" onPress={() => void rejectClaim(supabase, c.id).then(refresh)} testID="reject-claim">Reject</Button>
                  </View>
                </Card>
              ))}
            </Section>

            <Section title={`Reports (${d.reports.length})`} empty={d.reports.length === 0 ? "No open reports." : undefined}>
              {d.reports.map((r) => (
                <Card key={r.id} className="gap-3" testID={`admin-report-${r.id}`}>
                  <View>
                    {r.event_id ? (
                      <Link href={`/e/${r.event_id}` as never} asChild><Pressable><T variant="bold" className="text-brand">{r.events?.title ?? "Event"}</T></Pressable></Link>
                    ) : r.message_id ? (
                      <T variant="bold">Message from <T variant="bold" className="text-brand">{personName(r.messages?.sender_id)}</T></T>
                    ) : r.reported_user_id ? (
                      <Link href={`/u/${r.reported_user_id}` as never} asChild><Pressable><T variant="bold">Person: <T variant="bold" className="text-brand">{personName(r.reported_user_id)}</T></T></Pressable></Link>
                    ) : (
                      <T variant="bold">{r.societies?.name}</T>
                    )}
                    {r.messages && <T className="mt-1 rounded-lg bg-bg px-3 py-2 text-sm italic">{r.messages.deleted_at ? "(already deleted)" : `“${r.messages.body}”`}</T>}
                    {/* A reported chat photo or video: see it before deciding. */}
                    {r.messages?.media_path && !r.messages.deleted_at && (r.messages.kind === "photo" || r.messages.kind === "video") && (
                      <View className="mt-2">
                        <MediaPreview kind={r.messages.kind} url={d.mediaUrls.get(r.messages.media_path) ?? null} width={null} height={null} durationMs={null} onOpen={() => { const url = d.mediaUrls.get(r.messages!.media_path!); if (url) setViewer({ kind: r.messages!.kind as "photo" | "video", url }); }} testID={`admin-media-${r.id}`} />
                      </View>
                    )}
                    <T className="text-sm">{r.reason}</T>
                    {r.details && <Muted className="mt-1 text-sm">{r.details}</Muted>}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {r.event_id && <Button className="py-2" onPress={() => void hideReportedEvent(supabase, r.id, r.event_id!).then(refresh)} testID="hide-event">Hide event</Button>}
                    {r.message_id && !r.messages?.deleted_at && <Button className="py-2" onPress={() => void deleteReportedMessage(supabase, r.id, r.message_id!).then(refresh)} testID="delete-reported-message">Delete message</Button>}
                    <Button variant="ghost" className="py-2" onPress={() => void dismissReport(supabase, r.id).then(refresh)} testID="dismiss-report">Dismiss</Button>
                  </View>
                  {(r.reported_user_id ?? r.messages?.sender_id) && (
                    <Link href={`/admin/users?user=${r.reported_user_id ?? r.messages?.sender_id}` as never} asChild>
                      <Pressable className="self-start" testID="report-to-user"><T variant="semibold" className="text-sm text-brand">Suspend or ban {personName(r.reported_user_id ?? r.messages?.sender_id)} →</T></Pressable>
                    </Link>
                  )}
                </Card>
              ))}
            </Section>

            <MediaViewer media={viewer} onClose={() => setViewer(null)} />

            <Section title={`Reported Social plans (${socialReports.data?.length ?? 0})`} empty={!socialReports.data?.length ? "No open reports." : undefined}>
              {(socialReports.data ?? []).map((r) => (
                <Card key={r.id} className="gap-3" testID={`admin-social-report-${r.id}`}>
                  <View>
                    <Link href={`/social/${r.event_id}` as never} asChild><Pressable><T variant="bold" className="text-brand">{r.social_events?.title ?? "Social plan"}</T></Pressable></Link>
                    <T className="text-sm">{r.reason}</T>
                    {r.social_events?.is_hidden && <Muted className="mt-1 text-sm">Already hidden.</Muted>}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {!r.social_events?.is_hidden && <Button className="py-2" onPress={() => void hideReportedSocialEvent(supabase, r.id, r.event_id).then(refresh)} testID="hide-social-event">Hide plan</Button>}
                    <Button variant="ghost" className="py-2" onPress={() => void dismissSocialReport(supabase, r.id).then(refresh)} testID="dismiss-social-report">Dismiss</Button>
                  </View>
                </Card>
              ))}
            </Section>

            <Section title={`Reported photos (${d.reportedPhotos.length})`} empty={d.reportedPhotos.length === 0 ? "Nothing reported." : undefined}>
              {d.reportedPhotos.map((p) => (
                <Card key={p.photoId} className="flex-row flex-wrap items-start gap-4" testID={`admin-photo-${p.photoId}`}>
                  {p.url && <Image source={{ uri: p.url }} style={{ width: 112, height: 112, borderRadius: 12 }} contentFit="cover" />}
                  <View className="min-w-0 flex-1">
                    <T variant="bold">From <T variant="bold" className="text-brand">{personName(p.userId)}</T></T>
                    <Muted className="text-sm">{p.reasons.length} report{p.reasons.length === 1 ? "" : "s"}: {p.reasons.join(" · ")}</Muted>
                  </View>
                  <View className="flex-row gap-2">
                    <Button className="py-2" onPress={() => void removeReportedPhoto(supabase, p.photoId).then(refresh)} testID="remove-reported-photo">Remove photo</Button>
                    <Button variant="ghost" className="py-2" onPress={() => void dismissPhotoReports(supabase, p.photoId).then(refresh)}>Dismiss</Button>
                  </View>
                </Card>
              ))}
            </Section>

            <View className="mt-10">
              <T variant="display" className="text-xl">Who can join</T>
              <Muted className="mt-1 text-sm">Anyone with a London university email can log in. Add other emails here, one person at a time, or a whole domain (e.g. @qmul.ac.uk).</Muted>
              <Card className="mt-3"><AllowEmailForm onDone={refresh} /></Card>
              {d.allowed.length > 0 && (
                <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                  {d.allowed.map((a, i) => (
                    <View key={a.email} className={`flex-row items-center justify-between gap-4 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`} testID={`allowed-${a.email}`}>
                      <T variant="semibold" className="flex-1">{a.email.startsWith("@") ? `Anyone ${a.email}` : a.email}{a.note && <Muted className="text-sm">  {a.note}</Muted>}</T>
                      <LinkButton onPress={() => void removeAllowedEmail(supabase, a.email).then(refresh)} danger testID="remove-allowed">Remove</LinkButton>
                    </View>
                  ))}
                </View>
              )}
              <Muted className="mt-2 text-xs">Removing an email stops new sign-ups. Anyone who already has an account keeps it.</Muted>
            </View>

            <View className="mt-10">
              <T variant="display" className="text-xl">Add a society</T>
              <Card className="mt-3"><AddSocietyForm onDone={refresh} /></Card>
            </View>

            <View className="mt-10">
              <T variant="display" className="text-xl">All societies ({d.societies.length})</T>
              <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
                {d.societies.map((s, i) => (
                  <View key={s.id} className={`flex-row items-center justify-between gap-4 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                    <T className="flex-1">{s.name} <Muted className="text-xs">{s.kind}</Muted></T>
                    <View className="flex-row gap-4">
                      <Link href={`/s/${s.slug}` as never} asChild><Pressable><T variant="semibold" className="text-sm text-muted">Page</T></Pressable></Link>
                      <Link href={`/dashboard/${s.id}` as never} asChild><Pressable><T variant="semibold" className="text-sm text-brand">Manage</T></Pressable></Link>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode }) {
  return (
    <View className="mt-8">
      <T variant="display" className="text-xl">{title}</T>
      {empty && <Muted className="mt-2">{empty}</Muted>}
      <View className="mt-3 gap-3">{children}</View>
    </View>
  );
}

function AllowEmailForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<{ error?: string; added?: string }>({});
  const [pending, setPending] = useState(false);
  return (
    <View className="gap-3">
      <View>
        <Label>Email or domain</Label>
        <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} placeholder="jo@gmail.com or @kcl.ac.uk" testID="allow-email" />
      </View>
      <View>
        <Label>Note (optional)</Label>
        <Input value={note} onChangeText={setNote} maxLength={120} placeholder="e.g. Poker Soc guest" testID="allow-note" />
      </View>
      <Button
        className="self-start"
        disabled={pending}
        onPress={async () => {
          setPending(true);
          const r = await allowEmail(supabase, { email, note });
          setPending(false);
          setState(r);
          if (r.added) {
            setEmail("");
            setNote("");
            onDone();
          }
        }}
        testID="allow-add"
      >
        {pending ? "Adding…" : "Allow"}
      </Button>
      {state.error && <T className="text-sm text-danger">{state.error}</T>}
      {state.added && <T className="text-sm text-ok">Done. {state.added.startsWith("@") ? `Anyone with a ${state.added} email` : state.added} can now log in.</T>}
    </View>
  );
}

function AddSocietyForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("society");
  const [university, setUniversity] = useState<string>(DEFAULT_UNI);
  const [state, setState] = useState<{ error?: string; added?: string }>({});
  const [pending, setPending] = useState(false);
  return (
    <View className="gap-3">
      <View>
        <Label>Name</Label>
        <Input value={name} onChangeText={setName} placeholder="e.g. UCL Chess Society" testID="soc-add-name" />
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Label>Type</Label>
          <Select value={kind} onChange={setKind} options={SOCIETY_KINDS} accessibilityLabel="Type" testID="soc-add-kind" />
        </View>
        <View className="flex-1">
          <Label>Uni</Label>
          <Select value={university} onChange={setUniversity} options={UNIVERSITIES.map((u) => ({ value: u.id, label: u.short }))} accessibilityLabel="Uni" testID="soc-add-uni" />
        </View>
      </View>
      <Button
        className="self-start"
        disabled={pending}
        onPress={async () => {
          setPending(true);
          const r = await addSociety(supabase, { name, kind, university });
          setPending(false);
          setState(r);
          if (r.added) {
            setName("");
            onDone();
          }
        }}
        testID="soc-add"
      >
        {pending ? "Adding…" : "Add"}
      </Button>
      {state.error && <T className="text-sm text-danger">{state.error}</T>}
      {state.added && <T className="text-sm text-ok">Added {state.added}.</T>}
    </View>
  );
}
