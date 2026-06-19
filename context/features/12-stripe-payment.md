# Slice 12 — Stripe / Payment

## Goal

Implement the premium plan upgrade flow. A free-tier user clicks "Upgrade" and is sent to a Stripe Checkout session for a $19/month subscription. On successful payment, a Stripe webhook updates `profiles.plan = "premium"` in the database.

## Prerequisites

- All prior slices complete
- Supabase `profiles` table exists with `plan` column (`planEnum`: `"free" | "premium"`)
- Slice 5's `UpgradePrompt` component already links to `/payment`

---

## Packages to install

```bash
npm install stripe @stripe/stripe-js
```

---

## Environment variables (add to `.env.local`)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Setup steps:

1. Create a Stripe account and a product "CRM Artisan Premium" priced at $19/month (recurring)
2. Copy the Price ID (`price_...`) to `STRIPE_PRICE_ID`
3. For local webhook testing: install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   This outputs a webhook signing secret — copy it to `STRIPE_WEBHOOK_SECRET`
4. In production, register the webhook endpoint in the Stripe dashboard pointing to `https://your-domain/api/stripe/webhook` with event `checkout.session.completed`

---

## Files to create

### 1. `src/lib/stripe.ts` — Stripe server client

```ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});
```

Use the latest API version — check `node_modules/stripe/package.json` for the bundled version.

---

### 2. `src/server/routers/billing.ts` — tRPC router

```ts
import { router, protectedProcedure } from '@/server/trpc';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { profiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const billingRouter = router({
  createCheckoutSession: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, ctx.userId),
      columns: { plan: true },
    });

    if (profile?.plan === 'premium') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Already on premium plan.',
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      metadata: {
        userId: ctx.userId,
      },
      success_url: `${process.env.NEXTAUTH_URL}/dashboard?upgraded=1`,
      cancel_url: `${process.env.NEXTAUTH_URL}/payment`,
    });

    return { url: session.url };
  }),
});
```

Add `TRPCError` import: `import { TRPCError } from "@trpc/server";`

Register in `src/server/routers/_app.ts`:

```ts
import { billingRouter } from './billing';
export const appRouter = router({
  clients: clientsRouter,
  jobSites: jobSitesRouter,
  quotes: quotesRouter,
  dashboard: dashboardRouter,
  billing: billingRouter,
});
```

---

### 3. `src/app/api/stripe/webhook/route.ts` — webhook handler

```ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { profiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (userId) {
      await db
        .update(profiles)
        .set({ plan: 'premium' })
        .where(eq(profiles.id, userId));
    }
  }

  return NextResponse.json({ received: true });
}

// Stripe sends raw body — disable Next.js body parsing
export const config = {
  api: { bodyParser: false },
};
```

> Note for Next.js App Router: body parsing is disabled by default for route handlers that read the raw body via `req.text()`. The `config` export is only needed for Pages Router. Verify this with the Next.js 16.x docs.

---

### 4. `src/app/payment/page.tsx` — upgrade page

This page is outside `/dashboard` so it does NOT use the dashboard layout. It should be accessible to authenticated users only (middleware already covers `/dashboard/**`; add `/payment` to the matcher if needed).

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';

const FEATURES = [
  'Unlimited job sites',
  'Unlimited quotes',
  'PDF export',
  'Priority support',
];

export default function PaymentPage() {
  const router = useRouter();

  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border p-6">
          <h1 className="text-xl font-semibold tracking-tight">
            Upgrade to Premium
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove the job site limit and unlock all features.
          </p>

          <div className="mt-6">
            <p className="text-3xl font-bold">$19</p>
            <p className="text-sm text-muted-foreground">per month</p>
          </div>

          <ul className="mt-6 flex flex-col gap-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-primary shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <Button
            className="w-full mt-6"
            onClick={() => checkout.mutate()}
            disabled={checkout.isPending}
          >
            {checkout.isPending ? 'Redirecting…' : 'Upgrade now'}
          </Button>

          <Button
            variant="ghost"
            className="w-full mt-2"
            onClick={() => router.back()}
          >
            Maybe later
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

### 5. Add `/payment` to middleware matcher

Update `src/middleware.ts` to also protect the payment page:

```ts
export const config = {
  matcher: ['/dashboard/:path*', '/payment'],
};
```

---

### 6. Show "Plan upgraded" toast on dashboard

After successful checkout, Stripe redirects to `/dashboard?upgraded=1`. Add to the dashboard page:

```tsx
// In DashboardPage, read the search param:
'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const searchParams = useSearchParams();
useEffect(() => {
  if (searchParams.get('upgraded') === '1') {
    toast.success('You are now on the Premium plan.');
    // Remove the param from URL without a full reload
    window.history.replaceState({}, '', '/dashboard');
  }
}, []);
```

---

## Free-tier gate recap (already in slice 5)

- `UpgradePrompt` component in `src/components/job-sites/UpgradePrompt.tsx` links to `/payment`
- Server enforces the limit in `jobSitesRouter.create` with a `FORBIDDEN` error

---

## Checklist

- [ ] Install `stripe @stripe/stripe-js`
- [ ] Create Stripe product + price; copy `STRIPE_PRICE_ID` to `.env.local`
- [ ] Add all Stripe env vars to `.env.local`
- [ ] Create `src/lib/stripe.ts`
- [ ] Create `src/server/routers/billing.ts`
- [ ] Register `billingRouter` in `src/server/routers/_app.ts`
- [ ] Create `src/app/api/stripe/webhook/route.ts`
- [ ] Create `src/app/payment/page.tsx`
- [ ] Add `/payment` to middleware matcher
- [ ] Add "upgraded" toast to dashboard page
- [ ] Test locally with Stripe CLI (`stripe listen`)
- [ ] Verify: clicking "Upgrade now" redirects to Stripe Checkout
- [ ] Verify: completing checkout redirects to `/dashboard?upgraded=1` and shows toast
- [ ] Verify: after payment, `profiles.plan` is `"premium"` in the database
- [ ] Verify: premium user can create more than 5 job sites
- [ ] Verify: webhook rejects requests with invalid signatures
