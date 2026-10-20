import type { EventAdminAnswers, Hazard, HazardRating } from "./types";
import { londonDate } from "./working-days";

// A hazard library for the risk assessment preview: the hazards an event's
// answers point to, with who's at risk, standard control measures and a
// rating. This is a starting point for the committee to check and adapt;
// it is not LSESU's risk assessment template.

const londonTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// Minutes after midnight, London time.
function londonMinutes(value: string | number | Date): number {
  const parts = londonTime.formatToParts(new Date(value));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

const valid = (value: string | number | Date | null | undefined): value is string | number | Date => value != null && !Number.isNaN(new Date(value).getTime());

// Ends after 23:00 or before 05:00 London time (or on a later day than it
// starts). Decision: a finish before 5am counts as late.
export function endsLate(startsAt: string | number | Date | null | undefined, endsAt: string | number | Date | null | undefined): boolean {
  if (!valid(endsAt)) return false;
  if (valid(startsAt) && londonDate(endsAt) > londonDate(startsAt)) return true;
  const m = londonMinutes(endsAt);
  return m > 23 * 60 || m < 5 * 60;
}

type Entry = Omit<Hazard, "rating" | "reason">;

const LIBRARY: Record<Hazard["key"], Entry> = {
  crowding: {
    key: "crowding",
    title: "Crowding",
    whoAtRisk: "Everyone attending, and the committee running the door",
    controls: [
      "Keep numbers within the room's capacity, counted at the door",
      "Named committee stewards at the entrance and exits",
      "Keep fire exits and walkways clear",
      "Know where the nearest first aider is and how to reach LSE Security",
    ],
  },
  alcohol: {
    key: "alcohol",
    title: "Alcohol",
    whoAtRisk: "People drinking, and those around them",
    controls: [
      "Challenge 25 for anyone buying or being served alcohol",
      "Free water and soft drinks available all night",
      "Committee members on duty stay sober",
      "Look out for anyone who's had too much and help them get home safely",
    ],
  },
  travel: {
    key: "travel",
    title: "Travel and off-campus venue",
    whoAtRisk: "Everyone travelling to and from the event",
    controls: [
      "Share a travel plan and a meeting point in advance",
      "Check the venue's own safety rules and emergency exits",
      "Committee lead keeps a list of who's going and a contact number",
      "Agree a plan for anyone who gets separated or needs to leave early",
    ],
  },
  late_finish: {
    key: "late_finish",
    title: "Late finish",
    whoAtRisk: "People getting home late at night",
    controls: [
      "Share night bus and safe-travel options before the event",
      "Encourage people to travel home in groups",
      "Committee members stay until everyone has left",
    ],
  },
  physical_activity: {
    key: "physical_activity",
    title: "Sport and physical activity",
    whoAtRisk: "People taking part",
    controls: [
      "Warm-up before starting",
      "Check kit and equipment are safe to use",
      "Ask people to tell the organiser about any injuries or health conditions",
      "A first aider or first aid kit on hand",
    ],
  },
  food: {
    key: "food",
    title: "Food and allergens",
    whoAtRisk: "Anyone eating, especially people with allergies",
    controls: [
      "Label food with its allergens",
      "Ask about allergies and dietary needs when people sign up",
      "Buy from a registered supplier and keep food covered",
    ],
  },
  external_speaker: {
    key: "external_speaker",
    title: "External speaker",
    whoAtRisk: "The speaker and the audience",
    controls: [
      "Brief the speaker on the format, timings and LSE's rules",
      "A chair to run the session and the Q&A",
      "Send speaker names to the building's Security reception in advance",
    ],
  },
  weather: {
    key: "weather",
    title: "Weather and outdoors",
    whoAtRisk: "Everyone outdoors",
    controls: ["Check the weather forecast beforehand", "Have an indoor fallback or a plan to postpone", "Tell people what to wear and bring"],
  },
};

const make = (key: Hazard["key"], rating: HazardRating, reason: string): Hazard => ({ ...LIBRARY[key], controls: [...LIBRARY[key].controls], rating, reason });

// The hazards an event's answers point to, in a fixed order.
export function hazardsFor({ answers, startsAt, endsAt }: { answers: EventAdminAnswers; startsAt?: string | number | Date | null; endsAt?: string | number | Date | null }): Hazard[] {
  const list: Hazard[] = [];
  const people = answers.expectedAttendees;
  if (people != null && people > 50) list.push(make("crowding", people > 150 ? "high" : "medium", `About ${people} people are expected.`));
  if (answers.alcohol === "available") list.push(make("alcohol", "medium", "Alcohol is available."));
  if (answers.alcohol === "focus") list.push(make("alcohol", "high", "Alcohol is the focus of the event."));
  if (answers.venueType === "london") list.push(make("travel", "low", "It's at a venue off campus."));
  if (answers.venueType === "away") list.push(make("travel", "medium", "It's outside London or overnight."));
  const late = endsLate(startsAt, endsAt);
  // Decision: a late finish is low, or medium when it's also away or overnight.
  if (late || answers.venueType === "away") list.push(make("late_finish", answers.venueType === "away" ? "medium" : "low", late ? "It finishes late at night." : "It's outside London or overnight."));
  // Decision: physical activity is medium, food low.
  if (answers.physicalActivity) list.push(make("physical_activity", "medium", "There's physical activity."));
  if (answers.food) list.push(make("food", "low", "There's food."));
  if (answers.externalSpeaker) list.push(make("external_speaker", answers.openToPublic ? "medium" : "low", answers.openToPublic ? "There's an external speaker, and it's open to the public." : "There's an external speaker."));
  // Decision: there's no "outdoors" question, so trips and physical activity count as likely outdoors.
  if (answers.venueType === "away" || answers.physicalActivity) list.push(make("weather", "low", answers.venueType === "away" ? "It's outside London or overnight." : "There's physical activity, which may be outdoors."));
  return list;
}
