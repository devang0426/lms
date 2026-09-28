# UI Context

Source of truth: `LMS Design System & Wireframes.html` (product name in the
designs: **Studyhall**). It contains the design system board and 7 wireframes.
Everything below is taken from that file.

## Theme

Light only. No dark mode. The tagline is **"Warm, light & unhurried."** The
look is a paper notebook: cream backgrounds, warm dark-brown text, soft
corners, thin borders.

Three principles from the design system:

1. **Paper, not screen.** Use cream backgrounds and warm ink, never pure white
   (`#FFF`) or pure black (`#000`). Every surface should feel like a good
   notebook.
2. **One warm voice.** Use Terracotta only for the one action that matters most
   on each screen. Everything else stays quiet.
3. **Calm progress.** Sage means growth and completion. Butter means something
   needs attention. No alarm-red, no neon, no blue-purple.

Neutrals make up about 90% of every screen.

## Colors

All components must use these tokens. Do not hardcode hex values.

### Tailwind utility names (implemented in `app/globals.css`, feature 01)

The CSS variables below are mapped in `@theme inline`. Use the color names in
utilities: `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*` and `stroke-*`.

| Utility color | CSS variable | Utility color | CSS variable |
| ------------- | ------------ | ------------- | ------------ |
| `cream` (alias `page`) | `--bg-base` | `sage` | `--state-success` |
| `paper` (alias `surface`) | `--bg-surface` | `sage-tint` | `--state-success-bg` |
| `oat` (alias `sunken`) | `--bg-sunken` | `sage-ink` | `--state-success-ink` |
| `line` | `--border-default` | `butter` | `--state-warning` |
| `line-strong` | `--border-strong` | `butter-tint` | `--state-warning-bg` |
| `ink` | `--text-primary` | `butter-ink` | `--state-warning-ink` |
| `ink-soft` | `--text-muted` | `stripe` | `--bg-stripe` |
| `terracotta` | `--accent-primary` | `media` | `--bg-media` |
| `terracotta-hover` | `--accent-primary-hover` | `clay` | `--accent-tint` |
| `clay-ink` | `--accent-ink` | `clay-stripe` | `--accent-stripe` |

Examples: `bg-paper border border-line text-ink`, `text-ink-soft`,
`bg-sage-tint text-sage-ink`.

There is deliberately no `base` color. It would clash with Tailwind's
`text-base` font-size utility.

Placeholder utilities: `bg-stripe` (oat/stripe diagonal) and
`bg-stripe-clay` (the course-detail trailer stripe).

### Core palette

| Name        | Role                               | CSS Variable        | Value     |
| ----------- | ---------------------------------- | ------------------- | --------- |
| Cream       | Page background                    | `--bg-base`         | `#FBF8F3` |
| Paper       | Cards, inputs, raised surfaces     | `--bg-surface`      | `#FFFEFB` |
| Oat         | Sunken areas, sidebar, table heads | `--bg-sunken`       | `#F4EFE6` |
| Line        | Borders, dividers, avatar placeholders | `--border-default` | `#E8E0D3` |
| Ink         | Primary text                       | `--text-primary`    | `#221E19` |
| Ink soft    | Secondary / muted text             | `--text-muted`      | `#5F574C` |
| Terracotta  | Primary action, links, active icon | `--accent-primary`  | `#B84F26` |
| Clay tint   | Selected, hover, focus ring        | `--accent-tint`     | `#F6E2D6` |
| Sage        | Progress, done                     | `--state-success`   | `#4E7A5A` |
| Sage tint   | Success background                 | `--state-success-bg`| `#E2ECE1` |
| Butter      | Highlight, due                     | `--state-warning`   | `#E9B949` |
| Butter tint | Notices                            | `--state-warning-bg`| `#FBF1D2` |

### Supporting values used in the wireframes

| Role                                   | CSS Variable              | Value     |
| -------------------------------------- | ------------------------- | --------- |
| Link hover / pressed terracotta        | `--accent-primary-hover`  | `#9E4220` |
| Text on clay tint ("New" chip)         | `--accent-ink`            | `#8E3C1C` |
| Text on sage tint                      | `--state-success-ink`     | `#33573D` |
| Text on butter tint                    | `--state-warning-ink`     | `#7A5A0E` |
| Placeholder stripe (second tone)       | `--bg-stripe`             | `#EFE8DC` |
| Clay stripe (second tone)              | `--accent-stripe`         | `#F2D9CA` |
| Empty checkbox / step ring             | `--border-strong`         | `#CFC5B5` |
| Video player background                | `--bg-media`              | `#2B2620` |

