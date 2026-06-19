# Slice 8 — Quote Creation

## Goal

Build the quote creation page at `/dashboard/quotes/new`. This is a full-page form (not a Sheet) because of its complexity: client + job site selectors, a dynamic line items editor, tax rate, dates, and notes. The server auto-assigns the quote number. At least one line item is required.

## Prerequisites

- Slice 7 (Quotes list + status) complete — `quotesRouter` exists with `getById`; `quoteStatusEnum` defined in `src/lib/validations/quotes.ts`
- `clientsRouter.list` and `jobSitesRouter.list` available for dropdowns

---

## Data model reference

```ts
quotes: (id,
  userId,
  clientId,
  jobSiteId,
  number,
  currency,
  status,
  issueDate,
  expiryDate,
  taxRate,
  notes);
quote_items: (id, quoteId, description, quantity, unit_price);
```

Quote number strategy: `SELECT COALESCE(MAX(number), 0) + 1 FROM quotes WHERE user_id = $userId` — run inside the same transaction as the insert.

---

## Files to create / modify

### 1. `src/lib/validations/quotes.ts` — extend with full create schema

Add to the existing file (which already has `quoteStatusEnum` and `VALID_TRANSITIONS`):

```ts
export const quoteItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().min(0, 'Quantity must be 0 or more'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be 0 or more'),
});

export const createQuoteSchema = z.object({
  clientId: z.string().uuid('Client is required'),
  jobSiteId: z.string().uuid('Job site is required'),
  currency: z.string().min(1).default('USD'),
  issueDate: z.string().min(1, 'Issue date is required'),
  expiryDate: z.string().optional(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().optional(),
  items: z.array(quoteItemSchema).min(1, 'At least one line item is required'),
});

export type CreateQuoteValues = z.infer<typeof createQuoteSchema>;
export type QuoteItemValues = z.infer<typeof quoteItemSchema>;
```

---

### 2. `src/server/routers/quotes.ts` — add `create` procedure

Add to the existing `quotesRouter`:

```ts
import { quotes, quoteItems } from "@/lib/db/schema";
import { max, sql } from "drizzle-orm";
import { createQuoteSchema } from "@/lib/validations/quotes";

create: protectedProcedure
  .input(createQuoteSchema)
  .mutation(async ({ ctx, input }) => {
    return await db.transaction(async (tx) => {
      // Assign next quote number for this user
      const [{ nextNum }] = await tx
        .select({ nextNum: sql<number>`COALESCE(MAX(${quotes.number}), 0) + 1` })
        .from(quotes)
        .where(eq(quotes.userId, ctx.userId));

      const { items, ...quoteData } = input;
      const [quote] = await tx
        .insert(quotes)
        .values({
          ...quoteData,
          userId: ctx.userId,
          number: nextNum,
          status: "draft",
          taxRate: String(input.taxRate),
        })
        .returning();

      await tx.insert(quoteItems).values(
        items.map((item) => ({
          quoteId: quote.id,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice),
        }))
      );

      return quote;
    });
  }),
```

---

### 3. `src/components/quotes/LineItemsEditor.tsx`

Manages the dynamic line items array. Uses `useFieldArray` from react-hook-form.

