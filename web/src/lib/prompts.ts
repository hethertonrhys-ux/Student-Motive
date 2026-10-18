// Profile prompts: short questions people answer instead of writing an
// "About me". This file is the one place the list lives.
//
// Rules:
// - Never change or reuse an id: answers are saved against it.
// - To stop offering a prompt, mark it "retired" instead of deleting it:
//   existing answers keep showing on profiles, but it's no longer offered.
// - "uni" limits a prompt to students at that university (from their email).

export type Uni = "LSE" | "UCL";

export type Prompt = {
  id: string;
  text: string;
  // Shown greyed-out in the answer box. "examples" has per-uni versions.
  example: string;
  examples?: Partial<Record<Uni, string>>;
  uni?: Uni;
  retired?: boolean;
  // Two truths and a lie: three statements and a guessing game instead of one answer.
  game?: "two-truths";
};

export const MAX_PROMPTS = 3;
// New answers; older ones (up to 150) still show as they are.
export const MAX_ANSWER = 120;
export const TWO_TRUTHS_ID = "two-truths";
// Two truths and a lie (needs its database change, supabase/migrations/20261103…).
export const TWO_TRUTHS_ENABLED = true;

export const PROMPTS: Prompt[] = [
  {
    id: TWO_TRUTHS_ID,
    text: "Two truths and a lie",
    game: "two-truths",
    example: "I've been on Welsh TV · I can solve a Rubik's cube in under a minute · I've never missed a 9am",
    examples: {
      LSE: "I've had three coffee chats this week · I've never been inside the Old Building · I once fell asleep on the library ramp",
      UCL: "I've said good morning to Jeremy Bentham · I've never been to Phineas · I got lost in the Cruciform in first year",
    },
  },
  { id: "society-secret", text: "The society I'd never join but secretly want to…", example: "Bell ringing. Something about being up a tower at 8am appeals to me." },
  { id: "event-with-me", text: "Come to an event with me if…", example: "You don't mind me getting competitive at bowling." },
  { id: "best-uni-thing", text: "The best thing I've done at uni so far…", example: "Accidentally ending up at a 4am ceilidh in freshers." },
  { id: "ideal-thursday", text: "Ideal Thursday night…", example: "Society social, chippy, home by 2 (realistically 3)." },
  { id: "controversial-opinion", text: "My most controversial opinion…", example: "Pineapple belongs on pizza and on the society budget." },
  { id: "talk-ear-off", text: "I'll talk your ear off about…", example: "Rugby, crypto, and why my hometown is underrated." },
  { id: "teammate-green-flag", text: "Green flag in a teammate…", example: "Brings snacks without being asked." },
  { id: "weirdly-good", text: "I'm weirdly good at…", example: "Guessing exactly how much a round costs." },
  { id: "teach-me-about", text: "Teach me something about…", example: "How bluffing actually works in poker." },
  { id: "ask-me-about", text: "Ask me about…", example: "The time I got lost in Paris with 4% battery." },
  { id: "campus-food-spot", text: "My favourite food spot near campus…", example: "The noodle place everyone walks past. Don't tell anyone." },
  { id: "budget-lunch", text: "Best budget lunch…", example: "Meal deal, but I've perfected the combo. Ask me." },
  { id: "after-social-food", text: "Where I'd take you for food after a social…", example: "Whichever chicken shop is still open. No regrets." },
  {
    id: "study-spot",
    text: "Best place to study on campus…",
    example: "Library, top floor, by the window.",
    examples: { LSE: "Shaw Library. Fight me.", UCL: "Student Centre, top floor, if you get there before 9." },
  },
  { id: "lse-after-deadline", text: "After a deadline you'll find me at…", uni: "LSE", example: "The George IV, ordering one 'quick' pint." },
  { id: "lse-stereotype", text: "The LSE stereotype I'm breaking…", uni: "LSE", example: "I study Finance and I've never said 'synergy' unironically." },
  { id: "ucl-bloomsbury", text: "My Bloomsbury hot take…", uni: "UCL", example: "The Main Quad in summer is better than any London park." },
  { id: "ucl-or-kings", text: "UCL or King's, and why…", uni: "UCL", example: "UCL. Do I even need to explain?" },
  { id: "ucl-stereotype", text: "The UCL stereotype I'm breaking…", uni: "UCL", example: "I'm in Engineering and I've been to a social this term." },
  { id: "lse-or-ucl", text: "LSE or UCL, and convince me…", example: "LSE. We're closer to Covent Garden, and that's the whole argument." },
  { id: "london-hack", text: "My London student hack…", example: "The 15 bus is the cheapest sightseeing tour in the city." },

  // Retired: no longer offered, but people's existing answers still show.
  { id: "pres-song", text: "My go-to pres song is…", example: "Mr Brightside. Every time. No skips.", retired: true },
  { id: "night-ends", text: "My night out ends at… (kebab shop / home by 12 / sunrise)", example: "Kebab shop, then a very confident walk home.", retired: true },
  { id: "club-move", text: "My signature dance move is…", example: "The shopping trolley, done with total commitment.", retired: true },
  { id: "best-night", text: "The best night out I've had in London was…", example: "Ended up at a jazz bar in Soho with people I'd met an hour before.", retired: true },
  { id: "drink-order", text: "At the bar, I'm ordering…", example: "Whatever's on offer, and a water for the walk home.", retired: true },
  { id: "aux-cord", text: "Give me the aux and I'll play…", example: "Early 2000s bangers until someone stops me.", retired: true },
  { id: "pres-or-club", text: "Better part of the night: pres or the club?", example: "Pres. The club is just pres with worse acoustics.", retired: true },
  { id: "night-out-role", text: "On a night out I'm the one who…", example: "Knows the way home and has a phone charger.", retired: true },
  { id: "sport-confession", text: "The sport I'm secretly terrible at…", example: "Badminton. I swing at where the shuttle used to be.", retired: true },
  { id: "match-watch", text: "You'll find me watching…", example: "Any football game, even the ones I don't care about.", retired: true },
  { id: "gym-or-not", text: "My relationship with the gym is…", example: "Complicated. We're on a break.", retired: true },
  { id: "five-a-side", text: "Pick me for your five-a-side because…", example: "I will run everywhere. Not well, but everywhere.", retired: true },
  { id: "sporting-hill", text: "A sporting hill I'll die on…", example: "Padel is better than tennis and I'll explain why.", retired: true },
  { id: "try-sport", text: "A sport I want to try this year…", example: "Bouldering, once I find shoes that don't hurt.", retired: true },
  { id: "teach-me", text: "Teach me ___ and I'll teach you ___", example: "Teach me to swim properly and I'll teach you chess.", retired: true },
  { id: "run-club", text: "My ideal Sunday morning is…", example: "A slow run along the river, then a long brunch.", retired: true },
  { id: "lecture-excuse", text: "Worst lecture excuse I've used…", example: "My alarm was set to PM. Twice in one week.", retired: true },
  { id: "campus-spot", text: "Best spot on campus that nobody knows about…", example: "Top floor of the library, the corner with the good chair.", retired: true },
  { id: "study-fuel", text: "My study session isn't complete without…", example: "Three coffees and a playlist with no words.", retired: true },
  { id: "degree-why", text: "I chose my course because…", example: "I liked the brochure. It's worked out, honestly.", retired: true },
  { id: "deadline-style", text: "My approach to deadlines is…", example: "Start early, panic anyway.", retired: true },
  { id: "random-fact", text: "A random fact I learnt in a lecture…", example: "Octopuses have three hearts. Not my course, I just wandered in.", retired: true },
  { id: "uni-opinion", text: "Unpopular opinion about LSE…", example: "The Saw Swee Hock stairs are a perfectly good workout.", retired: true },
  { id: "study-buddy", text: "Looking for a study buddy for…", example: "Stats revision. I bring snacks, you bring patience.", retired: true },
  { id: "food-take", text: "My most controversial food take…", example: "Pineapple on pizza is fine and we should all move on.", retired: true },
  { id: "cheap-eat", text: "The best cheap eat near campus is…", example: "The noodle place on Kingsway. Don't tell everyone.", retired: true },
  { id: "signature-dish", text: "My signature dish is…", example: "Pasta. Just pasta. But it's good pasta.", retired: true },
  { id: "food-crawl", text: "I'd travel across London for…", example: "A proper bagel from Brick Lane at 2am.", retired: true },
  { id: "flat-dinner", text: "Come to my flat dinner and I'll make…", example: "A curry that's either amazing or very spicy.", retired: true },
  { id: "brunch-order", text: "My brunch order says a lot about me:", example: "Eggs, extra hash browns, and a second coffee.", retired: true },
  { id: "last-meal", text: "Late-night snack of choice…", example: "Cheesy chips. Non-negotiable.", retired: true },
  { id: "food-adventure", text: "A food I'd try once…", example: "Durian. Everyone says don't. I want to know.", retired: true },
  { id: "event-doing", text: "Find me at the event doing…", example: "Talking to whoever's standing on their own.", retired: true },
  { id: "organise", text: "I'll organise a ___ if 5 people join", example: "Picnic in Lincoln's Inn Fields, I'll bring the speaker.", retired: true },
  { id: "green-flag", text: "Green flag in a new friend…", example: "Laughs at their own jokes before the punchline.", retired: true },
  { id: "weekend-plan", text: "My perfect London weekend…", example: "Market on Saturday, gallery on Sunday, nap in between.", retired: true },
  { id: "hidden-talent", text: "A hidden talent of mine…", example: "I can name almost any song from the first two seconds.", retired: true },
  { id: "hometown", text: "Ask me about my hometown and I'll tell you…", example: "It has the best fish and chips in the country. Fight me.", retired: true },
  { id: "conversation", text: "Start a conversation with me about…", example: "Any reality TV show. I have opinions.", retired: true },
];

export const promptById = (id: string) => PROMPTS.find((p) => p.id === id);

// The uni someone is at, from their email (unknown for anything else).
export function uniFromEmail(email: string | null | undefined): Uni | null {
  const domain = (email ?? "").toLowerCase().split("@")[1] ?? "";
  if (domain === "lse.ac.uk" || domain.endsWith(".lse.ac.uk")) return "LSE";
  if (domain === "ucl.ac.uk" || domain.endsWith(".ucl.ac.uk")) return "UCL";
  return null;
}

// Prompts someone can pick: not retired, and either for everyone or for their uni.
export function promptsFor(uni: Uni | null): Prompt[] {
  return PROMPTS.filter((p) => !p.retired && (!p.uni || p.uni === uni) && (TWO_TRUTHS_ENABLED || p.game !== "two-truths"));
}

// The greyed-out example: their uni's version if there is one.
export const exampleFor = (prompt: Prompt, uni: Uni | null) => (uni && prompt.examples?.[uni]) || prompt.example;