Error state: the design has **no red**. Show errors with Terracotta
(`--accent-primary` for the border and message, `--accent-tint` for the
background). Do not add a new red.

Text on Terracotta or Ink backgrounds uses Paper (`#FFFEFB`) or Cream
(`#FBF8F3`).

### Image placeholders

Course thumbnails that have no image use a diagonal stripe:
`repeating-linear-gradient(135deg, #F4EFE6 0 10px, #EFE8DC 10px 20px)`.
Otherwise use a solid tint (Clay, Sage or Butter tint) as the cover color.

## Typography

**Implemented as:** `font-serif`, `font-sans` and `font-mono`, loaded with
`next/font/google` in `app/layout.tsx`. `next/font` writes to
`--font-instrument-serif-src`, `--font-geist-src` and
`--font-geist-mono-src`, and the theme maps those to the `--font-*` tokens.
The `-src` suffix stops the theme tokens from referencing themselves.

The type scale is available as utilities, each setting size and line-height
(and letter-spacing where the scale has it): `text-display`, `text-h1`,
`text-h2`, `text-h3`, `text-body`, `text-small`, `text-meta` (13px) and
`text-label`. Weight, font family and case stay separate utilities, e.g.
`font-serif text-h1` or `font-mono text-label uppercase text-ink-soft`.

| Role                  | Font             | Variable       | Fallback                            |
| --------------------- | ---------------- | -------------- | ----------------------------------- |
| Display / "moments"   | Instrument Serif | `--font-serif` | `Georgia, serif`                    |
| UI text               | Geist            | `--font-sans`  | `ui-sans-serif, system-ui, sans-serif` |
| Metadata / counters   | Geist Mono       | `--font-mono`  | `ui-monospace, monospace`           |

Load all three with `next/font/google`. Instrument Serif is only used at
weight 400. Its italic (`<em>`) is used for emphasis, e.g.
"Good morning, *Aanya*".

**When to use each font:**
- **Serif**: greetings, page titles, course titles, big numbers (stats, ring %).
- **Geist**: everything you read or click.
- **Mono**: metadata, eyebrows, counters, timestamps, table headers.

### Type scale

| Token   | Font  | Size / line-height | Weight | Extras                     | Example                          |
| ------- | ----- | ------------------ | ------ | -------------------------- | -------------------------------- |
| Display | Serif | 72 / 1.0           | 400    | `tracking -0.02em`         | "Learn *slowly*"                 |
| H1      | Serif | 44 / 1.1           | 400    |                            | "Good morning, Aanya"            |
| H2      | Geist | 24 / 1.25          | 600    | `tracking -0.01em`         | "Continue learning"              |
| H3      | Geist | 18 / 1.35          | 600    |                            | "Module 2 · Colour theory"       |
| Body    | Geist | 16 / 1.6           | 400    |                            | Paragraph text                   |
| Small   | Geist | 14 / 1.5           | 400    | `--text-muted`             | "12 lessons · 3h 40m · Beginner" |
| Label   | Mono  | 12                 | 400    | uppercase, `tracking 0.12em`, `--text-muted` | "LESSON 04 OF 12" |

Sizes seen in the screens:
- Page heroes: 48–84px serif. Sign-in is 84, course detail 64, catalog 56,
  dashboards 48, lesson title 38, mobile 36.
- Course card titles: 24px serif, line-height 1.1.
- Stat numbers: 44px serif, line-height 1.
- Section headings in cards: 18px Geist 600.
- Buttons and nav items: 15px, weight 500.
- Secondary meta: 13px.
- Mono eyebrows: 11–12px, `tracking 0.1em–0.12em`.

## Spacing

The grid uses a **4pt base**. Use these steps: `8, 12, 16, 24, 32, 48, 64`
(plus 4 for tight gaps).

- Desktop page padding: `36–44px` vertical and `48px` horizontal in app
  shells. Full-width pages like course detail use `80px` horizontal.
- Mobile page padding: `20px` sides, `56px` top for the safe area.
- Card padding: `16–24px`.
- Gap between sections: `24–32px`.

## Border Radius

**Implemented tokens:** `rounded-tile` (10px), `rounded-card` (20px) and
`rounded-panel` (28px). The other sizes are Tailwind's defaults:
`rounded-lg` 8, `rounded-xl` 12, `rounded-2xl` 16, `rounded-3xl` 24,
`rounded-full`.

