import { useState } from "react";
import { View } from "react-native";
import { COUNTRIES, graduationYears, saveAccountDetails, searchCountries, UNIVERSITIES, uniFromEmail, flagEmoji, type AccountDetailsInput } from "@function/shared";
import { Flag } from "@/components/flag";
import { Select } from "@/components/select";
import { Button, Input, Label, Muted, T } from "@/components/ui";
import { UniTag } from "@/components/uni-tag";
import { supabase } from "@/lib/supabase";

const toOption = (c: { code: string; name: string }) => ({ value: c.code, label: `${flagEmoji(c.code)} ${c.name}`.trim() });
const COUNTRY_OPTIONS = COUNTRIES.map(toOption);

// The details every Function account has: full name, nickname (optional:
// what other students see when set), university (from the email, or picked
// when the email isn't a uni address) and graduation year. Used on the
// sign-up step and on the profile editor.
export function AccountDetailsForm({
  myId,
  email,
  initial,
  withCourse = false,
  withCountry = false,
  submitLabel = "Continue",
  onSaved,
}: {
  myId: string;
  email: string;
  initial: { fullName?: string | null; nickname?: string | null; graduationYear?: number | null; university?: string | null; course?: string | null; country?: string | null };
  withCourse?: boolean;
  withCountry?: boolean;
  submitLabel?: string;
  onSaved: () => void | Promise<unknown>;
}) {
  const fromEmail = uniFromEmail(email);
  const [fullName, setFullName] = useState(initial.fullName ?? "");
  const [nickname, setNickname] = useState(initial.nickname ?? "");
  const [year, setYear] = useState(initial.graduationYear ? String(initial.graduationYear) : "");
  const [university, setUniversity] = useState(fromEmail?.id ?? initial.university ?? "");
  const [course, setCourse] = useState(initial.course ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const years = graduationYears();

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const input: AccountDetailsInput = { fullName, nickname, graduationYear: year ? Number(year) : null, university: fromEmail ? null : university || null };
    if (withCourse) input.course = course;
    if (withCountry) input.country = country || null;
    if (!fromEmail && !university) {
      setPending(false);
      return setError("Choose your university.");
    }
    const r = await saveAccountDetails(supabase, myId, input);
    setPending(false);
    if (r.error) return setError(r.error);
    setSaved(true);
    await onSaved();
  }

  return (
    <View className="gap-5">
      <View>
        <Label>Full name</Label>
        <Input value={fullName} onChangeText={setFullName} placeholder="First and last name" maxLength={80} autoComplete="name" textContentType="name" testID="full-name" />
      </View>
      <View>
        <Label>Nickname <Muted className="text-sm">(optional)</Muted></Label>
        <Input value={nickname} onChangeText={setNickname} placeholder="What people call you" maxLength={40} autoCapitalize="words" testID="nickname" />
        <Muted className="mt-1 text-xs">If you add one, it&apos;s the name people see across Function. Your profile shows both.</Muted>
      </View>
      <View>
        <Label>University</Label>
        {fromEmail ? (
          <View className="flex-row items-center gap-2">
            <UniTag id={fromEmail.id} size="md" />
            <Muted className="text-sm">From your {fromEmail.domains[0]} email</Muted>
          </View>
        ) : (
          <Select value={university} onChange={setUniversity} options={UNIVERSITIES.map((u) => ({ value: u.id, label: u.name }))} placeholder="Choose your university…" accessibilityLabel="University" testID="uni-select" />
        )}
      </View>
      <View>
        <Label>Year you graduate</Label>
        <Select value={year} onChange={setYear} options={years.map((y) => ({ value: String(y), label: String(y) }))} placeholder="Choose a year…" accessibilityLabel="Graduation year" testID="graduation-year" />
      </View>
      {withCourse && (
        <View>
          <Label>Course and year <Muted className="text-sm">(optional)</Muted></Label>
          <Input value={course} onChangeText={setCourse} maxLength={60} placeholder="e.g. Economics, 2nd year" testID="course" />
        </View>
      )}
      {withCountry && (
        <View>
          <Label>Where you&apos;re from <Muted className="text-sm">(optional)</Muted></Label>
          <View className="flex-row items-center gap-2">
            <Flag code={country} size={22} />
            <Select value={country} onChange={setCountry} options={COUNTRY_OPTIONS} placeholder="Choose a country…" accessibilityLabel="Country" testID="country" className="flex-1" searchable search={(q) => searchCountries(q).map(toOption)} emptyValueLabel="Prefer not to say" />
          </View>
          <Muted className="mt-1 text-xs">Shows as a flag next to your name.</Muted>
        </View>
      )}
      {error && <T variant="semibold" className="text-sm text-danger" testID="details-error">{error}</T>}
      <View className="flex-row items-center gap-3">
        <Button onPress={() => void save()} disabled={pending} testID="save-details">{pending ? "Saving…" : submitLabel}</Button>
        {saved && !pending && <T variant="semibold" className="text-sm text-ok">Saved ✓</T>}
      </View>
    </View>
  );
}
