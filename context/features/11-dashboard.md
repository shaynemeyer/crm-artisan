# Slice 11 — Dashboard

## Goal

Build the dashboard page with three stat cards and an activity feed. Stats: active job count (Planned + In Progress), current-month invoiced revenue, and the last 10 activity events across clients, job sites, and quotes. All data from a single tRPC `summary` query.

## Prerequisites

- All prior slices complete (clients, job sites, quotes routers exist)
- `RECENT_ACTIVITY_LIMIT = 10` constant defined in `src/lib/constants.ts`

---

## Data model reference

```ts
// Activity is derived — not a stored table
// Events come from:
//   clients.createdAt   → "New client: {name}"
//   jobSites.createdAt  → "New job site: {title}"
//   quotes.createdAt    → "New quote: Q-{number}"
//   quotes.updatedAt    → "Quote {Q-nnn} status changed to {status}"
// Sorted by timestamp descending, limited to RECENT_ACTIVITY_LIMIT
```

---

## Files to create / modify

### 1. `src/server/routers/dashboard.ts`

```ts
import { router, protectedProcedure } from '@/server/trpc';
import { db } from '@/lib/db';
import { clients, jobSites, quotes } from '@/lib/db/schema';
import { eq, and, gte, inArray, sql, desc } from 'drizzle-orm';
import { RECENT_ACTIVITY_LIMIT } from '@/lib/constants';

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Start of current month
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    const [
      activeJobCountResult,
      revenueResult,
      recentClients,
      recentJobSites,
      recentQuotes,
    ] = await Promise.all([
      // Active job sites: Planned + In Progress
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobSites)
        .where(
          and(
            eq(jobSites.userId, userId),
            inArray(jobSites.status, ['planned', 'in_progress']),
          ),
        ),

      // Monthly revenue: sum of invoiced quotes this month
      db.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` }).from(
        // Subquery: compute total per quote from its items + tax
        db
          .select({
            id: quotes.id,
            total_amount: sql<number>`
                (SELECT COALESCE(SUM(qi.quantity::numeric * qi.unit_price::numeric), 0)
                 FROM quote_items qi WHERE qi.quote_id = ${quotes.id})
                * (1 + ${quotes.taxRate}::numeric / 100)
              `.as('total_amount'),
          })
          .from(quotes)
          .where(
            and(
              eq(quotes.userId, userId),
              eq(quotes.status, 'invoiced'),
              gte(quotes.issueDate, monthStart.split('T')[0]),
            ),
          )
          .as('invoiced'),
      ),

      // Last N clients
      db
        .select({
          id: clients.id,
          name: clients.name,
          createdAt: clients.createdAt,
        })
        .from(clients)
        .where(eq(clients.userId, userId))
        .orderBy(desc(clients.createdAt))
        .limit(RECENT_ACTIVITY_LIMIT),

      // Last N job sites
      db
        .select({
          id: jobSites.id,
          title: jobSites.title,
          createdAt: jobSites.createdAt,
        })
        .from(jobSites)
        .where(eq(jobSites.userId, userId))
        .orderBy(desc(jobSites.createdAt))
        .limit(RECENT_ACTIVITY_LIMIT),

      // Last N quotes (by updatedAt for status changes, createdAt for new)
      db
        .select({
          id: quotes.id,
          number: quotes.number,
          status: quotes.status,
          createdAt: quotes.createdAt,
          updatedAt: quotes.updatedAt,
        })
        .from(quotes)
        .where(eq(quotes.userId, userId))
        .orderBy(desc(quotes.updatedAt))
        .limit(RECENT_ACTIVITY_LIMIT),
    ]);

    // Build activity feed
    type ActivityEvent = { label: string; timestamp: Date; href: string };
    const events: ActivityEvent[] = [
      ...recentClients.map((c) => ({
        label: `New client: ${c.name}`,
        timestamp: new Date(c.createdAt),
        href: `/dashboard/clients/${c.id}`,
      })),
      ...recentJobSites.map((s) => ({
        label: `New job site: ${s.title}`,
        timestamp: new Date(s.createdAt),
        href: `/dashboard/job-sites/${s.id}`,
      })),
      ...recentQuotes.map((q) => {
        const num = `Q-${String(q.number).padStart(3, '0')}`;
        const isNew = q.createdAt === q.updatedAt;
        return {
          label: isNew ? `New quote: ${num}` : `${num} marked as ${q.status}`,
          timestamp: new Date(q.updatedAt),
          href: `/dashboard/quotes/${q.id}`,
        };
      }),
    ];

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const activity = events.slice(0, RECENT_ACTIVITY_LIMIT).map((e) => ({
      label: e.label,
      timestamp: e.timestamp.toISOString(),
      href: e.href,
    }));

    return {
      activeJobCount: Number(activeJobCountResult[0]?.count ?? 0),
      monthlyRevenue: Number(revenueResult[0]?.total ?? 0),
      activity,
    };
  }),
});
```

Register in `src/server/routers/_app.ts`:

```ts
import { dashboardRouter } from './dashboard';
export const appRouter = router({
  clients: clientsRouter,
  jobSites: jobSitesRouter,
  quotes: quotesRouter,
  dashboard: dashboardRouter,
});
```

**Note on revenue query**: The raw SQL subquery approach above may need adjustment depending on how Drizzle handles nested `from` with subqueries. If it causes issues, simplify by fetching invoiced quotes and summing in JS:

```ts
// Fallback: compute revenue in JS
const invoicedQuotes = await db
  .select({ id: quotes.id, taxRate: quotes.taxRate })
  .from(quotes)
  .where(
    and(
      eq(quotes.userId, userId),
      eq(quotes.status, 'invoiced'),
      gte(quotes.issueDate, monthStart.split('T')[0]),
    ),
  );