| Context                                     | Value   | Tailwind          |
| ------------------------------------------- | ------- | ----------------- |
| Small inputs, tiny squares                  | 8px     | `rounded-lg`      |
| Dropdown buttons, table thumbnails          | 10px    | `rounded-[10px]`  |
| Form fields, nav items, date tiles          | 12px    | `rounded-xl`      |
| Swatches, textareas, curriculum rows        | 14–16px | `rounded-2xl`     |
| Cards, panels, sidebar groups               | 20px    | `rounded-[20px]`  |
| Hero cards, media blocks                    | 24px    | `rounded-3xl`     |
| Sign-in hero panel                          | 28px    | `rounded-[28px]`  |
| Buttons, chips, badges, search, progress, avatars | pill | `rounded-full` |

All buttons are pills. Text inputs are 12px (not pills). The one exception is
the header search field, which is a pill.

## Elevation

**Implemented as:** `shadow-hairline` and `shadow-raised`. Flat is
`bg-paper border border-line`. The global `:focus-visible` style gives a
1.5px Terracotta outline plus a 4px Clay ring.

The design has only two levels. Prefer borders over shadows.

| Level  | Use                             | Style                                                                        |
| ------ | ------------------------------- | ---------------------------------------------------------------------------- |
| Flat   | Default cards and panels        | `background: var(--bg-surface); border: 1px solid var(--border-default)`     |
| Raised | Menus, popovers, floating play button | `box-shadow: 0 1px 2px rgba(60,40,20,0.06), 0 10px 28px rgba(60,40,20,0.08)` |
| Hairline lift | Active nav item, current lesson row | `box-shadow: 0 1px 2px rgba(60,40,20,0.06)`                      |

Shadows are always tinted warm brown (`rgba(60,40,20,…)`), never grey or black.

## Component Library

**Implemented (feature 04):**
- Import primitives from `@/components/ui`.
- Merge classes with `cn()` from `@/lib/utils/cn`. If you add a theme
  token, also add it to the tailwind-merge config there.
- Icons: `<Icon icon={Lucide} />` (1.8 stroke).
- Toasts: `toast()` from `@/components/ui`.
- Live gallery: `/dev/ui`.
- Dialog backdrop token: `bg-backdrop` (`rgba(34,30,25,0.4)`).
- Feature 07 added `Select` (a native `<select>` styled like `Input`) and
  an `xs` Button size (32px) for dense row controls.
- Feature 08 added the `dropdown` Button variant (38px, 10px radius, for
  "Level: Any" / "Sort: Newest" menus) and exports `coverClass` from the
  course card. Student screen pieces live in `components/student/`.
- Feature 11 put the lesson player in `components/player/`. Media controls
  use Cream text on `bg-media`, the scrubber track is `bg-cream/25` with a
  `bg-butter` fill, and the transcript's current line is `bg-butter-tint`.
- Feature 12:
  - A video-time chip ("▶ 12:48": Clay tint, Clay-ink mono 12px, pill)
    marks anything tied to a moment in the video. In the player it seeks
    (`SeekChip`); on the review screen it links to the player with `?t=`.
  - Rendered notes Markdown uses the `.study-notes` class in
    `globals.css` (token colours only; blockquotes are Butter-tint
    callouts). KaTeX CSS is loaded by `StudyNotes`.
  - The review screen's editors live in `components/lesson-review/`.
    Publish is its one Terracotta action.
- Feature 16 (`components/study/`): quiz answers are 48px `rounded-2xl`
  option rows (selected: Ink border on Oat; after checking: Sage tint for
  right, Clay for wrong). Feedback panels use Sage tint / Clay. Mastery
  bars are 6px on Oat: Sage from 80%, Butter from 50%, `terracotta/55`
  below (Clay tint is too faint as a fill). Scores are 48px serif.
- Feature 15 (`components/study/flashcard-deck.tsx`): a Paper card
  (`rounded-3xl`), serif front, back below a Line rule once flipped.
  Rating buttons are quiet pills (Good is secondary) with the next
  interval in mono under each label. "Show answer" is primary on `/study`
  and secondary in the player. "Review in video" is the Clay time chip.
  The sidebar notice card reads "N cards due today" (eyebrow "Today").
