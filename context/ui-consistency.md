# UI Consistency Guide

Every page in CRM Artisan must follow these rules. The goal is that any page looks like it belongs to the same app without needing per-page style decisions.

---

## Colors

Defined in `src/app/globals.css` as CSS custom properties. Never hardcode colors — always use the token.

| Token | Light mode | Usage |
|---|---|---|
| `--primary` | `oklch(0.546 0.215 255)` — blue | Primary action buttons |
| `--primary-foreground` | `oklch(0.985 0 0)` — white | Text on primary buttons |
| `--destructive` | `oklch(0.577 0.245 27.325)` — red | Delete buttons, error states |
| `--muted-foreground` | `oklch(0.556 0 0)` | Subtitles, empty state text, table header labels |
| `--border` | `oklch(0.922 0 0)` | Borders on tables, cards, inputs |
| `--background` | `oklch(1 0 0)` | Page background |
| `--card` | `oklch(1 0 0)` | Card background |

Dark mode equivalents are already set in `globals.css`. Do not override them per-component.

---

## Typography

Font: **Geist Sans** — loaded globally via `--font-geist-sans`, applied to `<html>` as `font-sans`.

| Role | Classes |
|---|---|
| Page title | `text-xl font-semibold tracking-tight md:text-2xl` |
| Section subtitle / description | `text-sm text-muted-foreground` |
| Table / card label | `text-sm font-medium text-muted-foreground` |
| Body text | `text-sm` |
| Empty state heading | `text-sm font-medium` |

---

## Layout

### Sidebar
- Width: `w-14` (56px, icon-only) on `md`, `w-56` (224px, icon+label) on `lg`
- Bottom tab bar on mobile (below `md`)
- Main content offset: `md:pl-14 lg:pl-56` (set in `dashboard/layout.tsx` — do not repeat)

### Page content
- Outer padding: `p-4 md:p-6` — applied once in `layout.tsx`, do not add again per page
- Max width: none — content stretches to fill the main area

### Page header (every page must have one)
```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
  </div>
  {/* Primary action button goes here */}
</div>
```

---

## Buttons

Use shadcn/ui `<Button>`. Never write custom button styles.

| Variant | Usage | Classes added by variant |
|---|---|---|
| `default` | Primary action (Add, Save, Submit) — blue | `bg-primary text-primary-foreground` |
| `outline` | Secondary / cancel actions | Border only, no fill |
| `destructive` | Delete — always paired with a confirmation `Dialog` | `bg-destructive text-white` |
| `ghost` | Low-emphasis actions inside tables or toolbars | No border, no fill |

**Primary action button placement**: top-right of the page header, always `variant="default"` (blue).

---

## Spacing

| Context | Value |
|---|---|
| Page header bottom margin | `mb-6` |
| Between sections | `gap-6` or `space-y-6` |
| Inside a card or panel | `p-4 md:p-5` |
| Table cell padding | `px-4 py-3` |
| Form field gap | `gap-4` |
| Icon inside button | `size-4 mr-2` |

---

## Tables and Lists

- **Desktop (`md` and above)**: render as a table inside a `rounded-lg border` container
- **Mobile (below `md`)**: render the same data as stacked cards with `rounded-lg border p-4` per row
- Both views live in the same component — switch with responsive classes, not conditional rendering
- Table header row: `bg-muted/40 text-sm font-medium text-muted-foreground`
- Table body rows: `text-sm`, hover state `hover:bg-muted/30`

### Empty state (inside the table/list container)
```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <p className="text-sm font-medium">No {entity} yet</p>
  <p className="mt-1 text-sm text-muted-foreground">Add your first {entity} to get started.</p>
  <Button className="mt-4">
    <Plus className="size-4 mr-2" />
    Add {entity}
  </Button>
</div>
```

---

## Forms

- All forms open in a shadcn/ui `Sheet` (slide-over, `side="right"`)
- Use `react-hook-form` + `@hookform/resolvers/zod` — one Zod schema shared with the tRPC input
- Field gap inside the form: `gap-4`
- Submit button: `variant="default"` (blue), right-aligned in `SheetFooter`
- Cancel button: `variant="outline"`, left of submit in `SheetFooter`

---

## Feedback

- Success and error outcomes always use shadcn/ui `Sonner` toast — never inline alert banners
- Destructive actions (delete) always show a shadcn/ui `AlertDialog` for confirmation before proceeding
- Loading states: use the `disabled` prop on the submit button + a spinner icon, not skeleton screens for forms

---

## Borders and Radius

- All containers (tables, cards, sheets): `rounded-lg border`
- Inputs, selects: handled by shadcn/ui defaults (`rounded-md`)
- Do not use `rounded-full` except for avatars

---

## What not to do

- Do not use `inline-flex` or custom `className` to restyle shadcn/ui Button variants — use the provided variants
- Do not hardcode hex/rgb colors — use tokens
- Do not use arbitrary Tailwind values (e.g. `w-[220px]`) when a standard scale value fits
- Do not place forms on their own route — use a Sheet
- Do not mix shadcn/ui with other component libraries (Radix primitives used directly, Headless UI, etc.)
