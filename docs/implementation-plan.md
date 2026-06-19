# Implementation Plan

Each slice is one focused session sized to stay under 100k context window (3–6 files touched).

## Status legend
- [ ] Not started
- [x] Done

---

## Already done
- [x] App scaffold, Supabase, Drizzle schema
- [x] Dashboard layout + sidebar/bottom nav
- [x] Client list page shell (no data)
- [x] Blue primary color token + UI consistency guide

---

## Slice 1 — Auth
**Files:** `src/middleware.ts`, `src/lib/auth.ts`, `src/app/(auth)/login/page.tsx`, `src/app/layout.tsx`

- [ ] NextAuth v5 (Auth.js) with email/password via Supabase credentials provider
- [ ] JWT session, middleware protects `/dashboard/**`
- [ ] Login page (no sidebar shell)

---

## Slice 2 — tRPC + constants
**Files:** `src/lib/constants.ts`, `src/server/trpc.ts`, `src/server/routers/_app.ts`, `src/lib/trpc/client.ts`, `src/lib/trpc/server.ts`, `src/app/layout.tsx`

- [ ] `publicProcedure` + `protectedProcedure` (reads session from NextAuth)
- [ ] tRPC React Query provider wired into root layout
- [ ] `PAGE_SIZE = 20`, `FREE_TIER_JOB_SITE_MAX = 5`, `RECENT_ACTIVITY_LIMIT = 10`

---

## Slice 3 — Clients: list + CRUD
**Files:** `src/server/routers/clients.ts`, `src/lib/validations/clients.ts`, `src/app/dashboard/clients/page.tsx`, `src/components/clients/ClientSheet.tsx`, `src/components/clients/DeleteClientDialog.tsx`

- [ ] tRPC: `list` (search, paginated), `create`, `update`, `delete`
- [ ] Zod schema shared between form and tRPC input
- [ ] Wire up list page: table (desktop) / cards (mobile), search input, pagination
- [ ] Add/Edit in a Sheet, delete in an `AlertDialog`

---

## Slice 4 — Client detail
**Files:** `src/app/dashboard/clients/[id]/page.tsx`, `src/server/routers/clients.ts` (add `getById`)

- [ ] View client info with edit button (opens Sheet from slice 3)
- [ ] Linked job sites section (empty state until slice 5)
- [ ] Linked quotes section (empty state until slice 7)

---

## Slice 5 — Job Sites: list + CRUD
**Files:** `src/server/routers/job-sites.ts`, `src/lib/validations/job-sites.ts`, `src/app/dashboard/job-sites/page.tsx`, `src/components/job-sites/JobSiteSheet.tsx`, `src/components/job-sites/DeleteJobSiteDialog.tsx`

- [ ] tRPC: `list` (filter by client, filter by status, paginated), `create`, `update`, `delete`
- [ ] Status filter (Planned / In Progress / Completed) + client filter
- [ ] Free-tier gate on create: block + show upgrade prompt when limit reached
- [ ] Status badge component (reused in slices 6, 7)

---

## Slice 6 — Job Site detail
**Files:** `src/app/dashboard/job-sites/[id]/page.tsx`, `src/server/routers/job-sites.ts` (add `getById`)

- [ ] View job site info, status badge, edit button
- [ ] Linked client reference
- [ ] Linked quotes section (empty state until slice 7)

---

## Slice 7 — Quotes: list + status
**Files:** `src/server/routers/quotes.ts`, `src/lib/validations/quotes.ts`, `src/app/dashboard/quotes/page.tsx`, `src/components/quotes/QuoteStatusBadge.tsx`

- [ ] tRPC: `list` (filter by status, filter by client, paginated), `updateStatus`
- [ ] Status badge: Draft (grey) / Sent (blue) / Accepted (green) / Declined (red) / Invoiced (purple)
- [ ] Expiry warning: visual indicator when past-expiry and status is Draft or Sent

---

## Slice 8 — Quote creation
**Files:** `src/app/dashboard/quotes/new/page.tsx`, `src/components/quotes/LineItemsEditor.tsx`, `src/server/routers/quotes.ts` (add `create`), `src/lib/validations/quotes.ts`

- [ ] Full-page form (own route — too complex for a Sheet)
- [ ] Client + job site selectors (fetched via tRPC)
- [ ] Line items editor: add/remove rows, description, quantity, unit price, subtotal
- [ ] Tax % + totals calculated client-side
- [ ] Auto-incremented quote number assigned on server
- [ ] Validation: at least one line item required

---

## Slice 9 — Quote detail + duplicate
**Files:** `src/app/dashboard/quotes/[id]/page.tsx`, `src/server/routers/quotes.ts` (add `getById`, `duplicate`), `src/components/quotes/ChangeStatusMenu.tsx`

- [ ] View quote: line items, totals, client/site info
- [ ] Status change dropdown (valid transitions only)
- [ ] Duplicate: copies quote, resets status to Draft, assigns new number
- [ ] Link to PDF export

---

## Slice 10 — PDF export
**Files:** `src/app/dashboard/quotes/[id]/pdf/page.tsx`

- [ ] Print-optimised layout, no sidebar shell
- [ ] Quote header: business name, logo placeholder, quote number
- [ ] Client details, line items table, totals, notes/terms
- [ ] `window.print()` for download (no server-side PDF generation in MVP)

---

## Slice 11 — Dashboard
**Files:** `src/app/dashboard/page.tsx`, `src/server/routers/dashboard.ts`

- [ ] tRPC: `summary` — active job count, current-month invoiced revenue, last 10 activity events
- [ ] Activity: query clients/job-sites/quotes by `created_at`/`updated_at`, sorted descending
- [ ] Three stat cards + activity feed list

---

## Slice 12 — Stripe / payment
**Files:** `src/app/payment/page.tsx`, `src/app/api/stripe/webhook/route.ts`, `src/server/routers/billing.ts`

- [ ] Stripe Checkout session for $19/month subscription
- [ ] Webhook: `checkout.session.completed` → update `profiles.plan = 'premium'`
- [ ] Upgrade prompt component (reused in slice 5 free-tier gate)

---

## Slice order

1 → 2 are blocking (everything needs auth + tRPC). After that: 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12.
