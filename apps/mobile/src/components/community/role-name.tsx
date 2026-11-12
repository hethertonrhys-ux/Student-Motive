import { View } from "react-native";
import { roleColour, roleTag, type CommunityMembership, type CommunityRole, type RoleColours, type RoleTag } from "@function/shared";
import { T } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// A person's community nickname in their role's colour, with the small
// tag ("Admin", "Committee", "Member") so colour is never the only cue.
// The colours come from the community (communities.settings.role_colours),
// one for light mode and one for dark.

export function useRoleColour(colours: RoleColours | unknown, role: CommunityRole | null | undefined, membership: CommunityMembership | null | undefined) {
  const { dark } = useTheme();
  return roleColour(colours, role, membership, dark ? "dark" : "light");
}

export function RoleTagPill({ tag, colour, testID }: { tag: RoleTag; colour: string; testID?: string }) {
  return (
    <View className="rounded-full border px-1.5" style={{ borderColor: colour }} testID={testID}>
      <T variant="bold" className="text-[11px] leading-4" style={{ color: colour }}>{tag}</T>
    </View>
  );
}

export function RoleName({
  nickname,
  role,
  membership,
  colours,
  testID,
}: {
  nickname: string;
  role: CommunityRole | null | undefined;
  membership: CommunityMembership | null | undefined;
  colours: RoleColours | unknown;
  testID?: string;
}) {
  const colour = useRoleColour(colours, role, membership);
  const tag = roleTag(role, membership);
  return (
    <View className="min-w-0 flex-row flex-wrap items-center gap-1.5" testID={testID}>
      <T variant="semibold" className="shrink" style={{ color: colour }} numberOfLines={1}>{nickname}</T>
      {tag && <RoleTagPill tag={tag} colour={colour} />}
    </View>
  );
}
