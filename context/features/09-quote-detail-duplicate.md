# Slice 9 — Quote Detail + Duplicate

## Goal

Build the quote detail page at `/dashboard/quotes/[id]`. Show all quote data including line items and totals. Provide a status change menu (valid transitions only). Implement duplicate (copy quote, reset to draft, assign new number). Link to PDF export.

## Prerequisites

- Slice 7 (Quotes list + status) complete — `quotesRouter` with `getById`, `updateStatus`, `VALID_TRANSITIONS`
- Slice 8 (Quote creation) complete — `quoteItems` table, `create` procedure, `createQuoteSchema`

---

## Files to create / modify

### 1. `src/server/routers/quotes.ts` — add `getWithItems` and `duplicate`

**`getWithItems`** — fetches the quote and all its line items in one call:

```ts
import { quoteItems } from "@/lib/db/schema";

getWithItems: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, input.id), eq(quotes.userId, ctx.userId)));
    if (!quote) throw new TRPCError({ code: "NOT_FOUND" });

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quote.id));

    return { ...quote, items };
  }),
```

**`duplicate`** — copies quote + items, resets status to draft, assigns next number:

```ts
duplicate: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    return await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.id, input.id), eq(quotes.userId, ctx.userId)));
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });

      const sourceItems = await tx
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, source.id));

      const [{ nextNum }] = await tx
        .select({ nextNum: sql<number>`COALESCE(MAX(${quotes.number}), 0) + 1` })
        .from(quotes)
        .where(eq(quotes.userId, ctx.userId));

      const today = new Date().toISOString().split("T")[0];
      const [newQuote] = await tx
        .insert(quotes)
        .values({
          userId: source.userId,
          clientId: source.clientId,
          jobSiteId: source.jobSiteId,
          number: nextNum,
          currency: source.currency,
          status: "draft",
          issueDate: today,
          expiryDate: null,
          taxRate: source.taxRate,
          notes: source.notes,
        })
        .returning();

      if (sourceItems.length > 0) {
        await tx.insert(quoteItems).values(
          sourceItems.map(({ description, quantity, unitPrice }) => ({
            quoteId: newQuote.id,
            description,
            quantity,
            unitPrice,
          }))
        );
      }

      return newQuote;
    });
  }),
```

Add imports at top of router: `import { sql } from "drizzle-orm";`

---

### 2. `src/components/quotes/ChangeStatusMenu.tsx`

Dropdown showing only valid next statuses. Used on the detail page.

```tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { VALID_TRANSITIONS, type QuoteStatus } from '@/lib/validations/quotes';

interface Props {
  quoteId: string;
  currentStatus: QuoteStatus;
  onSuccess?: () => void;
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  invoiced: 'Invoiced',
};

export function ChangeStatusMenu({ quoteId, currentStatus, onSuccess }: Props) {
  const utils = trpc.useUtils();
  const nextStatuses = VALID_TRANSITIONS[currentStatus];

  const updateStatus = trpc.quotes.updateStatus.useMutation({
    onSuccess: () => {
      utils.quotes.getWithItems.invalidate({ id: quoteId });
      utils.quotes.list.invalidate();
      toast.success('Status updated');
      onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  if (nextStatuses.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={updateStatus.isPending}>
          Change status
          <ChevronDown className="size-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {nextStatuses.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => updateStatus.mutate({ id: quoteId, status: s })}
          >
            Mark as {STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

### 3. `src/app/dashboard/quotes/[id]/page.tsx`

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { QuoteStatusBadge } from '@/components/quotes/QuoteStatusBadge';
import { ChangeStatusMenu } from '@/components/quotes/ChangeStatusMenu';

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatQuoteNumber(n: number) {
  return `Q-${String(n).padStart(3, '0')}`;
}

function isExpired(expiryDate: string | null | undefined, status: string) {
  if (!expiryDate) return false;
  if (status !== 'draft' && status !== 'sent') return false;
  return new Date(expiryDate) < new Date();
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const utils = trpc.useUtils();
  const { data: quote, isLoading } = trpc.quotes.getWithItems.useQuery({ id });
  const { data: clientData } = trpc.clients.getById.useQuery(
    { id: quote?.clientId ?? '' },
    { enabled: !!quote?.clientId },
  );
  const { data: siteData } = trpc.jobSites.getById.useQuery(
    { id: quote?.jobSiteId ?? '' },
    { enabled: !!quote?.jobSiteId },
  );

  const duplicate = trpc.quotes.duplicate.useMutation({
    onSuccess: (newQuote) => {
      utils.quotes.list.invalidate();
      toast.success(`Duplicated as ${formatQuoteNumber(newQuote.number)}`);
      router.push(`/dashboard/quotes/${newQuote.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!quote) {
    return (
      <div className="text-sm text-muted-foreground">Quote not found.</div>
    );
  }

  const subtotal = quote.items.reduce((sum, item) => {
    return sum + Number(item.quantity) * Number(item.unitPrice);
  }, 0);
  const taxAmount = (subtotal * Number(quote.taxRate)) / 100;
  const total = subtotal + taxAmount;
  const expired = isExpired(quote.expiryDate, quote.status);

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <div className="mb-6">
        <Link
          href="/dashboard/quotes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Quotes
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {formatQuoteNumber(quote.number)}
          </h1>
          <div className="flex items-center gap-2">
            <QuoteStatusBadge status={quote.status} />
            {expired && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="size-3.5" />
                Expired
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ChangeStatusMenu quoteId={id} currentStatus={quote.status} />
          <Button
            variant="outline"
            onClick={() => duplicate.mutate({ id })}
            disabled={duplicate.isPending}
          >
            <Copy className="size-4 mr-2" />
            {duplicate.isPending ? 'Duplicating…' : 'Duplicate'}
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/dashboard/quotes/${id}/pdf`}>
              <FileText className="size-4 mr-2" />
              Export PDF
            </Link>
          </Button>
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-lg border p-4 md:p-5 mb-6">
        <h2 className="text-sm font-medium mb-4">Details</h2>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Client</dt>
            <dd>
              {clientData ? (
                <Link
                  href={`/dashboard/clients/${clientData.id}`}
                  className="hover:underline"
                >
                  {clientData.name}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Job site</dt>
            <dd>
              {siteData ? (
                <Link
                  href={`/dashboard/job-sites/${siteData.id}`}
                  className="hover:underline"
                >
                  {siteData.title}
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Currency</dt>
            <dd>{quote.currency}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Issue date</dt>
            <dd>{formatDate(quote.issueDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">
              Expiry date
            </dt>
            <dd className={expired ? 'text-amber-600' : ''}>
              {formatDate(quote.expiryDate)}
            </dd>
          </div>
        </dl>
      </div>

      {/* Line items */}
      <div className="rounded-lg border mb-6">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-medium">Line items</h2>
        </div>
        <div className="hidden md:grid md:grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="w-16 text-right">Qty</span>
          <span className="w-24 text-right">Unit price</span>
          <span className="w-24 text-right">Subtotal</span>
        </div>
        {quote.items.map((item) => {
          const lineTotal = Number(item.quantity) * Number(item.unitPrice);
          return (
            <div
              key={item.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-b last:border-0 text-sm"
            >
              <span>{item.description}</span>
              <span className="md:w-16 md:text-right text-muted-foreground">
                {item.quantity}
              </span>
              <span className="md:w-24 md:text-right text-muted-foreground">
                {quote.currency} {Number(item.unitPrice).toFixed(2)}
              </span>
              <span className="md:w-24 md:text-right">
                {quote.currency} {lineTotal.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="rounded-lg border p-4 md:p-5 mb-6">
        <div className="flex flex-col gap-2 max-w-xs ml-auto text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>
              {quote.currency} {subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Tax ({quote.taxRate}%)
            </span>
            <span>
              {quote.currency} {taxAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Total</span>
            <span>
              {quote.currency} {total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="rounded-lg border p-4 md:p-5">
          <h2 className="text-sm font-medium mb-2">Notes / terms</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {quote.notes}
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Edge cases

- **Duplicate resets expiry date**: the duplicated quote gets today as `issueDate` and `null` for `expiryDate` — the artisan sets a new expiry if needed.
- **Duplicate of a terminal status**: allowed — e.g. duplicating an `invoiced` quote to create a revised version.
- **`ChangeStatusMenu` returns null** for terminal statuses (`declined`, `invoiced`) — no change-status button rendered.
- **Totals on detail page**: recalculated client-side from items; the stored `taxRate` on the quote record is used (not re-fetched from the profile).

---

## Checklist

- [ ] Add `getWithItems` procedure to `src/server/routers/quotes.ts`
- [ ] Add `duplicate` procedure to `src/server/routers/quotes.ts`
- [ ] Create `src/components/quotes/ChangeStatusMenu.tsx`
- [ ] Create `src/app/dashboard/quotes/[id]/page.tsx`
- [ ] Verify: quote detail shows all fields, items, and totals
- [ ] Verify: `ChangeStatusMenu` only shows valid next statuses
- [ ] Verify: status change updates badge immediately after success
- [ ] Verify: terminal statuses show no change-status button
- [ ] Verify: duplicate creates a new quote with next number, redirects to it
- [ ] Verify: expired quotes show "Expired" warning
- [ ] Verify: "Export PDF" links to `/dashboard/quotes/[id]/pdf`
