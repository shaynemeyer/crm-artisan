# Slice 7 — Quotes: List + Status

## Goal

Build the quotes list page with filtering (by status and client) and pagination. Create a reusable `QuoteStatusBadge`. Implement `updateStatus` so status can be changed inline from the list. Wire up the quotes section on Client Detail (slice 4) and Job Site Detail (slice 6).

## Prerequisites

- Slice 2 (tRPC + constants) complete
- Slice 3 (Clients CRUD) complete — `clientsRouter.list` needed for filter dropdown
- Slice 5 (Job Sites CRUD) complete — `jobSitesRouter` needed for `listByJobSite`
- Slice 4 + 6 detail pages exist — quotes placeholder sections ready to wire up

---

## Data model reference

```ts
quotes: {
  id: uuid (PK)
  userId: uuid
  clientId: uuid (FK → clients.id, cascade delete)
  jobSiteId: uuid (FK → job_sites.id, cascade delete)
  number: integer (auto-incremented, not a DB sequence — assigned in app logic)
  currency: text (default "USD")
  status: enum("draft" | "sent" | "accepted" | "declined" | "invoiced")
  issueDate: date
  expiryDate: date (optional)
  taxRate: numeric(5,2)
  notes: text (optional)
  createdAt: timestamp
}

quoteStatusEnum: "draft" | "sent" | "accepted" | "declined" | "invoiced"
```

Ensure cascade deletes are set in schema:

```ts
clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
jobSiteId: uuid("job_site_id").notNull().references(() => jobSites.id, { onDelete: "cascade" }),
```

---

## Files to create / modify

### 1. `src/lib/validations/quotes.ts` (partial — full schema added in slice 8)

```ts
import { z } from 'zod';

export const quoteStatusEnum = z.enum([
  'draft',
  'sent',
  'accepted',
  'declined',
  'invoiced',
]);
export type QuoteStatus = z.infer<typeof quoteStatusEnum>;

// Valid status transitions — used to restrict the change-status UI
export const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined'],
  accepted: ['invoiced'],
  declined: [],
  invoiced: [],
};
```

---

### 2. `src/server/routers/quotes.ts`

```ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '@/server/trpc';
import { db } from '@/lib/db';
import { quotes } from '@/lib/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { quoteStatusEnum, VALID_TRANSITIONS } from '@/lib/validations/quotes';
import { PAGE_SIZE } from '@/lib/constants';

export const quotesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        status: quoteStatusEnum.optional(),
        clientId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * PAGE_SIZE;
      const conditions = [
        eq(quotes.userId, ctx.userId),
        ...(input.status ? [eq(quotes.status, input.status)] : []),
        ...(input.clientId ? [eq(quotes.clientId, input.clientId)] : []),
      ];
      const where = and(...conditions);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(quotes)
          .where(where)
          .orderBy(desc(quotes.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset),
        db.select({ total: count() }).from(quotes).where(where),
      ]);
      return { rows, total: Number(total), pageSize: PAGE_SIZE };
    }),

  listByClient: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.clientId, input.clientId),
            eq(quotes.userId, ctx.userId),
          ),
        )
        .orderBy(desc(quotes.createdAt));
      return { rows };
    }),

  listByJobSite: protectedProcedure
    .input(z.object({ jobSiteId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(quotes)
        .where(
          and(
            eq(quotes.jobSiteId, input.jobSiteId),
            eq(quotes.userId, ctx.userId),
          ),
        )
        .orderBy(desc(quotes.createdAt));
      return { rows };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [quote] = await db
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, input.id), eq(quotes.userId, ctx.userId)));
      if (!quote) throw new TRPCError({ code: 'NOT_FOUND' });
      return quote;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: quoteStatusEnum,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select({ status: quotes.status })
        .from(quotes)
        .where(and(eq(quotes.id, input.id), eq(quotes.userId, ctx.userId)));

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot transition from ${existing.status} to ${input.status}.`,
        });
      }

      const [updated] = await db
        .update(quotes)
        .set({ status: input.status })
        .where(and(eq(quotes.id, input.id), eq(quotes.userId, ctx.userId)))
        .returning();
      return updated;
    }),
});
```

Register in `src/server/routers/_app.ts`:

```ts
import { quotesRouter } from './quotes';
export const appRouter = router({
  clients: clientsRouter,
  jobSites: jobSitesRouter,
  quotes: quotesRouter,
});
```

---

### 3. `src/components/quotes/QuoteStatusBadge.tsx`

```tsx
import { cn } from '@/lib/utils';
import type { QuoteStatus } from '@/lib/validations/quotes';

