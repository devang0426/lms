/* Design-token preview (feature 01), moved here from / in feature 06.
   Uses token classes only — no hex values outside globals.css. */

const swatches = [
  { name: "Cream", token: "cream", role: "page ground", className: "bg-cream border border-line" },
  { name: "Paper", token: "paper", role: "cards", className: "bg-paper border border-line" },
  { name: "Oat", token: "oat", role: "sunken, sidebar", className: "bg-oat" },
  { name: "Line", token: "line", role: "borders", className: "bg-line" },
  { name: "Ink soft", token: "ink-soft", role: "secondary text", className: "bg-ink-soft" },
  { name: "Ink", token: "ink", role: "text", className: "bg-ink" },
  { name: "Terracotta", token: "terracotta", role: "primary action", className: "bg-terracotta" },
  { name: "Clay tint", token: "clay", role: "selected, hover", className: "bg-clay" },
  { name: "Sage", token: "sage", role: "progress, done", className: "bg-sage" },
  { name: "Sage tint", token: "sage-tint", role: "success bg", className: "bg-sage-tint" },
  { name: "Butter", token: "butter", role: "highlight, due", className: "bg-butter" },
  { name: "Butter tint", token: "butter-tint", role: "notices", className: "bg-butter-tint" },
];

const supporting = [
  { token: "terracotta-hover", className: "bg-terracotta-hover" },
  { token: "clay-ink", className: "bg-clay-ink" },
  { token: "clay-stripe", className: "bg-clay-stripe" },
  { token: "sage-ink", className: "bg-sage-ink" },
  { token: "butter-ink", className: "bg-butter-ink" },
  { token: "line-strong", className: "bg-line-strong" },
  { token: "stripe", className: "bg-stripe" },
  { token: "media", className: "bg-media" },
];

const typeScale = [
  { label: "DISPLAY 72/1.0", className: "font-serif text-display", sample: <>Learn <em>slowly</em></> },
  { label: "H1 44/1.1", className: "font-serif text-h1", sample: <>Good morning, <em>Aanya</em></> },
  { label: "H2 24/1.25 · 600", className: "text-h2 font-semibold", sample: "Continue learning" },
  { label: "H3 18/1.35 · 600", className: "text-h3 font-semibold", sample: "Module 2 · Colour theory" },
  { label: "BODY 16/1.6", className: "text-body", sample: "Lessons are short on purpose. Finish one, take a breath, then move on." },
  { label: "SMALL 14/1.5", className: "text-small text-ink-soft", sample: "12 lessons · 3h 40m · Beginner" },
  { label: "LABEL 12 MONO", className: "font-mono text-label uppercase text-ink-soft", sample: "Lesson 04 of 12" },
];

const radii = [
  { label: "8 · lg", className: "rounded-lg" },
  { label: "10 · tile", className: "rounded-tile" },
  { label: "12 · xl", className: "rounded-xl" },
  { label: "16 · 2xl", className: "rounded-2xl" },
  { label: "20 · card", className: "rounded-card" },
  { label: "24 · 3xl", className: "rounded-3xl" },
  { label: "28 · panel", className: "rounded-panel" },
  { label: "pill · full", className: "rounded-full" },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
      {children}
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <h2 className="m-0 font-serif text-h1 font-normal">{title}</h2>
      <span className="text-small text-ink-soft">{note}</span>
    </div>
  );
}

