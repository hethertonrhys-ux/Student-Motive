// Profile prompts: short questions people answer instead of writing an
// "About me". Each has a category and a greyed-out example answer.
// The ids are saved with answers, so never change or reuse an id; to retire
// a prompt, remove it here (old answers to it are then just not shown).

export type PromptCategory = "nightlife" | "sport" | "academic" | "food" | "social";

export type Prompt = { id: string; text: string; category: PromptCategory; example: string };

export const MAX_PROMPTS = 3;
export const MAX_ANSWER = 150;

export const PROMPTS: Prompt[] = [
  // Nightlife
  { id: "pres-song", text: "My go-to pres song is…", category: "nightlife", example: "Mr Brightside. Every time. No skips." },
  { id: "night-ends", text: "My night out ends at… (kebab shop / home by 12 / sunrise)", category: "nightlife", example: "Kebab shop, then a very confident walk home." },
  { id: "club-move", text: "My signature dance move is…", category: "nightlife", example: "The shopping trolley, done with total commitment." },
  { id: "best-night", text: "The best night out I've had in London was…", category: "nightlife", example: "Ended up at a jazz bar in Soho with people I'd met an hour before." },
  { id: "drink-order", text: "At the bar, I'm ordering…", category: "nightlife", example: "Whatever's on offer, and a water for the walk home." },
  { id: "aux-cord", text: "Give me the aux and I'll play…", category: "nightlife", example: "Early 2000s bangers until someone stops me." },
  { id: "pres-or-club", text: "Better part of the night: pres or the club?", category: "nightlife", example: "Pres. The club is just pres with worse acoustics." },
  { id: "night-out-role", text: "On a night out I'm the one who…", category: "nightlife", example: "Knows the way home and has a phone charger." },
  // Sport
  { id: "sport-confession", text: "The sport I'm secretly terrible at…", category: "sport", example: "Badminton. I swing at where the shuttle used to be." },
  { id: "match-watch", text: "You'll find me watching…", category: "sport", example: "Any football game, even the ones I don't care about." },
  { id: "gym-or-not", text: "My relationship with the gym is…", category: "sport", example: "Complicated. We're on a break." },
  { id: "five-a-side", text: "Pick me for your five-a-side because…", category: "sport", example: "I will run everywhere. Not well, but everywhere." },
  { id: "sporting-hill", text: "A sporting hill I'll die on…", category: "sport", example: "Padel is better than tennis and I'll explain why." },
  { id: "try-sport", text: "A sport I want to try this year…", category: "sport", example: "Bouldering, once I find shoes that don't hurt." },
  { id: "teach-me", text: "Teach me ___ and I'll teach you ___", category: "sport", example: "Teach me to swim properly and I'll teach you chess." },
  { id: "run-club", text: "My ideal Sunday morning is…", category: "sport", example: "A slow run along the river, then a long brunch." },
  // Academic
  { id: "lecture-excuse", text: "Worst lecture excuse I've used…", category: "academic", example: "My alarm was set to PM. Twice in one week." },
  { id: "campus-spot", text: "Best spot on campus that nobody knows about…", category: "academic", example: "Top floor of the library, the corner with the good chair." },
  { id: "study-fuel", text: "My study session isn't complete without…", category: "academic", example: "Three coffees and a playlist with no words." },
  { id: "degree-why", text: "I chose my course because…", category: "academic", example: "I liked the brochure. It's worked out, honestly." },
  { id: "deadline-style", text: "My approach to deadlines is…", category: "academic", example: "Start early, panic anyway." },
  { id: "random-fact", text: "A random fact I learnt in a lecture…", category: "academic", example: "Octopuses have three hearts. Not my course, I just wandered in." },
  { id: "uni-opinion", text: "Unpopular opinion about LSE…", category: "academic", example: "The Saw Swee Hock stairs are a perfectly good workout." },
  { id: "study-buddy", text: "Looking for a study buddy for…", category: "academic", example: "Stats revision. I bring snacks, you bring patience." },
  // Food
  { id: "food-take", text: "My most controversial food take…", category: "food", example: "Pineapple on pizza is fine and we should all move on." },
  { id: "cheap-eat", text: "The best cheap eat near campus is…", category: "food", example: "The noodle place on Kingsway. Don't tell everyone." },
  { id: "signature-dish", text: "My signature dish is…", category: "food", example: "Pasta. Just pasta. But it's good pasta." },
  { id: "food-crawl", text: "I'd travel across London for…", category: "food", example: "A proper bagel from Brick Lane at 2am." },
  { id: "flat-dinner", text: "Come to my flat dinner and I'll make…", category: "food", example: "A curry that's either amazing or very spicy." },
  { id: "brunch-order", text: "My brunch order says a lot about me:", category: "food", example: "Eggs, extra hash browns, and a second coffee." },
  { id: "last-meal", text: "Late-night snack of choice…", category: "food", example: "Cheesy chips. Non-negotiable." },
  { id: "food-adventure", text: "A food I'd try once…", category: "food", example: "Durian. Everyone says don't. I want to know." },
  // Social
  { id: "event-doing", text: "Find me at the event doing…", category: "social", example: "Talking to whoever's standing on their own." },
  { id: "society-secret", text: "The society I'd never join but secretly want to…", category: "social", example: "Quidditch. The capes look great." },
  { id: "organise", text: "I'll organise a ___ if 5 people join", category: "social", example: "Picnic in Lincoln's Inn Fields, I'll bring the speaker." },
  { id: "green-flag", text: "Green flag in a new friend…", category: "social", example: "Laughs at their own jokes before the punchline." },
  { id: "weekend-plan", text: "My perfect London weekend…", category: "social", example: "Market on Saturday, gallery on Sunday, nap in between." },
  { id: "hidden-talent", text: "A hidden talent of mine…", category: "social", example: "I can name almost any song from the first two seconds." },
  { id: "hometown", text: "Ask me about my hometown and I'll tell you…", category: "social", example: "It has the best fish and chips in the country. Fight me." },
  { id: "conversation", text: "Start a conversation with me about…", category: "social", example: "Any reality TV show. I have opinions." },
];

export const promptById = (id: string) => PROMPTS.find((p) => p.id === id);
