import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";
import { initialOf } from "@function/shared";
import { Heading, T } from "@/components/ui";

// The top of a community's pages (its page, the join screen and Manage):
// the banner, the community's picture overlapping it, and its name. With
// no banner, a band in the brand colour with two soft circles; with no
// picture, the community's first letter.

// The community's picture (logo), or its first letter on soft red.
export function CommunityLogo({ name, url, size = 84, ring = false, testID }: { name: string; url: string | null | undefined; size?: number; ring?: boolean; testID?: string }) {
  const radius = Math.round(size / 4);
  const border = ring ? "border-4 border-bg" : "";
  if (url) {
    return (
      <View className={`overflow-hidden bg-surface ${border}`} style={{ width: size, height: size, borderRadius: radius }} testID={testID}>
        <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={`${name}'s picture`} />
      </View>
    );
  }
  return (
    <View className={`items-center justify-center bg-brand-soft ${border}`} style={{ width: size, height: size, borderRadius: radius }} testID={testID}>
      <T variant="display-bold" className="text-brand" style={{ fontSize: size * 0.42 }}>{initialOf(name).toUpperCase() || "?"}</T>
    </View>
  );
}

// The banner: the community's image, or the brand-colour band.
export function CommunityBanner({ url, testID = "community-banner" }: { url: string | null | undefined; testID?: string }) {
  return (
    <View className="w-full overflow-hidden rounded-2xl bg-brand" style={{ aspectRatio: 3 }} testID={testID}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel="Banner" />
      ) : (
        <>
          <View className="absolute rounded-full bg-white/10" style={{ width: 220, height: 220, right: -60, top: -90 }} />
          <View className="absolute rounded-full bg-white/10" style={{ width: 140, height: 140, left: "30%", bottom: -80 }} />
        </>
      )}
    </View>
  );
}

// Banner, picture and name, with anything else (e.g. the bio) underneath.
export function CommunityHeader({ community, children }: { community: { name: string; image_url: string | null; banner_url: string | null }; children?: ReactNode }) {
  return (
    <View testID="community-header">
      <CommunityBanner url={community.banner_url} />
      <View className="-mt-10 ml-4 self-start">
        <CommunityLogo name={community.name} url={community.image_url} ring testID="community-logo" />
      </View>
      <Heading className="mt-3" testID="community-name">{community.name}</Heading>
      {children}
    </View>
  );
}
