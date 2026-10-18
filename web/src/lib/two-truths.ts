// Two truths and a lie: shared shapes and limits.

export const TWO_TRUTHS_MAX = 80;
export const TWO_TRUTHS_HELP = ["Something about where you're from", "A weird skill or claim to fame", "Something that happened this year"];
// The answer saved in the prompts list for this prompt (the game itself lives elsewhere).
export const TWO_TRUTHS_ANSWER = "Two truths and a lie";

export type TwoTruthsOwn = { s1: string; s2: string; s3: string; lie: number };

// What a viewer gets: statements in their own shuffled order; the lie and
// results only once they've guessed (or it's their own).
export type TwoTruthsView = {
  statements: { n: number; text: string }[];
  my_pick: number | null;
  own: boolean;
  lie: number | null;
  total: number | null;
  right: number | null;
};
