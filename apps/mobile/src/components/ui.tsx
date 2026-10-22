import type { ComponentProps, ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View, type PressableProps, type ScrollViewProps, type TextInputProps, type TextProps, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { BlurView } from "expo-blur";
import { cssInterop } from "nativewind";
import { LIGHT, TEXT_STYLES, usePlaceholderColor, useTheme, type TextStyle } from "@/lib/theme";

// The website's shared styles (.btn, .btn-ghost, .card, .input, .label in
// globals.css) as components, with the same names and the same classes, so
// screens read the same here as there.

// Cards sit on a soft shadow as well as the thin border, so they lift off the page.
export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View className={`rounded-2xl border border-line bg-surface p-5 shadow-soft ${className}`} {...props} />;
}

// Text in the phone's own font (SF Pro on iPhone). The iOS text styles
// (largeTitle, title, headline, body, footnote, caption...; theme.ts) set
// the size, line height and weight together. The older variants only pick
// a weight, for text that sets its own size.
type TextVariant = "normal" | "semibold" | "bold" | "display" | "display-bold" | TextStyle;
const FONT: Record<TextVariant, string> = {
  normal: "font-sans",
  semibold: "font-sans-semibold",
  bold: "font-sans-bold",
  display: "font-display",
  "display-bold": "font-display-bold",
  ...TEXT_STYLES,
};
// Text is ink-coloured unless the classes give it another colour
// (a colour name, or an exact one like text-[#fff]; not a size like text-[11px]).
const HAS_COLOUR = /\btext-(ink|muted|brand|brand-ink|live|danger|ok|white|\[(#|rgb))/;
export function T({ variant = "normal", className = "", ...props }: TextProps & { variant?: TextVariant; className?: string }) {
  return <Text className={`${FONT[variant]} ${HAS_COLOUR.test(className) ? "" : "text-ink"} ${className}`} {...props} />;
}

export function Heading({ className = "", ...props }: TextProps & { className?: string }) {
  return <T variant="display" className={`text-3xl tracking-tight ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: TextProps & { className?: string }) {
  return <T variant="semibold" className={`mb-1.5 text-sm ${className}`} {...props} />;
}

export function Input({ className = "", ...props }: TextInputProps & { className?: string }) {
  const placeholder = usePlaceholderColor();
  // One-line boxes get the font size without a line height: on iPhone a
  // line height pushes the text down and cuts off the bottom of letters
  // like g, p and y.
  const size = props.multiline ? "text-base" : "text-[16px]";
  return (
    <TextInput
      placeholderTextColor={placeholder}
      className={`min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans ${size} text-ink web:outline-none web:focus:border-brand ${className}`}
      {...props}
    />
  );
}

// A button in the brand colour, or a quiet one with a border ("ghost").
// Every button is at least 44px tall (an easy tap), whatever its padding.
export function Button({
  children,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: Omit<PressableProps, "children"> & { children: ReactNode; variant?: "primary" | "ghost"; className?: string }) {
  const box = variant === "primary" ? "bg-brand" : "border border-line bg-surface";
  const lift = disabled ? "" : "shadow-soft";
  const text = variant === "primary" ? "text-brand-ink" : "text-ink";
  return (
    <Pressable
      role="button"
      aria-disabled={!!disabled}
      disabled={disabled}
      className={`min-h-11 flex-row items-center justify-center gap-2 rounded-xl px-4 py-2.5 ${box} ${lift} ${disabled ? "opacity-50" : "active:opacity-90"} ${className}`}
      {...props}
    >
      {typeof children === "string" ? <T variant="semibold" className={`text-base ${text}`}>{children}</T> : children}
    </Pressable>
  );
}

export function Muted({ className = "", ...props }: TextProps & { className?: string }) {
  return <T className={`text-muted ${className}`} {...props} />;
}

// A screen: the page background, kept clear of the notch and home
// indicator, with the content in a centred column that scrolls. "wide" is
// the landing pages' wider column. The ScrollView's own props (refreshControl,
// keyboardShouldPersistTaps...) pass straight through.
export function Screen({ children, wide = false, className = "", ...props }: ScrollViewProps & { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName={`mx-auto w-full px-4 py-8 ${wide ? "max-w-5xl" : "max-w-2xl"} ${className}`} {...props}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

// A section's title inside a screen ("Events coming up", "My 5").
export function SectionTitle({ className = "", ...props }: TextProps & { className?: string }) {
  return <T variant="display" className={`text-xl ${className}`} {...props} />;
}

// A small rounded label: "brand" (soft red, e.g. "Recommended"), "live"
// (the LIVE badge) or "quiet" (a grey outline).
type PillTone = "brand" | "live" | "quiet";
const PILL: Record<PillTone, { box: string; text: string }> = {
  brand: { box: "bg-brand-soft", text: "text-brand" },
  live: { box: "bg-live", text: "text-white" },
  quiet: { box: "border border-line bg-surface", text: "text-muted" },
};
export function Pill({ children, tone = "brand", className = "", ...props }: ViewProps & { children: ReactNode; tone?: PillTone; className?: string }) {
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full px-2.5 py-0.5 ${PILL[tone].box} ${className}`} {...props}>
      {typeof children === "string" ? <T variant="bold" className={`text-xs ${PILL[tone].text}`}>{children}</T> : children}
    </View>
  );
}

// One detail in an event's details card: an icon in a soft red circle, a
// small grey label ("When") and the value under it.
type IconName = ComponentProps<typeof Icon>["name"];
export function DetailRow({ icon, label, children, className = "", ...props }: ViewProps & { icon: IconName; label: string; children: ReactNode; className?: string }) {
  return (
    <View className={`flex-row gap-3 ${className}`} {...props}>
      <View className="size-9 items-center justify-center rounded-full bg-brand-soft">
        <Icon name={icon} size={18} color={LIGHT.brand} />
      </View>
      <View className="flex-1 justify-center">
        <Muted className="text-sm">{label}</Muted>
        {typeof children === "string" ? <T variant="semibold">{children}</T> : children}
      </View>
    </View>
  );
}

// The iOS frosted-glass blur, for bars and panels that float over the map
// or a photo. Light or dark to match the phone. On Android it's a plain
// see-through panel (Android's blur is slow on many phones).
cssInterop(BlurView, { className: "style" });
export function Frosted({ className = "", children, ...props }: ViewProps & { className?: string; children?: ReactNode }) {
  const { dark } = useTheme();
  return (
    <BlurView intensity={80} tint={dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} className={`overflow-hidden ${className}`} {...props}>
      {children}
    </BlurView>
  );
}
