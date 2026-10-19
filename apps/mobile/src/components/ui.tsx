import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View, type PressableProps, type TextInputProps, type TextProps, type ViewProps } from "react-native";

// The website's shared styles (.btn, .btn-ghost, .card, .input, .label in
// globals.css) as components, with the same names and the same classes, so
// screens read the same here as there.

export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return <View className={`rounded-2xl border border-line bg-surface p-5 ${className}`} {...props} />;
}

// Body text in the site's font. Variants pick the weight (each weight is its own font file).
type TextVariant = "normal" | "semibold" | "bold" | "display" | "display-bold";
const FONT: Record<TextVariant, string> = {
  normal: "font-sans",
  semibold: "font-sans-semibold",
  bold: "font-sans-bold",
  display: "font-display",
  "display-bold": "font-display-bold",
};
// Text is ink-coloured unless the classes give it another colour.
const HAS_COLOUR = /\btext-(ink|muted|brand|brand-ink|live|danger|ok|white|\[)/;
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
  return (
    <TextInput
      placeholderTextColor="rgba(94, 93, 120, 0.7)"
      className={`w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-sans text-base text-ink web:outline-none web:focus:border-brand ${className}`}
      {...props}
    />
  );
}

// A button in the brand colour, or a quiet one with a border ("ghost").
export function Button({
  children,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: Omit<PressableProps, "children"> & { children: ReactNode; variant?: "primary" | "ghost"; className?: string }) {
  const box = variant === "primary" ? "bg-brand" : "border border-line bg-surface";
  const text = variant === "primary" ? "text-brand-ink" : "text-ink";
  return (
    <Pressable
      role="button"
      aria-disabled={!!disabled}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-2.5 ${box} ${disabled ? "opacity-50" : "active:opacity-90"} ${className}`}
      {...props}
    >
      {typeof children === "string" ? <T variant="semibold" className={`text-base ${text}`}>{children}</T> : children}
    </Pressable>
  );
}

export function Muted({ className = "", ...props }: TextProps & { className?: string }) {
  return <T className={`text-muted ${className}`} {...props} />;
}
