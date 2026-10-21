import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { profileIdFromScan, profileQrLink } from "@function/shared";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { QrCode } from "@/components/qr/qr-code";
import { prepareQrScanner } from "@/components/qr/scanner-setup";
import { Button, Card, Muted, T } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import { useTheme } from "@/lib/theme";

type Tab = "mine" | "scan";

// The QR popup from the Me page: "My QR code" (a big code that links to
// your profile, with your photo and name) and "Scan" (the camera, to open
// someone else's profile). Close with the X (or swipe down on iPhone).
export function QrSheet({ visible, onClose, me }: { visible: boolean; onClose: () => void; me: { id: string; name: string; avatarUrl: string | null } }) {
  const [tab, setTab] = useState<Tab>("mine");
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(280, Math.max(200, width - 96));
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]} testID="qr-sheet">
        <View className="mx-auto w-full max-w-md flex-1 px-4">
          <View className="flex-row items-center justify-between py-3">
            <T variant="headline">QR code</T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface active:opacity-80" testID="qr-close">
              <Icon name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <View className="flex-row rounded-2xl border border-line bg-surface p-1" accessibilityRole="tablist">
            {([["mine", "My QR code"], ["scan", "Scan"]] as const).map(([key, label]) => (
              <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} className={`min-h-11 flex-1 items-center justify-center rounded-xl ${tab === key ? "bg-brand" : ""}`} testID={`qr-tab-${key}`}>
                <T variant="bold" className={`text-sm ${tab === key ? "text-brand-ink" : "text-muted"}`}>{label}</T>
              </Pressable>
            ))}
          </View>
          <ScrollView contentContainerClassName="items-center py-6">
            {tab === "mine" ? (
              <View className="items-center" testID="qr-mine">
                <Avatar name={me.name} url={me.avatarUrl} size={64} />
                <T variant="title3" className="mt-2">{me.name}</T>
                <Card className="mt-5 items-center p-4">
                  <QrCode value={profileQrLink(SITE_URL, me.id)} size={size} testID="my-qr" />
                  <T variant="headline" className="mt-3">My profile</T>
                </Card>
                <Muted className="mt-4 max-w-xs text-center text-sm">Friends can scan this with their phone&apos;s camera, or in Function: Me → QR code → Scan. It only links to your profile.</Muted>
              </View>
            ) : (
              visible && <Scanner size={size} onClose={onClose} myId={me.id} />
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Scanner({ size, onClose, myId }: { size: number; onClose: () => void; myId: string }) {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Asked and refused: say how to turn it on (browsers don't ask twice).
  const [refused, setRefused] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    void prepareQrScanner().then(() => setReady(true));
  }, []);

  function scanned({ data }: BarcodeScanningResult) {
    if (done.current) return;
    const id = profileIdFromScan(data, SITE_URL);
    if (!id) return setMessage("That's not a Function profile code. Try a friend's QR code from their Me page.");
    if (id === myId) return setMessage("That's your own code. Scan a friend's instead.");
    done.current = true;
    onClose();
    router.push(`/u/${id}` as never);
  }

  if (!permission) return <Muted>Loading…</Muted>;
  if (!permission.granted) {
    return (
      <Card className="w-full items-center gap-3" testID="camera-permission">
        <Icon name="camera-outline" size={32} color="#DA291C" />
        <T variant="headline" className="text-center">Scan a friend&apos;s QR code</T>
        {permission.canAskAgain && !refused ? (
          <>
            <Muted className="text-center text-sm">Function uses your camera only while you&apos;re on this screen, to read the code. Nothing is recorded or saved.</Muted>
            <Button onPress={() => void requestPermission().then((r) => setRefused(!r.granted))} testID="allow-camera">Allow camera</Button>
          </>
        ) : (
          <>
            <Muted className="text-center text-sm" testID="camera-denied">
              {Platform.OS === "web"
                ? "Camera access is blocked for this site. Allow it in your browser's settings (the camera icon in the address bar), then come back."
                : "Camera access is off for Function. To scan codes, turn it on in Settings → Function → Camera."}
            </Muted>
            {Platform.OS !== "web" && <Button onPress={() => void Linking.openSettings()} testID="open-settings">Open Settings</Button>}
          </>
        )}
      </Card>
    );
  }
  return (
    <View className="items-center" testID="scanner">
      <View style={{ width: size, height: size }} className="overflow-hidden rounded-2xl bg-black">
        {ready && <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={scanned} />}
        {/* A frame to aim with. */}
        <View pointerEvents="none" className="absolute inset-8 rounded-2xl border-2 border-white/80" />
      </View>
      <Muted className="mt-4 max-w-xs text-center text-sm">Point your camera at a friend&apos;s Function QR code.</Muted>
      {message && <T variant="semibold" className="mt-3 max-w-xs text-center text-sm text-danger" testID="scan-message">{message}</T>}
    </View>
  );
}