export default function TokenPreview() {
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-16 px-4 py-12 sm:px-12 lg:px-20">
      <header className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-tile bg-terracotta font-serif text-2xl text-cream italic">
            s
          </div>
          <span className="font-serif text-[28px]">Studyhall</span>
        </div>
        <h1 className="m-0 font-serif text-[56px] leading-[0.95] font-normal tracking-[-0.02em] sm:text-[104px]">
          Warm, light &amp; <em className="text-terracotta">unhurried.</em>
        </h1>
        <p className="max-w-[640px] text-body text-ink-soft">
          Design-token preview for feature 01. Every value on this page comes from{" "}
          <code className="font-mono text-small">app/globals.css</code>.{" "}
          <a href="https://tailwindcss.com/docs/theme">Links look like this.</a>
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <SectionTitle title="Colour" note="Neutrals carry 90% of every screen" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {swatches.map((s) => (
            <div key={s.token} className="flex flex-col gap-2.5">
              <div className={`h-28 rounded-2xl ${s.className}`} />
              <div className="text-[15px] font-semibold">{s.name}</div>
              <div className="font-mono text-label text-ink-soft">
                {s.token} · {s.role}
              </div>
            </div>
          ))}
        </div>
        <Eyebrow>Supporting</Eyebrow>
        <div className="grid grid-cols-4 gap-4 lg:grid-cols-8">
          {supporting.map((s) => (
            <div key={s.token} className="flex flex-col gap-2">
              <div className={`h-14 rounded-xl ${s.className}`} />
              <div className="font-mono text-[11px] text-ink-soft">{s.token}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-16 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionTitle title="Type" note="Instrument Serif · Geist · Geist Mono" />
          <div className="flex flex-col border-t border-line">
            {typeScale.map((t) => (
              <div
                key={t.label}
                className="flex items-baseline gap-6 border-b border-line py-[18px]"
              >
                <span className="w-[120px] shrink-0 font-mono text-[11px] text-ink-soft">
                  {t.label}
                </span>
                <span className={t.className}>{t.sample}</span>
              </div>
            ))}
          </div>
          <p className="m-0 text-small text-ink-soft">
            Serif for moments (greetings, course titles, big numbers). Geist for everything
            you read or click. Mono for metadata and counters.
          </p>
        </div>

        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <Eyebrow>Radius</Eyebrow>
            <div className="flex flex-wrap gap-5">
              {radii.map((r) => (
                <div key={r.label} className="flex flex-col items-center gap-1.5">
                  <div className={`size-16 border-[1.5px] border-ink ${r.className}`} />
                  <span className="font-mono text-[11px]">{r.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Eyebrow>Elevation</Eyebrow>
            <div className="flex flex-wrap gap-5">
              <div className="flex h-[72px] w-[120px] items-center justify-center rounded-2xl border border-line bg-paper text-[12px] text-ink-soft">
                flat · border
              </div>
              <div className="flex h-[72px] w-[120px] items-center justify-center rounded-2xl bg-paper text-[12px] text-ink-soft shadow-hairline">
                hairline
              </div>
              <div className="flex h-[72px] w-[120px] items-center justify-center rounded-2xl bg-paper text-[12px] text-ink-soft shadow-raised">
                raised · menus
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Eyebrow>Placeholders &amp; states</Eyebrow>
            <div className="grid grid-cols-2 gap-4">
              <div className="h-24 rounded-card bg-stripe" />
              <div className="h-24 rounded-card bg-stripe-clay" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 items-center rounded-full bg-sage-tint px-3 text-meta font-medium text-sage-ink">
                Completed
              </span>
              <span className="flex h-7 items-center rounded-full bg-butter-tint px-3 text-meta font-medium text-butter-ink">
                Due Friday
              </span>
              <span className="flex h-7 items-center rounded-full bg-clay px-3 text-meta font-medium text-clay-ink">
                New
              </span>
              <span className="flex h-7 items-center rounded-full bg-oat px-3 text-meta font-medium text-ink-soft">
                Draft
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-oat">
              <div className="h-1.5 w-[62%] rounded-full bg-sage" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="h-12 rounded-full bg-terracotta px-[22px] text-[15px] font-medium text-paper hover:bg-terracotta-hover"
              >
                Enroll now
              </button>
              <input
                type="search"
                placeholder="Tab here to see the focus ring"
                aria-label="Focus ring demo"
                className="h-12 rounded-xl border border-line bg-paper px-4 text-[15px] placeholder:text-ink-soft"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