- Feature 14 (`components/assistant/`):
  - Citation chip "▶ Lecture 2 · 12:48": the video-time chip style,
    28px. Inside answer text the chip is `.cite-chip` (20px, mono 11px) in
    `globals.css`, because rendered Markdown can't carry utilities.
  - Answers render with `.study-notes`; the student's question is an Oat
    bubble on the right.
  - The refusal is an Oat panel with the fixed copy and a disabled quiet
    "Ask your instructor" button until feature 21.
  - Scope toggle "This lesson / Whole course" is a `ChipGroup`. In the
    player "Ask" is secondary (Next lesson is the Terracotta action); on
    `/courses/[courseId]/assistant` it is primary.

No component library is installed yet. The stack is Next.js 16, React 19 and
Tailwind CSS v4. The tokens should be defined in `app/globals.css` with
`@theme`, so that utilities like `bg-surface`, `text-muted` and `border-line`
map to the variables above. The file still has the create-next-app defaults. Build shared components in `components/ui/`.

### Buttons (height 48 default, pill, 15px / 500)

| Variant   | Style                                                                        | Example            |
| --------- | ---------------------------------------------------------------------------- | ------------------ |
| Primary   | bg Terracotta, text Paper, no border                                         | "Enroll now", "Sign in", "Resume lesson" |
| Secondary | transparent, `1px solid` Ink border, Ink text                               | "Preview", "Save for later", "Post announcement" |
| Tertiary  | bg Oat, Ink text                                                             | "Save for later"   |
| Link      | transparent, Terracotta text, underline with `underline-offset: 4px`, h-44   | "View all"         |
| Quiet     | bg Paper, `1px` Line border, Ink text                                        | "Previous"         |
| Success   | bg Sage tint, text `#33573D`                                                 | "Mark complete"    |
| Icon      | circle 40–46px, Paper bg, Line border                                        | Notifications, Back |

Sizes seen: 42, 44, 46, 48, 50, 52px tall. Large CTAs are 52px with `px-7` and
16px text. Horizontal padding is 18–28px. Leading and trailing icons use a
`gap-2`.

### Inputs

- Height 48–50px, padding `0 16px`, `rounded-xl`, bg Paper, `1px` Line border,
  15px text.
- Label goes above the field: 13px / 500, `gap: 6px`.
- **Focus:** `1.5px solid` Terracotta border plus a `0 0 0 4px` Clay tint ring.
- Search in the header: pill, 46–52px tall, leading search icon, Ink-soft icon
  color, borderless inner input.
- Textarea: `rounded-[14px]`, padding `14px 16px`, `resize: none`.
- Divider with text ("or with email"): 1px Line rules on both sides, 13px muted
  text.

### Chips and status badges

- **Filter chip** (36–38px, `px-4`, 14px): active is Ink bg with Cream text;
  inactive is transparent with a `1px` Line border.
- **Status badge** (28px, or 22–26px when inside rows, `px-3`, 13px / 500,
  pill):

| Meaning              | Background  | Text      | Examples                      |
| -------------------- | ----------- | --------- | ----------------------------- |
| Done / live          | `#E2ECE1`   | `#33573D` | Completed, Published, Teaching mode |
| Due / needs attention| `#FBF1D2`   | `#7A5A0E` | Due Friday, Scheduled, "3 days" |
| New / highlight      | `#F6E2D6`   | `#8E3C1C` | New                           |
| Neutral              | `#F4EFE6`   | `#5F574C` | Draft                         |

On an image, the "New" badge sits on a Paper background with `#8E3C1C` text,
`top-3 left-3`.

### Course card

- **Enrolled card:** Paper bg, `1px` Line border, `rounded-[20px]`,
  `overflow-hidden`.
  - Cover: 110–120px, solid tint or stripe placeholder.
  - Body: padding 16–18px, `gap: 10px`, containing:
    - Mono eyebrow, e.g. "DESIGN · 12 LESSONS".
    - 24px serif title.
    - 6px progress bar.
    - 13px muted line, e.g. "62% · 5 lessons left" or "34% · next: Loops and
      ranges".
- **Catalog card:** no border.
  - Cover: 150px, `rounded-[18px]`.
  - Stacked below it with `gap: 12px`:
    - Mono eyebrow, e.g. "DESIGN · BEGINNER".
    - 24px serif title.
    - 13px meta line: "[Instructor] · 12 lessons · 3h 40m".
- **Compact list card (mobile):** a 56px tint square, the title in 15px / 500,
  a 5px progress bar, and the mono % on the right.

### Progress

