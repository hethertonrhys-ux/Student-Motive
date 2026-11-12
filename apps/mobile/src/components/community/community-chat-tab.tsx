import { Link } from "expo-router";
import { View } from "react-native";
import { isMutedNow, unreadLabel, type ChatListItem, type CommunityGroup } from "@function/shared";
import { Icon } from "@/components/icon";
import { Button, Card, Muted, T } from "@/components/ui";
import { CommunityLogo } from "./community-header";

// The Chat tab of a community's page. For now it's a card that opens the
// community's main chat in the chat screen, with its unread count, the
// last message and whether you muted it. Part C3 of the communities plan
// replaces this one component with the chat itself, on the page.
export function CommunityChatTab({
  community,
  group,
  chat,
  myId,
}: {
  community: { name: string; image_url: string | null };
  group: CommunityGroup | undefined;
  chat: ChatListItem | null;
  myId: string | null;
}) {
  if (!group) {
    return (
      <Card testID="community-chat-tab">
        <Muted>The chat opens once you&apos;re in {community.name}.</Muted>
      </Card>
    );
  }
  const unread = chat?.unread ?? 0;
  const muted = !!chat && isMutedNow(chat);
  const preview = chat?.last_body ? `${chat.last_sender === myId ? "You: " : ""}${chat.last_body}` : "No messages yet. Say hi to everyone.";
  return (
    <Card className="gap-4" testID="community-chat-tab">
      <View className="flex-row items-center gap-3">
        <CommunityLogo name={community.name} url={group.image_url ?? community.image_url} size={48} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <T variant="headline" className="shrink" numberOfLines={1}>{group.name}</T>
            {muted && (
              <View className="flex-row items-center gap-0.5" testID="main-chat-muted" accessibilityLabel="Muted">
                <Icon name="notifications-off-outline" size={15} color="#5e5d78" />
                <Muted className="text-xs">Muted</Muted>
              </View>
            )}
          </View>
          <Muted className="text-sm">{group.member_count} {group.member_count === 1 ? "person" : "people"} · the whole community</Muted>
        </View>
        {unread > 0 && (
          <View className="min-w-6 items-center rounded-full bg-live px-1.5" testID="main-chat-unread">
            <T variant="bold" className="text-xs leading-5 text-white">{unreadLabel(unread, true)}</T>
          </View>
        )}
      </View>
      <T variant={unread ? "semibold" : "normal"} className={`text-sm ${unread ? "" : "text-muted"}`} numberOfLines={2} testID="main-chat-preview">{preview}</T>
      <Link href={`/chats/${group.thread_id}` as never} asChild>
        <Button testID="open-main-chat">Open the chat</Button>
      </Link>
    </Card>
  );
}
