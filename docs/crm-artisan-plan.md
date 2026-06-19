# Artisan CRM — Specification

## Overview

A lightweight CRM for independent tradespeople to manage clients, job sites, and quotes from a single interface. Target users: solo or small-team plumbers, electricians, and carpenters.

---

## Responsive Design

The app is **mobile-first**. Primary use case is a tradesperson using a mid-range Android phone on a job site. All screens must work well at 360 px width and scale up gracefully to tablet and desktop.

### Breakpoints

| Breakpoint | Width    | Layout                                                  |
| ---------- | -------- | ------------------------------------------------------- |
| Mobile     | < 768 px | Full-width content; fixed bottom tab bar for navigation |
| Tablet     | ≥ 768 px | Collapsed icon-only sidebar; content fills remainder    |
| Desktop    | ≥ 1024px | Expanded sidebar with icons + labels                    |

### Navigation

- **Mobile:** Fixed bottom tab bar with icons + labels for the four primary sections (Dashboard, Clients, Job Sites, Quotes).
- **Tablet / Desktop:** Left sidebar, fixed height, scrollable nav section.

### General rules

- Touch targets ≥ 44 × 44 px.
- Font sizes, spacing, and tap targets defined with Tailwind responsive prefixes (`md:`, `lg:`).
- Tables on mobile become card-stacked lists or horizontally scroll rather than overflowing the viewport.
- Forms use single-column layout on mobile, two-column where space allows on desktop.
- PDF export page is exempt from the mobile layout shell — it renders a print-optimised view.

---

## Target User (Persona)

An independent plumber, aged 35–55, working alone or with one helper. Not comfortable with digital tools — prefers simple, obvious UI with minimal steps. Uses a mid-range Android phone (~$300) as their primary device. The app must work well on a small screen, load fast on a modest connection, and never require more than a few taps to complete a common task.

### Daily Scenarios

| Time    | Scenario                                                                                      |
| ------- | --------------------------------------------------------------------------------------------- |
| Morning | Opens the app and sees today's active job sites at a glance on the dashboard                  |
| Midday  | A client calls for a quote — creates it on their phone in a few taps between two appointments |
| Evening | Reviews and sends PDF quotes to clients                                                       |
| Sunday  | Checks monthly revenue on the dashboard to review the week's earnings                         |

These scenarios drive the priority order for UI polish: dashboard job visibility first, fast quote creation second, PDF export third.

---

## Pricing Tiers

| Feature   | Free               | Premium ($19/month) |
| --------- | ------------------ | ------------------- |
| Job sites | Max 5 (any status) | Unlimited           |

Tier is stored on the user profile. Enforcement: block job site creation when the free-tier limit is reached and prompt an upgrade.

---

## User Profile

Each user represents one artisan business. Profile fields:

- Full name, trade type (plumber / electrician / carpenter / other)
- Business name, phone, email
- Logo (optional)
- Default quote currency and tax rate
- Plan: free / premium

Authentication: email + password via NextAuth v5 (Auth.js). Session stored as a JWT; middleware protects all routes under `/dashboard`.

---

## Features

### 1. Clients

Manage the people who hire you.

**Data:**

- Name, company (optional)
- Phone (required), email (required)
- Address
- Notes (free text)
- Created date, updated date

**Actions:** Create, view, edit, delete. View all jobs and quotes for a client.

**List:** Search by name or company. Paginated — page size from `constants`.

**Edge cases:**

- Phone and email are both required — a client cannot be saved without them.
- Deleting a client cascades to all their job sites and quotes.
- A client with no job sites or quotes shows empty states, not errors.

---

### 2. Job Sites

A physical location where work is performed. A client can have multiple job sites.

**Data:**

- Title (e.g. "Kitchen remodel")
- Address
- Start date, end date (optional)
- Status: Planned / In Progress / Completed
- Linked client

**Actions:** Create, view, edit, delete. View all quotes attached to a site.

**List:** Filter by client, filter by status. Paginated — page size from `constants`.

**Edge cases:**

- End date is optional — valid for ongoing or open-ended work.
- Deleting a job site cascades to all its quotes.
- All job sites count toward the free-tier limit of 5, regardless of status.
- Creating a job site when the free-tier limit is reached is blocked with an upgrade prompt.

---

### 3. Quotes

A priced proposal sent to a client for work at a site.

**Data:**

