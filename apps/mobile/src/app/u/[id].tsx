import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { blockUser, formatEventTime, iBlocked, loadPublicProfile, promptById, unblockUser } from "@function/shared";
import { BackButton } from "@/components/back-button";
import { Avatar } from "@/components/avatar";
import { CompleteProfileCard } from "@/components/complete-profile-card";
import { AvatarZoom, FriendButton, PhotoGallery, TwoTruthsGame } from "@/components/profile/people";
import { PushPromptCard } from "@/components/push-prompt";
import { MoreMenu } from "@/components/safety/more-menu";
import { ReportSheet } from "@/components/safety/report-sheet";
import { confirmAction } from "@/lib/confirm";
import { Button, Card, Muted, T } from "@/components/ui";
import { UniTag } from "@/components/uni-tag";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// Someone's profile: photo, prompts, societies, their 5 photos, what
// they're hosting, and the friend button.
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const myId = session?.user.id ?? null;
  const page = useQuery({ queryKey: ["person", id, myId], queryFn: () => loadPublicProfile(supabase, myId!, id), enabled: !!id && !!myId });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["person", id] });
  const [reporting, setReporting] = useState(false);
  // A profile that doesn't load: did you block them? (If they blocked you,
  // it just isn't available: we never say so.) The Function team still load
  // everyone, so for them it's asked when either of you blocked the other.
  const blocked = useQuery({ queryKey: ["i-blocked", id, myId], queryFn: () => iBlocked(supabase, id), enabled: !!id && !!myId && page.isSuccess && (!page.data || page.data.isBlocked) });

  async function block(name: string) {
    if (!(await confirmAction(`Block ${name}?`, "You won't see each other's profiles or messages, and they can't add or message you. They aren't told.", "Block"))) return;
    await blockUser(supabase, id);
    void queryClient.invalidateQueries();
  }
  async function unblock() {
    await unblockUser(supabase, myId!, id);
    void queryClient.invalidateQueries();
  }

  if (!session) {
    return (
      <Screen>
        <Card className="flex-row flex-wrap items-center justify-between gap-3">
          <T variant="semibold">Log in to see profiles.</T>
          <Link href={{ pathname: "/login", params: { next: `/u/${id}` } }} asChild>
            <Button>Log in</Button>
          </Link>
        </Card>
      </Screen>
    );
  }
  if (page.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
  const p = page.data;
  if (!p || (p.isBlocked && blocked.data)) {
    if (!p && blocked.isPending) return <Screen><Muted>Loading…</Muted></Screen>;
    return (
      <Screen>
        {blocked.data ? (
          <Card className="items-center gap-3" testID="blocked-by-me">
            <T variant="title3">You&apos;ve blocked this person</T>
            <Muted className="text-center">You won&apos;t see each other&apos;s profiles or messages until you unblock them.</Muted>
            <Button variant="ghost" onPress={() => void unblock()} testID="unblock">Unblock</Button>
          </Card>
        ) : (
          <Card className="items-center gap-2" testID="profile-unavailable">
            <T variant="title3">This profile isn&apos;t available</T>
            <Muted className="text-center">It may have been deleted, or you can&apos;t see it.</Muted>
          </Card>
        )}
      </Screen>
    );
  }
  const { person, relation, isBlocked } = p;
  const self = relation === "self";

  return (
    <Screen menu={self ? null : (
      <MoreMenu
        label={`Options for ${person.name}`}
        items={[
          { label: `Report ${person.name}`, icon: "alert-circle-outline", onPress: () => setReporting(true), testID: "report-user" },
          { label: `Block ${person.name}`, icon: "remove-circle-outline", danger: true, onPress: () => void block(person.name), testID: "block-user" },
        ]}
      />
    )}>
      <ReportSheet target={reporting ? { kind: "user", id } : null} what={person.name} onClose={() => setReporting(false)} />
      <Card className="items-center gap-3" testID="person-card">
        <AvatarZoom name={person.name} url={person.avatar_url} size={88} />
        <View className="items-center gap-1">
          <View className="flex-row items-center gap-2">
            <T variant="display-bold" className="text-2xl">{person.name}</T>
          </View>
          {person.nickname && person.full_name && person.full_name !== person.name && <Muted testID="full-name">{person.full_name}</Muted>}
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            <UniTag id={person.university} />
            {person.graduation_year && <Muted className="text-sm">Class of {person.graduation_year}</Muted>}
          </View>
          {person.course && <Muted>{person.course}</Muted>}
        </View>
        {p.prompts.length > 0 && (
          <View className="w-full max-w-md gap-2">
            {p.prompts.map((a) => {
              const prompt = promptById(a.prompt_id)!;
              return (
                <View key={a.prompt_id} className="rounded-xl bg-brand-soft px-3.5 py-2.5" testID={`prompt-${a.prompt_id}`}>
                  <Muted className="text-xs font-sans-semibold">{prompt.text}</Muted>
                  {prompt.game && p.twoTruths ? <View className="mt-1.5"><TwoTruthsGame person={id} initial={p.twoTruths} /></View> : <T variant="semibold">{a.answer}</T>}
                </View>
              );
            })}
          </View>
        )}
        {self && p.prompts.length === 0 && (
          <Link href={"/account" as never} asChild>
            <Pressable>
              <T variant="semibold" className="text-sm text-brand">Answer a few prompts so people get a feel for you →</T>
            </Pressable>
          </Link>
        )}
        {p.mutual > 0 && <Muted className="text-sm">{p.mutual} friend{p.mutual === 1 ? "" : "s"} in common</Muted>}
        {self ? (
          <View className="flex-row flex-wrap justify-center gap-2">
            <Link href={"/account" as never} asChild>
              <Button variant="ghost" testID="edit-profile">Edit your profile</Button>
            </Link>
            <Link href={"/friends" as never} asChild>
              {/* One string, so the button shows it as its label (pieces of text side by side showed nothing). */}
              <Button variant="ghost" testID="my-friends">
                {`Friends${p.friendCount ? ` (${p.friendCount})` : ""}${p.incomingCount ? ` · ${p.incomingCount} new` : ""}`}
              </Button>
            </Link>
          </View>
        ) : isBlocked ? (
          <Muted className="text-sm font-sans-semibold">You can&apos;t add this person.</Muted>
        ) : (
          <FriendButton id={id} relation={relation} onChanged={refresh} />
        )}
        {relation === "outgoing" && myId && <PushPromptCard userId={myId} why="friend" className="w-full" />}
      </Card>
      {self && <CompleteProfileCard prompts={p.prompts.length} />}

      {p.societies.length > 0 && (
        <View className="mt-6">
          <T variant="bold" className="text-sm uppercase tracking-wide text-muted">Societies</T>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {p.societies.map((s) => (
              <Link key={s.id} href={`/s/${s.slug}` as never} asChild>
                <Pressable className="flex-row items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3">
                  <Avatar name={s.name} url={s.logo_url} size={24} />
                  <T variant="semibold" className="text-sm">{s.name}</T>
                  {s.is_committee && (
                    <View className="rounded-full bg-brand-soft px-1.5 py-0.5">
                      <T variant="bold" className="text-[10px] text-brand">Committee</T>
                    </View>
                  )}
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      )}

      {p.photos.length > 0 && (
        <View className="mt-6">
          <PhotoGallery photos={p.photos.map((x) => ({ id: x.id, url: x.url }))} canReport={!self} />
        </View>
      )}
      {self && p.photos.length === 0 && (
        <Card className="mt-6">
          <Muted className="text-sm">
            Add up to 5 photos of things you like or get up to.{" "}
            <Link href={"/account" as never} asChild>
              <T variant="semibold" className="text-sm text-brand">Add photos →</T>
            </Link>
          </Muted>
        </Card>
      )}

      {p.events.length > 0 && (
        <View className="mt-8">
          <T variant="display" className="text-xl">Hosting</T>
          <View className="mt-3 gap-2">
            {p.events.map((e) => (
              <Link key={e.id} href={`/e/${e.id}` as never} asChild>
                <Pressable>
                  <Card className="flex-row items-center justify-between gap-3 py-3">
                    <View className="flex-1">
                      <T variant="bold">{e.title}</T>
                      <Muted className="text-sm">{formatEventTime(e.starts_at, e.ends_at)}{e.location_note ? ` · ${e.location_note}` : ""}</Muted>
                    </View>
                    {e.visibility === "friends" && (
                      <View className="rounded-full bg-brand-soft px-2.5 py-0.5">
                        <T variant="bold" className="text-xs text-brand">Friends only</T>
                      </View>
                    )}
                  </Card>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

function Screen({ children, menu }: { children: React.ReactNode; menu?: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="mx-auto w-full max-w-2xl px-4 py-10">
        <View className="z-10 mb-4 flex-row items-start justify-between">
          <BackButton fallback="/(tabs)/me" />
          {menu}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