const config: Record<QuoteStatus, { label: string; classes: string }> = {
  draft: { label: 'Draft', classes: 'bg-muted text-muted-foreground' },
  sent: {
    label: 'Sent',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  accepted: {
    label: 'Accepted',
    classes:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  declined: {
    label: 'Declined',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  invoiced: {
    label: 'Invoiced',
    classes:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { label, classes } = config[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        classes,
      )}
    >
      {label}
    </span>
  );
}
```

---

### 4. `src/app/dashboard/quotes/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { QuoteStatusBadge } from '@/components/quotes/QuoteStatusBadge';
import { VALID_TRANSITIONS, type QuoteStatus } from '@/lib/validations/quotes';

function isExpired(expiryDate: string | null, status: QuoteStatus) {
  if (!expiryDate) return false;
  if (status !== 'draft' && status !== 'sent') return false;
  return new Date(expiryDate) < new Date();
}

function formatQuoteNumber(n: number) {
  return `Q-${String(n).padStart(3, '0')}`;
}

export default function QuotesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.quotes.list.useQuery({
    page,
    status: statusFilter === 'all' ? undefined : statusFilter,
    clientId: clientFilter === 'all' ? undefined : clientFilter,
  });
  const { data: clientsData } = trpc.clients.list.useQuery({
    page: 1,
    search: '',
  });

  const updateStatus = trpc.quotes.updateStatus.useMutation({
    onSuccess: () => {
      utils.quotes.list.invalidate();
      toast.success('Status updated');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Quotes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track your quotes.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/quotes/new">
            <Plus className="size-4 mr-2" />
            New Quote
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as QuoteStatus | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={clientFilter}
          onValueChange={(v) => {
            setClientFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientsData?.rows.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <div className="hidden md:grid md:grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 border-b bg-muted/40">
          {['Quote #', 'Client', 'Issued', 'Status'].map((col) => (
            <span
              key={col}
              className="text-sm font-medium text-muted-foreground"
            >
              {col}
            </span>
          ))}
          <span />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {!isLoading && data?.rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium">No quotes found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter !== 'all' || clientFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Create your first quote to get started.'}
            </p>
            {statusFilter === 'all' && clientFilter === 'all' && (
              <Button className="mt-4" asChild>
                <Link href="/dashboard/quotes/new">
                  <Plus className="size-4 mr-2" />
                  New Quote
                </Link>
              </Button>
            )}
          </div>
        )}

        {data?.rows.map((quote) => {
          const expired = isExpired(quote.expiryDate, quote.status);
          const nextStatuses = VALID_TRANSITIONS[quote.status];
          const clientName =
            clientsData?.rows.find((c) => c.id === quote.clientId)?.name ?? '—';

          return (
            <div key={quote.id}>
              {/* Desktop row */}
              <div className="hidden md:grid md:grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 border-b last:border-0 items-center hover:bg-muted/30 text-sm">
                <Link
                  href={`/dashboard/quotes/${quote.id}`}
                  className="font-medium hover:underline whitespace-nowrap"
                >
                  {formatQuoteNumber(quote.number)}
                </Link>
                <span className="text-muted-foreground">{clientName}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {quote.issueDate}
                </span>
                <div className="flex items-center gap-1.5">
                  <QuoteStatusBadge status={quote.status} />
                  {expired && (
                    <span title="Expired">
                      <AlertTriangle className="size-3.5 text-amber-500" />
                    </span>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/quotes/${quote.id}`}>View</Link>
                    </DropdownMenuItem>
                    {nextStatuses.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() =>
                          updateStatus.mutate({ id: quote.id, status: s })
                        }
                      >
                        Mark as {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mobile card */}
              <div className="md:hidden flex items-start justify-between p-4 border-b last:border-0">
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/dashboard/quotes/${quote.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {formatQuoteNumber(quote.number)}
                  </Link>
                  <p className="text-xs text-muted-foreground">{clientName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <QuoteStatusBadge status={quote.status} />
                    {expired && (
                      <AlertTriangle className="size-3.5 text-amber-500" />
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/quotes/${quote.id}`}>View</Link>
                    </DropdownMenuItem>
                    {nextStatuses.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() =>
                          updateStatus.mutate({ id: quote.id, status: s })
                        }
                      >
                        Mark as {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">{data.total} quotes</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### 5. Wire up quotes section on Client Detail (`src/app/dashboard/clients/[id]/page.tsx`)

```tsx
// Add query:
const { data: quotesData } = trpc.quotes.listByClient.useQuery({
  clientId: id,
});

// Replace quotes placeholder section body:
{
  quotesData?.rows.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">No quotes yet.</p>
    </div>
  ) : (
    quotesData?.rows.map((quote) => (
      <Link
        key={quote.id}
        href={`/dashboard/quotes/${quote.id}`}
        className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/30 text-sm"
      >
        <span className="font-medium">
          Q-{String(quote.number).padStart(3, '0')}
        </span>
        <QuoteStatusBadge status={quote.status} />
      </Link>
    ))
  );
}
```

### 6. Wire up quotes section on Job Site Detail (`src/app/dashboard/job-sites/[id]/page.tsx`)

```tsx
// Add query:
const { data: quotesData } = trpc.quotes.listByJobSite.useQuery({
  jobSiteId: id,
});

// Replace quotes placeholder section body:
<div className="flex items-center justify-between px-4 py-3 border-b">
  <h2 className="text-sm font-medium">Quotes</h2>
  <Button size="sm" asChild>
    <Link href={`/dashboard/quotes/new?jobSiteId=${id}`}>
      <Plus className="size-4 mr-2" />
      New Quote
    </Link>
  </Button>
</div>;
{
  quotesData?.rows.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">No quotes yet.</p>
    </div>
  ) : (
    quotesData?.rows.map((quote) => (
      <Link
        key={quote.id}
        href={`/dashboard/quotes/${quote.id}`}
        className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/30 text-sm"
      >
        <span className="font-medium">
          Q-{String(quote.number).padStart(3, '0')}
        </span>
        <QuoteStatusBadge status={quote.status} />
      </Link>
    ))
  );
}
```

---

## Expiry warning logic

- Show the `AlertTriangle` icon when `expiryDate` is in the past AND status is `draft` or `sent`
- No automatic status change — visual warning only
- Tooltip or `title` attribute on the icon: "Expired"

## Status transitions

Only allow valid transitions — server enforces via `VALID_TRANSITIONS`, client hides invalid options from the dropdown:

- `draft` → `sent`
- `sent` → `accepted` | `declined`
- `accepted` → `invoiced`
- `declined` → (terminal)
- `invoiced` → (terminal)

---

## Checklist

- [ ] Confirm `clientId` and `jobSiteId` FKs have `onDelete: "cascade"` in schema
- [ ] Create `src/lib/validations/quotes.ts` (status enum + VALID_TRANSITIONS)
- [ ] Create `src/server/routers/quotes.ts`
- [ ] Register `quotesRouter` in `src/server/routers/_app.ts`
- [ ] Create `src/components/quotes/QuoteStatusBadge.tsx`
- [ ] Create `src/app/dashboard/quotes/page.tsx`
- [ ] Wire up quotes section in `src/app/dashboard/clients/[id]/page.tsx`
- [ ] Wire up quotes section in `src/app/dashboard/job-sites/[id]/page.tsx`
- [ ] Verify: quotes list loads, filters work
- [ ] Verify: status badge colours match spec (draft grey, sent blue, accepted green, declined red, invoiced purple)
- [ ] Verify: expired quotes show warning icon
- [ ] Verify: "Mark as X" in dropdown updates status, only valid transitions appear
- [ ] Verify: invalid transitions rejected by server with a clear error toast