- **Bar:** track Oat (`#F4EFE6`), fill Sage (`#4E7A5A`), fully rounded. Height
  is 6px (8px on the hero card, 5px on mobile).
- **Video scrubber:** 4px tall, `rgba(251,248,243,0.25)` track, Butter fill.
- **Ring:** 56px, stroke 6, Sage-tint track, Sage arc with a round cap, starting
  at 12 o'clock. The value sits next to it: 28px serif %, then a 13px muted
  caption such as "weekly goal".
- **Lesson step indicator (22px circle):**
  - Done: filled Sage with a check.
  - Current: `2px` Terracotta ring with an 8px Terracotta dot.
  - Upcoming: `1.5px` `#CFC5B5` ring.

### Navigation

- **Sidebar nav item:** 44px, `px-3.5`, `rounded-xl`, 15px, `gap-3`, 18px icon.
  - Active: Paper bg, Ink text, weight 500, hairline shadow, Terracotta icon.
  - Inactive: transparent, Ink-soft text and icon.
- **Tabs:** underline style, 42–48px tall, `gap-6`/`gap-7`, bottom Line border.
  - Active: `2px` Ink bottom border, weight 600.
  - Inactive: Ink-soft.
  - Counts go inline, e.g. "Resources · 3".
- **Mobile tab bar:** 84px tall with `pb-6` for the home indicator, Paper bg,
  Line top border, 4 equal columns. Each column has an icon above an 11px
  label. Active is Terracotta and weight 500. Inactive is Ink-soft.

### Other patterns

- **Logo mark:** a Terracotta rounded square (30–36px, radius 8–10px) with an
  italic serif "s" in Cream, next to "Studyhall" set in 22–28px serif.
- **Avatar:** circle, 34–40px, Line placeholder. Name is 14px / 500 with a
  12px muted role below it.
- **Date tile:** 48×52px, `rounded-xl`. The month is 11px on top and the day is
  a 22px serif below. Butter tint means due soon. Oat is the default.
- **Stat card:** 20px padding, `rounded-[20px]`, containing:
  - 14px muted label.
  - 44px serif number.
  - 13px delta line in Sage-ink, or a muted caption.
  - The card that needs attention uses a Butter-tint bg with Butter-ink text
    and no border.
- **List row:** 12px vertical padding with a `1px` Line bottom border. The last
  row has no border.
- **Table:**
  - Header row: Oat bg, mono 11px uppercase, `tracking 0.08em`.
  - Body rows: 16px × 22px padding, Line dividers.
  - Columns use CSS grid fractions, e.g. `2.4fr 1fr 1fr 1.4fr`.
- **Accordion (curriculum):**
  - Header: Paper bg, `1px` Line border, `rounded-2xl`, 16×20px padding. Mono
    index ("01") and a 16px / 600 title on the left, 13px muted meta on the
    right.
  - Expanded lessons: indented 34px, 14px text.
  - "Free preview" label in Sage.
- **Callout panel:** Oat bg, 24px padding, `rounded-[20px]`. Used for "You'll
  be able to" outcome lists with check icons.
- **Notice card:** Butter-tint bg, `rounded-2xl`. Holds a mono Butter-ink
  eyebrow ("THIS WEEK") and a 14px message.
- **Links:** Terracotta, hover `#9E4220`. Inline links are 13–14px.

## Layout Patterns

**Implemented (feature 06)** in `components/shell/`: `SidebarShell` (with
`NoticeCard`), `TopNavShell`, `FocusHeader`, `PageHeader` and
`PlaceholderPage`. Nav items and the student tab bar are defined in
`nav-config.ts`. Below 768px the sidebar is replaced by a 64px top bar;
students get the bottom `TabBar` and staff get a menu button.

Desktop frames are 1440×960. The mobile frame is 390×844.

- **App shell (student and instructor):**
  - Full-height flex row.
  - Left sidebar: fixed at `248px`, Oat bg, no border, padding `28px 16px 20px`,
    `gap-8`.
    - Top: logo.
    - Middle: nav list with `gap-1`.
    - Bottom (`mt-auto`): user block, optionally with a Butter notice card above
      it.
  - Main: `flex-1` with padding `36px 48px`, as a vertical stack with gap 28–32.
- **Page header in the app shell:**
  - Left: a mono date or eyebrow ("FRIDAY · 25 SEPTEMBER") above the serif H1.
  - Right: actions (pill search 300px wide, notification icon button, or
    primary and secondary buttons).
