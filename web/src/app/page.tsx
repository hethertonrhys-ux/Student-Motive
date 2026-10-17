import Link from "next/link";

const steps = [
  { title: "Log in with your LSE email", body: "No passwords. We email you a code." },
  { title: "Claim your society's page", body: "We check you're on the committee, usually within a day." },
  { title: "Post an event in a minute", body: "It goes straight onto the live map for every LSE student." },
];

const perks = [
  { title: "One place, not twelve", body: "Stop reposting across WhatsApp groups, Instagram stories and email lists." },
  { title: "Reach beyond your members", body: "Students who don't follow you yet still see you on the map tonight." },
  { title: "See who's coming", body: "Live \"I'm going\" numbers for every event, before the night." },
  { title: "Free for societies", body: "Always. No fees, no catch." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="py-16 sm:py-24">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-live" />
          </span>
          Launching at LSE
        </p>
        <h1 className="max-w-3xl font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Everything on at LSE, on one live map.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Motive puts every society and every event in one place. Students open the map and see what&apos;s
          happening tonight. Societies post once and reach everyone.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="btn px-5 py-3 text-base">
            Get your society on Motive
          </Link>
          <Link href="/map" className="btn-ghost px-5 py-3 text-base">
            See the live map
          </Link>
        </div>
      </section>

      <section id="how" className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={step.title} className="card">
            <p className="font-display text-3xl font-extrabold text-brand">{i + 1}</p>
            <h2 className="mt-2 font-display text-lg font-bold">{step.title}</h2>
            <p className="mt-1 text-muted">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="py-16">
        <h2 className="font-display text-3xl font-extrabold tracking-tight">What societies get</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {perks.map((perk) => (
            <div key={perk.title} className="card">
              <h3 className="font-display text-lg font-bold">{perk.title}</h3>
              <p className="mt-1 text-muted">{perk.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card mb-8 flex flex-col items-start gap-4 bg-brand-soft sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Students: put Motive on your phone</h2>
          <p className="text-muted">Add it to your home screen in a few taps. Works on iPhone and Android.</p>
        </div>
        <Link href="/install" className="btn px-5 py-3 text-base">
          Show me how
        </Link>
      </section>
    </div>
  );
}