```tsx
'use client';

import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CreateQuoteValues } from '@/lib/validations/quotes';

interface Props {
  form: UseFormReturn<CreateQuoteValues>;
  currency: string;
}

function calcSubtotal(qty: number | string, price: number | string) {
  const q = Number(qty) || 0;
  const p = Number(price) || 0;
  return (q * p).toFixed(2);
}

export function LineItemsEditor({ form, currency }: Props) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const items = form.watch('items');

  return (
    <div className="flex flex-col gap-3">
      {/* Desktop header */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs font-medium text-muted-foreground">
        <span>Description</span>
        <span className="w-20 text-right">Qty</span>
        <span className="w-28 text-right">Unit price</span>
        <span className="w-24 text-right">Subtotal</span>
        <span className="w-8" />
      </div>

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-start"
        >
          <div className="flex flex-col gap-1">
            <Input
              placeholder="Description"
              {...form.register(`items.${index}.description`)}
            />
            {form.formState.errors.items?.[index]?.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.items[index].description?.message}
              </p>
            )}
          </div>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Qty"
            className="w-full md:w-20 text-right"
            {...form.register(`items.${index}.quantity`)}
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="w-full md:w-28 text-right"
            {...form.register(`items.${index}.unitPrice`)}
          />
          <div className="w-full md:w-24 text-right text-sm pt-2 text-muted-foreground">
            {currency}{' '}
            {calcSubtotal(items[index]?.quantity, items[index]?.unitPrice)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-destructive"
            onClick={() => remove(index)}
            disabled={fields.length === 1}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      {form.formState.errors.items?.root && (
        <p className="text-xs text-destructive">
          {form.formState.errors.items.root.message}
        </p>
      )}
      {typeof form.formState.errors.items?.message === 'string' && (
        <p className="text-xs text-destructive">
          {form.formState.errors.items.message}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append({ description: '', quantity: 1, unitPrice: 0 })}
      >
        <Plus className="size-4 mr-2" />
        Add line item
      </Button>
    </div>
  );
}
```

---

### 4. `src/app/dashboard/quotes/new/page.tsx`

