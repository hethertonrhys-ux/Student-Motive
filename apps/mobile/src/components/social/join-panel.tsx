import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { cancelSocialEvent, joinSocialEvent, leaveSocialEvent, type MemberStatus } from "@function/shared";
import { LinkButton, type Tap } from "@/components/event/panels";
import { Button, Card, Muted, T } from "@/components/ui";
import { supabase } from "@/lib/supabase";

// Join, leave, withdraw or cancel. What you tapped shows straight away;
// the database catches up in the background.
export function JoinPanel({ eventId, isPrivate, cancelled, loggedIn, isHost, myId, mine, left, finished, hostName, suggestPrompt, tap, busy, paid = false, paidCount = 0 }: { eventId: string; isPrivate: boolean; cancelled: boolean; loggedIn: boolean; isHost: boolean; myId: string | null; mine: MemberStatus | null; left: number; finished: boolean; hostName: string; suggestPrompt: boolean; tap: Tap; busy: boolean; paid?: boolean; paidCount?: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const box = "flex-row flex-wrap items-center justify-between gap-3";

  if (cancelled) return <Card className={box}><T variant="semibold" className="text-danger">This event has been cancelled.</T></Card>;
  if (finished) return <Card className={box}><T variant="semibold" className="text-muted">This event has finished.</T></Card>;
  if (!loggedIn) {
    return (
      <Card className={box}>
        <T variant="semibold">Log in to join.</T>
        <Link href={{ pathname: "/login", params: { next: `/social/${eventId}` } }} asChild>
          <Button>Log in</Button>
        </Link>
      </Card>
    );
  }
  if (isHost) {
    return (
      <Card className={box}>
        <T variant="semibold">You&apos;re hosting</T>
        <View className="flex-row gap-2">
          <Button variant="ghost" className="py-2" onPress={() => router.push(`/social/${eventId}/edit` as never)} testID="edit-event">Edit</Button>
          <LinkButton onPress={() => void tap(() => cancelSocialEvent(supabase, eventId, myId!))} confirmText={paidCount > 0 ? `Cancel this event? Everyone going will see it's cancelled, and the ${paidCount} ${paidCount === 1 ? "person who has" : "people who have"} paid will get a full refund.` : "Cancel this event? Everyone going will see it's cancelled."} disabled={busy} danger testID="cancel-event">Cancel event</LinkButton>
        </View>
      </Card>
    );
  }
  if (mine === "going") {
    return (
      <Card className={box} testID="going-panel">
        <T variant="semibold"><T className="text-ok">✓</T> You&apos;re going</T>
        {/* After paying, people ask the host for a refund instead (below). */}
        {!paid && <LinkButton onPress={() => void tap(() => leaveSocialEvent(supabase, eventId))} confirmText="Leave this event? Your space goes to someone else." disabled={busy} testID="leave-social">Leave</LinkButton>}
      </Card>
    );
  }
  if (mine === "pending") {
    return (
      <Card className={box} testID="pending-panel">
        <T variant="semibold" className="flex-1">Request sent. {hostName} will approve or decline.</T>
        <LinkButton onPress={() => void tap(() => leaveSocialEvent(supabase, eventId))} disabled={busy} testID="withdraw-request">Withdraw request</LinkButton>
      </Card>
    );
  }
  if (mine === "declined") return <Card className={box}><T variant="semibold" className="text-muted">{hostName} declined your request for this one.</T></Card>;
  if (left === 0) {
    return (
      <Card className={box}>
        <T variant="semibold">No spaces left.</T>
        <Button disabled>Full</Button>
      </Card>
    );
  }
  const join = () => void tap(() => joinSocialEvent(supabase, eventId));
  if (asking) {
    return (
      <Card className="gap-3">
        <T variant="semibold">Add a prompt so the host knows who you are</T>
        <Muted className="text-sm">{hostName} sees your profile when deciding. A quick answer or two helps.</Muted>
        <View className="flex-row flex-wrap gap-2">
          <Link href={"/(tabs)/me" as never} asChild>
            <Button>Add a prompt</Button>
          </Link>
          <Button variant="ghost" onPress={join} disabled={busy} testID="skip-and-request">Skip and send request</Button>
        </View>
      </Card>
    );
  }
  return (
    <Card className={box}>
      <T variant="semibold" className="flex-1">{isPrivate ? `${hostName} approves who comes.` : "Coming?"}</T>
      <Button className="px-6" onPress={() => (isPrivate && suggestPrompt ? setAsking(true) : join())} disabled={busy} testID="join-social">
        {isPrivate ? "Request to join" : "I'm in"}
      </Button>
    </Card>
  );
}