// For each quote, fetch items and sum
// (only viable with a small number of invoiced quotes per month)
```

This is acceptable for MVP — a solo artisan won't have hundreds of quotes per month.

---

### 2. `src/app/dashboard/page.tsx`

```tsx
'use client';

import Link from 'next/link';
import { Briefcase, DollarSign, Activity } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRelativeTime(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const { data, isLoading } = trpc.dashboard.summary.useQuery();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border p-4 md:p-5 flex items-start gap-4">
          <div className="rounded-md bg-primary/10 p-2.5">
            <Briefcase className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active job sites</p>
            <p className="text-2xl font-semibold mt-0.5">
              {isLoading ? '—' : (data?.activeJobCount ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Planned + In Progress
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4 md:p-5 flex items-start gap-4">
          <div className="rounded-md bg-primary/10 p-2.5">
            <DollarSign className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Revenue this month</p>
            <p className="text-2xl font-semibold mt-0.5">
              {isLoading ? '—' : formatCurrency(data?.monthlyRevenue ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invoiced quotes
            </p>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Activity className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Recent activity</h2>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {!isLoading && data?.activity.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No activity yet. Start by adding a client.
            </p>
          </div>
        )}

        {data?.activity.map((event, i) => (
          <Link
            key={i}
            href={event.href}
            className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/30 text-sm"
          >
            <span>{event.label}</span>
            <span className="text-xs text-muted-foreground shrink-0 ml-4">
              {formatRelativeTime(event.timestamp)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

---

## Currency note

`formatCurrency` defaults to `"USD"`. For MVP this is acceptable. In a future slice, fetch the user's profile currency from tRPC and pass it into `Intl.NumberFormat`.

---

## Checklist

- [ ] Create `src/server/routers/dashboard.ts`
- [ ] Register `dashboardRouter` in `src/server/routers/_app.ts`
- [ ] Replace `src/app/dashboard/page.tsx` with the wired version
- [ ] Verify: active job count reflects Planned + In Progress job sites only
- [ ] Verify: monthly revenue sums only Invoiced quotes with `issueDate` in the current month
- [ ] Verify: activity feed shows up to 10 events, newest first
- [ ] Verify: activity links navigate to the correct detail pages
- [ ] Verify: empty state shows when no activity
