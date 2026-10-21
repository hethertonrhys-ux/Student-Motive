import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDuration, type MediaKind } from "@function/shared";
import { Icon } from "@/components/icon";
import { Muted, T } from "@/components/ui";

// Previews are kept small in the chat; tap one to see it full screen.
const MAX_W = 190;
const MAX_H = 240;

// The size a photo or video preview takes in the chat, keeping its shape.
export function previewSize(width: number | null, height: number | null) {
  const w = width && width > 0 ? width : 4;
  const h = height && height > 0 ? height : 3;
  const scale = Math.min(MAX_W / w, MAX_H / h);
  return { width: Math.max(120, Math.round(w * scale)), height: Math.max(90, Math.round(h * scale)) };
}

// A photo or video in the chat. Photos show as themselves; videos as a dark
// tile with a play button and their length. `url` is null while the link
// loads (or if the file can't be opened any more).
export function MediaPreview({ kind, url, width, height, durationMs, onOpen, onLongPress, dim = false, testID }: { kind: MediaKind; url: string | null; width: number | null; height: number | null; durationMs: number | null; onOpen?: () => void; onLongPress?: () => void; dim?: boolean; testID?: string }) {
  const size = previewSize(width, height);
  return (
    <Pressable onPress={onOpen} onLongPress={onLongPress} disabled={!onOpen && !onLongPress} accessibilityRole="button" accessibilityLabel={kind === "photo" ? "Photo. Tap to open." : `Video, ${formatDuration(durationMs)}. Tap to play.`} testID={testID}>
      <View style={size} className={`overflow-hidden rounded-2xl border border-line ${kind === "video" ? "bg-[#111]" : "bg-surface"} ${dim ? "opacity-60" : ""}`}>
        {kind === "photo" ? (
          url ? <Image source={{ uri: url }} style={size} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : <View className="flex-1 items-center justify-center"><Muted className="text-xs">Loading photo…</Muted></View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-white/90">
              <Icon name="play" size={28} color="#0A0A0A" />
            </View>
            <View className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5">
              <T variant="caption" className="text-white">{formatDuration(durationMs)}</T>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// Full screen: a photo to look at or a video playing, on black, with a close button.
export function MediaViewer({ media, onClose }: { media: { kind: MediaKind; url: string } | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!media} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen" supportedOrientations={["portrait", "landscape"]}>
      <View className="flex-1 bg-black" testID="media-viewer">
        {media?.kind === "photo" && <Image source={{ uri: media.url }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo" />}
        {media?.kind === "video" && <FullVideo url={media.url} />}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={{ top: insets.top + 8, left: 16 }}
          className="absolute h-11 w-11 items-center justify-center rounded-full bg-black/60"
          testID="media-close"
        >
          <Icon name="close" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

function FullVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  // The browser's player only exists once it's on screen: start it again then.
  useEffect(() => {
    const t = setTimeout(() => player.play(), 200);
    return () => clearTimeout(t);
  }, [player]);
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} testID="media-video" />;
}