- **Student home:**
  - Top row is a `2fr 1fr` grid:
    - "Continue learning" hero card: 300×220 thumbnail, serif title, progress,
      "Resume lesson" CTA.
    - "Coming up" list of date tiles.
  - Below it, "Your courses": filter chips on the right and a 3-column course
    card grid.
- **Course catalog:**
  - Serif hero ("Find your next *thing.*") with a 420px pill search on the
    right.
  - Filter bar: category chips on the left; "Level" and "Sort" dropdown buttons
    on the right. It has a bottom Line border.
  - Grid: 4-column catalog cards, `gap-5`.
- **Top-nav pages (course detail):**
  - No sidebar. A 72px header with `px-20` and a bottom Line border holds the
    logo, a "Back to Explore" link, "My learning" and an avatar.
  - Content has `px-20`.
  - Hero is a `1.15fr 1fr` grid:
    - Left: eyebrow, 64px serif title, summary, instructor, meta icons,
      Enroll and Save CTAs.
    - Right: 340px striped trailer block with a raised play button.
  - Below it: tabs, then a `1.6fr 1fr` grid with the curriculum accordion and
    the Oat outcomes panel.
- **Lesson player (focus mode):**
  - 68px Paper header:
    - Left: back icon button, mono course name, and module title.
    - Right: 160px progress bar, "7 / 12" counter, "Mark complete" success
      button.
  - Body: main area on the left plus a right sidebar that is `380px` wide, Oat
    bg, with a `1px` Line left border and course contents grouped by module.
  - Main area:
    - 540px dark video block (`#2B2620`, `rounded-[20px]`) with mono controls.
    - Title row with Previous and Next buttons.
    - Tabs (Notes / Resources / Discussion / Transcript) and a notes textarea.
- **Instructor dashboard:**
  - Same shell, with a "Teaching mode" sage badge under the logo.
  - Nav: Overview, Courses, Learners, Analytics, Messages.
  - Content:
    - 4-column stat cards.
    - `1.75fr 1fr` grid with the Courses table and the "Needs grading" queue.
- **Sign in:** 2-column split.
  - Left: a Clay-tint hero panel inset 20px with `rounded-[28px]`, containing:
    - Decorative blurred circles (Butter at 55% opacity, Sage tint).
    - An 84px serif headline, "Learn something *worth keeping.*"
  - Right: a centred 400px form:
    - SSO button.
    - Divider.
    - Email and password fields, with a "Forgot?" link.
    - Full-width primary pill.
- **Mobile:**
  - A single column with padding `56px 20px 20px` and `gap-[22px]`.
  - Contents, top to bottom:
    - Serif greeting and a notification button.
    - Clay-tint "Continue" card with a full-width Resume CTA.
    - Butter due-date notice.
    - Compact course list.
    - Bottom tab bar (Home, Explore, Courses, Profile).
- **Modals and menus** (not drawn): use the Raised elevation on Paper with
  `rounded-[20px]` and a warm backdrop, e.g. `rgba(34,30,25,0.4)`.

## Screens in the wireframes

| #  | Screen               | Primary action (Terracotta) |
| -- | -------------------- | --------------------------- |
| 01 | Sign in              | Sign in                     |
| 02 | Student home         | Resume lesson               |
| 03 | Course catalog       | (none: search is the focus) |
| 04 | Course detail        | Enroll · [Price / Free]     |
| 05 | Lesson player        | Next lesson                 |
| 06 | Instructor dashboard | New course                  |
| 07 | Mobile home          | Resume                      |

Student nav: Home, Explore, My courses, Calendar, Discussions, Progress.

## Icons

- Style: stroke-only line icons on a 24×24 viewBox. `stroke-width: 1.8`, with
  2–2.2 for small chevrons and checks. Round caps and joins. No fill. This
  matches **Lucide**: use `lucide-react` with `strokeWidth={1.8}` (it is not
  installed yet).
- Sizes:
  - 18px for nav items and buttons.
  - 16px inline with meta text.
  - 12–14px for chevrons and step checks.
  - 20–26px for play buttons.
- Color: `currentColor` by default. In the active nav item the icon is
  Terracotta.

## Voice

The copy is warm and unhurried. Examples:
- "Sign in to pick up where you left off."
- "Lessons are short on purpose. Finish one, take a breath, then move on."

Write in sentence case. Use "·" as the separator in meta lines. Use British
spelling ("Colour") in the samples.
