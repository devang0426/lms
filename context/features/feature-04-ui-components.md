# Feature 04: UI components

**Status:** Done (2026-09-25). Needs a visual and keyboard check in a browser at `/dev/ui`.
**Depends on:** 01
**Demo step:** all screens

## Goal

The design-system primitives from `../ui-context.md`, built once and reused
everywhere.

## Scope

**In:** the presentational components in `components/ui/`, plus a
`/dev/ui` gallery page.

**Out:** feature components and data fetching.

## Components (`components/ui/`)

| Component | Variants and props (from `ui-context.md`) |
| --------- | ----------------------------------------- |
| `Button` | `primary`, `secondary`, `tertiary`, `link`, `quiet`, `success`, `icon`. Sizes 42/44/48/52. `asChild` for links. Leading and trailing icon. `loading`. |
| `Input`, `Textarea`, `Label`, `Field` | 48px, 12px radius. Clay focus ring. Error state in Terracotta (the design has no red). |
| `SearchField` | Pill with a leading icon. 46 and 52px sizes. |
| `Chip` | Filter chip, active or inactive. Used as a toggle group. |
| `Badge` | `success`, `warning`, `new`, `neutral`. Sizes 22/26/28. |
| `Card` | Flat (with border) or raised, 20px radius. `Card.Header` with a title and a link action. |
| `CourseCard` | `enrolled` (with progress), `catalog` and `compact` (mobile). Stripe or tint cover. |
| `ProgressBar` | Heights 5/6/8. Sage fill on an Oat track. |
| `ProgressRing` | 56px, stroke 6, with a serif value and a caption. |
| `StepIndicator` | `done`, `current`, `upcoming` (22px). |
| `Tabs` | Underline style. Accessible `tablist`. Optional count ("Resources · 3"). |
| `NavItem` | Sidebar item, active or inactive, with an 18px icon. |
| `TabBar` | Mobile bottom navigation. |
| `DateTile` | Month and day. `butter` or `oat`. |
| `StatCard` | Label, serif number, delta. An `attention` variant (butter). |
| `ListRow` | Avatar or tile, title and subtitle, trailing meta. |
| `DataTable` | Oat header row with mono labels, grid-template columns. |
| `Accordion` | The curriculum module row with its lessons. |
| `Avatar` | 34–40px, image or initials on Line. |
| `Logo` | Terracotta "s" mark plus the "Studyhall" serif wordmark. Sizes. |
| `Eyebrow` | Mono uppercase label. |
| `EmptyState` | A serif line, muted text and one action. |
| `Toast` | Raised elevation, for job and grade notices. |
| `Dialog`, `Menu` | Raised Paper, 20px radius, warm backdrop. Keyboard accessible. |

## Implementation notes

- **Icons:** install `lucide-react` and wrap it in `components/ui/icon.tsx`
  with a default `strokeWidth={1.8}`.
- **Class helpers:** install `clsx` and `tailwind-merge` for a `cn()`
  helper. Build variants with plain maps. Don't add a heavy library.
- **Dialog and Menu:** use Radix primitives (`@radix-ui/react-dialog` and
  `@radix-ui/react-dropdown-menu`) for accessibility, styled with the
  tokens.
- **Server-safe by default:** components are server-safe unless they need
  state. Only Tabs, Dialog, Menu, Toast and the Chip group are
  `"use client"`.
- **`/dev/ui`:** renders every variant. It is only reachable outside
  production, or when `DEMO_MODE=true`.

## Acceptance criteria

- [x] `/dev/ui` shows every component and variant. The build prerendered
      it and all sections are present in the HTML. It still needs a check by
      eye against the design board.
- [ ] Every interactive component works with the keyboard and has a visible
      focus ring. Radix supplies the roles and keyboard handling, and the
      global focus ring applies; this needs a manual keyboard pass.
- [x] There are no hex values in `components/` or `app/` (outside
      `globals.css`).
- [x] `npm run build` passes, and lint is clean on all new code.

## As built

- **Files** (`components/ui/`, exported through `index.ts`):

  | File | Components |
  | ---- | ---------- |
  | `button.tsx` | `Button` |
  | `input.tsx` | `Input`, `Textarea`, `Label`, `Field`, `SearchField` |
  | `badge.tsx` | `Badge`, `Chip` |
  | `chip-group.tsx` | `ChipGroup` (client, Radix ToggleGroup) |
  | `card.tsx` | `Card` (`flat`, `raised`, `sunken`, `attention`), `CardHeader` |
  | `course-card.tsx` | `CourseCard`, `CatalogCard`, `CompactCourseCard` |
  | `progress.tsx` | `ProgressBar`, `ProgressRing`, `StepIndicator` |
  | `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` (client, Radix) |
  | `nav.tsx` | `NavItem`, `TabBar` |
  | `data-display.tsx` | `DateTile`, `StatCard`, `ListRow`, `DataTable`, `Accordion`, `AccordionRow`, `EmptyState` |
  | `identity.tsx` | `Logo`, `Avatar`, `Person`, `Eyebrow` |
  | `overlay.tsx` | `Dialog*`, `Menu*`, `Toaster`, `toast` (client, Radix plus sonner) |
  | `icon.tsx` | `Icon`: Lucide at 1.8 stroke, 18px default |

- **Split course cards:** the spec's single `CourseCard` with variants is
  split into three components (`CourseCard`, `CatalogCard`,
  `CompactCourseCard`), because each has a different structure.
- **Accordion** uses native `<details>`/`<summary>`: accessible and needs
  no JavaScript.
- **Libraries:** the unified `radix-ui` package (Slot, Tabs, ToggleGroup,
  Dialog, DropdownMenu), `sonner` for toasts, `lucide-react`, `clsx`, and
  `tailwind-merge` v3.
- **`cn()` (`lib/utils/cn.ts`)** extends tailwind-merge with our theme keys
  (text sizes, radii, shadows, colors). Without that it would drop
  `text-ink` when combined with `text-h1`. Unit-checked.
- **New token:** `--bg-backdrop` (`bg-backdrop`), the warm dialog backdrop.
- **`<Toaster />`** is mounted in the root layout.
- **Server-safe by default:** only `tabs`, `chip-group` and `overlay` are
  client modules. Icons are passed as elements
  (`leading={<Icon icon={Plus}/>}`) so server components can use them.
- **`/dev/ui`** needs sign-in (like every page). It returns a 404 in
  production unless `DEMO_MODE=true`.
