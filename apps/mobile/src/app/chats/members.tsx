import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { addBackToThread, loadThreadInfo, loadThreadMembers, removeFromThread, setThreadAdmin, type ThreadMember } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { LinkButton } from "@/components/event/panels";
import { Card, Heading, Muted, Pill, Screen, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/session";

// A group chat's members (/chats/members?thread=<id>): names and photos,
// with who's an admin. Admins can make others admin (or not), take people
// out of the chat (not the event) and add removed people back. The
// organisers (the society's committee, the event's or plan's host) are
// always admins, and a chat always keeps at least one admin.
export default function ChatMembersScreen() {
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  const id = typeof thread === "string" ? thread : "";
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const info = useQuery({ queryKey: ["thread", id, myId], queryFn: () => loadThreadInfo(supabase, id, myId!), enabled: !!id && !!myId });
  const members = useQuery({ queryKey: ["thread-members", id], queryFn: () => loadThreadMembers(supabase, id), enabled: !!id && !!myId });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = info.data?.isAdmin ?? false;
  const title = info.data?.event?.title ?? info.data?.socialEvent?.title ?? "Group chat";
  const inChat = (members.data ?? []).filter((m) => !m.removed);
  const removed = (members.data ?? []).filter((m) => m.removed);

  async function run(action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (result.error) setError(result.error);
    setOpen(null);
    await Promise.all([members.refetch(), queryClient.invalidateQueries({ queryKey: ["thread", id] })]);
    setBusy(false);
  }

  return (
    <Screen>
      <BackButton fallback={id ? `/chats/${id}` : "/(tabs)/chats"} label="Back to the chat" />
      <Heading className="mt-3">Members</Heading>
      <Muted className="mt-1" numberOfLines={1}>{title}{inChat.length ? ` · ${inChat.length} ${inChat.length === 1 ? "person" : "people"}` : ""}</Muted>
      {isAdmin && <Muted className="mt-2 text-sm">You&apos;re an admin. Organisers (the committee or the host) are always admins, and the chat always keeps at least one.</Muted>}
      {error && <T variant="semibold" className="mt-3 text-sm text-danger" testID="members-error">{error}</T>}

      {members.isPending ? (
        <Muted className="mt-6">Loading…</Muted>
      ) : members.isError ? (
        <Card className="mt-6"><Muted>Couldn&apos;t load the members. Go back and try again.</Muted></Card>
      ) : inChat.length === 0 ? (
        <Card className="mt-6"><Muted>Only people in this group chat can see who&apos;s in it.</Muted></Card>
      ) : (
        <View className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface" testID="members">
          {inChat.map((m, i) => (
            <MemberRow key={m.user_id} m={m} first={i === 0} manageable={isAdmin && !m.is_me && !m.is_organiser} open={open === m.user_id} onToggle={() => setOpen(open === m.user_id ? null : m.user_id)}>
              <LinkButton onPress={() => void run(() => setThreadAdmin(supabase, id, m.user_id, !m.is_admin))} disabled={busy} testID={`toggle-admin-${m.user_id}`}>{m.is_admin ? "Remove as admin" : "Make admin"}</LinkButton>
              <LinkButton onPress={() => void run(() => removeFromThread(supabase, id, m.user_id))} confirmText={`Remove ${m.name} from this group chat? They stay going to the event.`} disabled={busy} danger testID={`remove-${m.user_id}`}>Remove from group</LinkButton>
            </MemberRow>
          ))}
        </View>
      )}

      {isAdmin && removed.length > 0 && (
        <>
          <T variant="headline" className="mt-8">Removed</T>
          <Muted className="mt-1 text-sm">They can&apos;t see or send messages here until an admin adds them back.</Muted>
          <View className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface" testID="removed">
            {removed.map((m, i) => (
              <View key={m.user_id} className={`min-h-14 flex-row items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                <Avatar name={m.name} url={m.avatar_url} size={36} />
                <T variant="semibold" className="flex-1" numberOfLines={1}>{m.name}</T>
                <LinkButton onPress={() => void run(() => addBackToThread(supabase, id, m.user_id))} disabled={busy} testID={`add-back-${m.user_id}`}>Add back</LinkButton>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function MemberRow({ m, first, manageable, open, onToggle, children }: { m: ThreadMember; first: boolean; manageable: boolean; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <View className={first ? "" : "border-t border-line"} testID={`member-${m.user_id}`}>
      <View className="min-h-14 flex-row items-center gap-3 px-4 py-2.5">
        <Link href={`/u/${m.user_id}` as never} asChild>
          <Pressable className="min-w-0 flex-1 flex-row items-center gap-3" accessibilityRole="link">
            <Avatar name={m.name} url={m.avatar_url} size={36} />
            <T variant="semibold" className="shrink" numberOfLines={1}>{m.name}{m.is_me ? " (you)" : ""}</T>
            {m.is_organiser ? <Pill>Organiser</Pill> : m.is_admin ? <Pill>Admin</Pill> : null}
          </Pressable>
        </Link>
        {manageable && (
          <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`Manage ${m.name}`} hitSlop={8} className="min-h-11 justify-center px-1" testID={`manage-${m.user_id}`}>
            <T variant="semibold" className="text-sm text-brand">{open ? "Done" : "Manage"}</T>
          </Pressable>
        )}
      </View>
      {open && <View className="flex-row flex-wrap gap-5 px-4 pb-3 pl-[64px]">{children}</View>}
    </View>
  );
}
