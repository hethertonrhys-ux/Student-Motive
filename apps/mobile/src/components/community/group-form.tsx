import { useState } from "react";
import { View } from "react-native";
import { Button, Input, Label, T } from "@/components/ui";

// A sub-group's name and description: for making a new group (the
// community page's Groups tab and Manage) and for renaming one (Manage).
export function GroupForm({
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
  testID = "group-form",
}: {
  initial?: { name: string; description: string };
  submitLabel: string;
  busyLabel: string;
  onSubmit: (name: string, description: string) => Promise<{ error?: string }>;
  onCancel?: () => void;
  testID?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!name.trim()) return setError("Give the group a name.");
    setBusy(true);
    setError(null);
    const r = await onSubmit(name, description);
    setBusy(false);
    if (r.error) return setError(r.error);
    if (!initial) {
      setName("");
      setDescription("");
    }
  }
  return (
    <View className="gap-3" testID={testID}>
      <View>
        <Label>Group name</Label>
        <Input value={name} onChangeText={setName} maxLength={80} placeholder="e.g. AbaFam" testID={`${testID}-name`} />
      </View>
      <View>
        <Label>Description (optional)</Label>
        <Input value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="What the group is for" className="min-h-16" style={{ textAlignVertical: "top" }} testID={`${testID}-description`} />
      </View>
      {error && <T variant="semibold" className="text-sm text-danger" testID={`${testID}-error`}>{error}</T>}
      <View className="flex-row flex-wrap gap-2">
        <Button onPress={() => void submit()} disabled={busy} testID={`${testID}-save`}>{busy ? busyLabel : submitLabel}</Button>
        {onCancel && <Button variant="ghost" onPress={onCancel} disabled={busy} testID={`${testID}-cancel`}>Cancel</Button>}
      </View>
    </View>
  );
}
