# Slice 10 — PDF Export

## Goal

Build the print-optimised quote view at `/dashboard/quotes/[id]/pdf`. No sidebar shell. Render all quote data in a clean layout suitable for printing. "Download PDF" triggers `window.print()`. No server-side PDF generation for MVP.

## Prerequisites

- Slice 9 (Quote detail) complete — `quotesRouter.getWithItems` must exist

---

## Layout

This page must NOT use the dashboard layout (no sidebar, no bottom nav). It gets its own route segment outside the `(dashboard)` layout, or uses a separate layout file at `src/app/dashboard/quotes/[id]/pdf/layout.tsx` that overrides the dashboard layout.

### Approach: override with a minimal layout

Create `src/app/dashboard/quotes/[id]/pdf/layout.tsx`:

```tsx
export default function PdfLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-black font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

> Note: In Next.js App Router, nested layouts can re-define `<html>` and `<body>` only at the root. If this causes a hydration error, instead give the page a `print:` Tailwind class wrapper and hide the sidebar via CSS: `@media print { aside { display: none; } }` in `globals.css`. Prefer the layout approach but fall back to CSS if needed.

---

## Files to create

### 1. `src/app/dashboard/quotes/[id]/pdf/layout.tsx`

```tsx
export const metadata = { title: 'Quote PDF' };

export default function PdfLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-black">{children}</div>;
}
```

---

### 2. `src/app/dashboard/quotes/[id]/pdf/page.tsx`

This page fetches data server-side using the tRPC server caller so no client-side loading state is needed.

```tsx
import { notFound } from 'next/navigation';
import { createServerCaller } from '@/lib/trpc/server';
import { PdfView } from '@/components/quotes/PdfView';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuotePdfPage({ params }: Props) {
  const { id } = await params;
  const caller = await createServerCaller();

  let quote;
  try {
    quote = await caller.quotes.getWithItems({ id });
  } catch {
    notFound();
  }

  const [client, site] = await Promise.all([
    caller.clients.getById({ id: quote.clientId }).catch(() => null),
    caller.jobSites.getById({ id: quote.jobSiteId }).catch(() => null),
  ]);

  return <PdfView quote={quote} client={client} site={site} />;
}
```

---

### 3. `src/components/quotes/PdfView.tsx`

A pure presentational component. All styling is print-safe — no dark mode classes.

```tsx
'use client';

import { useEffect } from 'react';

type QuoteItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type Quote = {
  number: number;
  currency: string;
  status: string;
  issueDate: string;
  expiryDate: string | null;
  taxRate: string;
  notes: string | null;
  items: QuoteItem[];
};

type Client = {
  name: string;
  company: string | null;
  phone: string;
  email: string;
  address: string | null;
} | null;
type Site = { title: string; address: string | null } | null;

interface Props {
  quote: Quote;
  client: Client;
  site: Site;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'long' });
}

export function PdfView({ quote, client, site }: Props) {
  const subtotal = quote.items.reduce((sum, item) => {
    return sum + Number(item.quantity) * Number(item.unitPrice);
  }, 0);
  const taxRate = Number(quote.taxRate);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;
  const quoteNumber = `Q-${String(quote.number).padStart(3, '0')}`;

  return (
    <div className="max-w-3xl mx-auto p-8">
      {/* Print button — hidden when printing */}
      <div className="print:hidden flex justify-end mb-6 gap-3">
        <a
          href={`/dashboard/quotes/${quote.number}`}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Back to quote
        </a>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Download / Print
        </button>
      </div>

      {/* Quote header */}
      <div className="flex justify-between items-start mb-10">
        <div>
          {/* Logo placeholder */}
          <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center mb-3 text-xs text-gray-400">
            Logo
          </div>
          <p className="text-xs text-gray-500">Your business name</p>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold text-gray-900">QUOTE</h1>
          <p className="text-sm text-gray-600 mt-1">{quoteNumber}</p>
          <p className="text-sm text-gray-600">
            Issued: {formatDate(quote.issueDate)}
          </p>
          {quote.expiryDate && (
            <p className="text-sm text-gray-600">
              Expires: {formatDate(quote.expiryDate)}
            </p>
          )}
        </div>
      </div>

      {/* Client + Site */}
      <div className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Bill to
          </p>
          {client ? (
            <div className="text-sm text-gray-800 space-y-0.5">
              <p className="font-medium">{client.name}</p>
              {client.company && <p>{client.company}</p>}
              {client.address && <p>{client.address}</p>}
              <p>{client.phone}</p>
              <p>{client.email}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Job site
          </p>
          {site ? (
            <div className="text-sm text-gray-800 space-y-0.5">
              <p className="font-medium">{site.title}</p>
              {site.address && <p>{site.address}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-500">—</p>
          )}
        </div>
      </div>

      {/* Line items table */}
      <table className="w-full text-sm mb-8">
        <thead>
          <tr className="border-b-2 border-gray-900">
            <th className="text-left py-2 font-semibold">Description</th>
            <th className="text-right py-2 font-semibold w-16">Qty</th>
            <th className="text-right py-2 font-semibold w-28">Unit price</th>
            <th className="text-right py-2 font-semibold w-28">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, i) => {
            const lineTotal = Number(item.quantity) * Number(item.unitPrice);
            return (
              <tr key={i} className="border-b border-gray-200">
                <td className="py-2">{item.description}</td>
                <td className="py-2 text-right">{item.quantity}</td>
                <td className="py-2 text-right">
                  {quote.currency} {Number(item.unitPrice).toFixed(2)}
                </td>
                <td className="py-2 text-right">
                  {quote.currency} {lineTotal.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-64 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>
              {quote.currency} {subtotal.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax ({taxRate}%)</span>
            <span>
              {quote.currency} {taxAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between font-bold border-t border-gray-900 pt-1 mt-1">
            <span>Total</span>
            <span>
              {quote.currency} {total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {quote.notes && (
        <div className="border-t border-gray-200 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Notes / terms
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {quote.notes}
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Print CSS

Add to `src/app/globals.css`:

```css
@media print {
  /* Hide browser chrome additions */
  @page {
    margin: 1cm;
  }
  /* Hide the print button and any nav when printing from the full layout */
  aside,
  nav,
  .print\:hidden {
    display: none !important;
  }
}
```

---

## Business name / logo

For MVP: the business name and logo are hardcoded as placeholders. In a future slice these should be fetched from `profiles` (the user's `businessName` and an uploaded logo URL).

---

## Checklist

- [ ] Create `src/app/dashboard/quotes/[id]/pdf/layout.tsx`
- [ ] Create `src/app/dashboard/quotes/[id]/pdf/page.tsx`
- [ ] Create `src/components/quotes/PdfView.tsx`
- [ ] Add `@media print` CSS to `src/app/globals.css`
- [ ] Verify: navigating to `/dashboard/quotes/[id]/pdf` renders quote without sidebar
- [ ] Verify: "Download / Print" button triggers browser print dialog
- [ ] Verify: printed output shows quote number, client, site, line items, totals
- [ ] Verify: print button is hidden in the printed output
- [ ] Verify: non-existent quote ID shows 404