Full-page creation form. Reads optional `?jobSiteId=` query param to pre-select job site (used when linking from Job Site Detail).

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import {
  createQuoteSchema,
  type CreateQuoteValues,
} from '@/lib/validations/quotes';
import { LineItemsEditor } from '@/components/quotes/LineItemsEditor';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD'];

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedJobSiteId = searchParams.get('jobSiteId') ?? '';

  const { data: clientsData } = trpc.clients.list.useQuery({
    page: 1,
    search: '',
  });
  const [selectedClientId, setSelectedClientId] = useState('');
  const { data: jobSitesData } = trpc.jobSites.list.useQuery(
    { page: 1, clientId: selectedClientId || undefined },
    { enabled: true },
  );

  const form = useForm<CreateQuoteValues>({
    resolver: zodResolver(createQuoteSchema),
    defaultValues: {
      clientId: '',
      jobSiteId: preselectedJobSiteId,
      currency: 'USD',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: '',
      taxRate: 0,
      notes: '',
      items: [{ description: '', quantity: 1, unitPrice: 0 }],
    },
  });

  // If job site pre-selected, resolve its client
  useEffect(() => {
    if (preselectedJobSiteId && jobSitesData?.rows) {
      const site = jobSitesData.rows.find((s) => s.id === preselectedJobSiteId);
      if (site) {
        form.setValue('clientId', site.clientId);
        setSelectedClientId(site.clientId);
      }
    }
  }, [preselectedJobSiteId, jobSitesData]);

  const create = trpc.quotes.create.useMutation({
    onSuccess: (quote) => {
      toast.success('Quote created');
      router.push(`/dashboard/quotes/${quote.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(values: CreateQuoteValues) {
    create.mutate(values);
  }

  // Totals calculated client-side for display only
  const items = form.watch('items');
  const taxRate = Number(form.watch('taxRate')) || 0;
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;
  const currency = form.watch('currency');

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/dashboard/quotes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Quotes
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          New Quote
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the details below to create a quote.
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        {/* Client + Job Site */}
        <div className="rounded-lg border p-4 md:p-5">
          <h2 className="text-sm font-medium mb-4">Client & Job Site</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Client *</Label>
              <Select
                value={form.watch('clientId')}
                onValueChange={(v) => {
                  form.setValue('clientId', v);
                  form.setValue('jobSiteId', '');
                  setSelectedClientId(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clientsData?.rows.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.clientId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.clientId.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Job Site *</Label>
              <Select
                value={form.watch('jobSiteId')}
                onValueChange={(v) => form.setValue('jobSiteId', v)}
                disabled={!selectedClientId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedClientId
                        ? 'Select a job site'
                        : 'Select client first'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {jobSitesData?.rows
                    .filter((s) => s.clientId === selectedClientId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {form.formState.errors.jobSiteId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.jobSiteId.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Dates + Currency */}
        <div className="rounded-lg border p-4 md:p-5">
          <h2 className="text-sm font-medium mb-4">Quote details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issueDate">Issue date *</Label>
              <Input
                id="issueDate"
                type="date"
                {...form.register('issueDate')}
              />
              {form.formState.errors.issueDate && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.issueDate.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expiryDate">Expiry date</Label>
              <Input
                id="expiryDate"
                type="date"
                {...form.register('expiryDate')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Currency</Label>
              <Select
                value={form.watch('currency')}
                onValueChange={(v) => form.setValue('currency', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-lg border p-4 md:p-5">
          <h2 className="text-sm font-medium mb-4">Line items</h2>
          <LineItemsEditor form={form} currency={currency} />
        </div>

        {/* Totals + Tax */}
        <div className="rounded-lg border p-4 md:p-5">
          <h2 className="text-sm font-medium mb-4">Totals</h2>
          <div className="flex flex-col gap-3 max-w-xs ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>
                {currency} {subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <Label
                htmlFor="taxRate"
                className="text-muted-foreground shrink-0"
              >
                Tax (%)
              </Label>
              <Input
                id="taxRate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                className="w-20 text-right"
                {...form.register('taxRate')}
              />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span>
                {currency} {taxAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t pt-3">
              <span>Total</span>
              <span>
                {currency} {total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg border p-4 md:p-5">
          <h2 className="text-sm font-medium mb-4">Notes / terms</h2>
          <Textarea
            placeholder="Payment terms, special conditions, etc."
            rows={4}
            {...form.register('notes')}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create quote'}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

---

## Edge cases

- **At least one line item**: enforced by `z.array(quoteItemSchema).min(1, ...)` in the schema and by disabling the remove button when only one row remains.
- **Zero quantity / zero unit price**: allowed by the schema (`min(0)`) — e.g. complimentary items.
- **Job site selector disabled until client selected**: prevents selecting a job site that doesn't belong to the chosen client. The filter `s.clientId === selectedClientId` in the Select options is a UX guard; the server doesn't need to enforce this since `jobSiteId` is a valid UUID that belongs to the user.
- **Quote number race condition**: the `MAX(number) + 1` approach can collide under concurrent creates by the same user. For MVP (solo artisan) this is acceptable. If needed later, a Postgres sequence per user can be added.
- **Pre-selected job site from URL**: when navigating from `/dashboard/job-sites/[id]` via "New Quote", the `?jobSiteId=` param pre-fills the job site and resolves the client.
- **Totals are display only**: the server does not store a total — it is always recalculated from line items. The `taxRate` stored on the quote is the rate at time of creation.

---

## Checklist

- [ ] Extend `src/lib/validations/quotes.ts` with `quoteItemSchema` and `createQuoteSchema`
- [ ] Add `create` procedure to `src/server/routers/quotes.ts`
- [ ] Create `src/components/quotes/LineItemsEditor.tsx`
- [ ] Create `src/app/dashboard/quotes/new/page.tsx`
- [ ] Verify: form renders correctly on mobile and desktop
- [ ] Verify: client selector populates job site selector after selection
- [ ] Verify: adding and removing line items works; remove is disabled when only 1 item
- [ ] Verify: totals update live as quantity/price/tax change
- [ ] Verify: submitting with 0 items shows validation error
- [ ] Verify: successful create redirects to `/dashboard/quotes/[id]`
- [ ] Verify: quote number is correctly assigned (Q-001, Q-002, etc.)
- [ ] Verify: `?jobSiteId=` param pre-fills job site and resolves client