- Quote number (auto-incremented, prefixed: Q-001, Q-002 …)
- Linked client + job site
- Currency (inherited from user profile, stored on the quote)
- Issue date, expiry date
- Status: Draft / Sent / Accepted / Declined / Invoiced
- Line items: description, quantity, unit price, subtotal
- Tax (%) applied to total
- Total (calculated)
- Notes / terms (free text)

**Actions:** Create, edit (while Draft), change status, export/download PDF, duplicate.

**List:** Filter by status, filter by client. Paginated — page size from `constants`.

**Edge cases:**

- A quote cannot be saved with zero line items.
- Line items with zero quantity or zero unit price are allowed (e.g. complimentary items).
- When a quote's expiry date has passed and its status is still Draft or Sent, display a visual warning — no automatic status change.

---

## Dashboard

- **Active job count:** number of job sites with status Planned or In Progress.
- **Monthly revenue:** sum of all Invoiced quotes issued in the current calendar month.
- **Recent activity:** last 10 events across — quote status changes, new clients created, new job sites created, new quotes created.

---

## Screens

| Screen          | Route                        | Description                                                       |
| --------------- | ---------------------------- | ----------------------------------------------------------------- |
| Login           | `/login`                     | Email + password sign-in                                          |
| Dashboard       | `/dashboard`                 | Active job count, monthly revenue, recent activity                |
| Client List     | `/dashboard/clients`         | Searchable, paginated list of clients                             |
| Client Detail   | `/dashboard/clients/[id]`    | View/edit client, linked job sites and quotes                     |
| Job Site List   | `/dashboard/job-sites`       | Filterable (client, status), paginated list of job sites          |
| Job Site Detail | `/dashboard/job-sites/[id]`  | View/edit job site, linked quotes                                 |
| Quote List      | `/dashboard/quotes`          | Filterable (status, client), paginated list of quotes             |
| Quote Detail    | `/dashboard/quotes/[id]`     | View quote, change status, duplicate, export PDF                  |
| Quote Creation  | `/dashboard/quotes/new`      | Create quote with line items, client, job site, dates             |
| PDF Export      | `/dashboard/quotes/[id]/pdf` | Rendered PDF view for download                                    |
| Payment         | `/payment`                   | Premium plan upgrade — Stripe checkout for $19/month subscription |

---

## Key Workflows

### "Create a quote and send it"

1. Log in → land on Dashboard
2. Go to Clients → find or create the client
3. On Client Detail → create a Job Site
4. On Job Site Detail → create a Quote
5. Add line items (description, quantity, unit price)
6. Save quote → export PDF
7. Download PDF → send to client by email (outside the app)

> Email sending is out of scope for MVP. The artisan downloads the PDF and sends it manually.

---

## User Flow

```text
Login (/login)
  └── Dashboard
        ├── Clients
        │     ├── Client List → Client Detail (view/edit, job sites, quotes)
        │     └── New Client (inline form on Client List)
        ├── Job Sites
        │     ├── Job Site List → Job Site Detail (view/edit, quotes)
        │     └── New Job Site (inline form on Job Site List)
        └── Quotes
              ├── Quote List → Quote Detail → PDF Export
              └── Quote Creation
```

---

## Data Model (Supabase / Postgres)

| Table         | Key columns                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `profiles`    | id (FK auth.users), name, trade, business_name, phone, currency, tax_rate, plan                         |
| `clients`     | id, user_id, name, company, phone, email, address, notes, created_at, updated_at                        |
| `job_sites`   | id, user_id, client_id, title, address, start_date, end_date, status, created_at                        |
| `quotes`      | id, user_id, client_id, job_site_id, number, currency, status, issue_date, expiry_date, tax_rate, notes |
| `quote_items` | id, quote_id, description, quantity, unit_price                                                         |

Row-level security: each user can only read/write their own rows. Cascade deletes: client → job_sites → quotes → quote_items.

---

## Constants (`src/lib/constants.ts`)

| Constant                 | Default | Description                             |
| ------------------------ | ------- | --------------------------------------- |
| `PAGE_SIZE`              | 20      | Rows per page across all lists          |
| `FREE_TIER_JOB_SITE_MAX` | 5       | Max job sites on the free plan          |
| `RECENT_ACTIVITY_LIMIT`  | 10      | Number of events shown on the dashboard |

---

## Out of Scope for MVP

- Invoicing / payment tracking
- Scheduling / calendar
- Photo attachments
- Mobile app
- Multi-user / team accounts
- Email sending from the app
