# Slice 2 — tRPC + Constants

## Goal

Set up tRPC v11 with React Query v5 for all client-side data fetching and mutations. Wire the provider into the root layout. Define shared constants used across the app.

## Prerequisites

- Slice 1 (Auth) complete — `auth()` from `src/lib/auth.ts` must exist, session includes `user.id`

---

## Packages to install

```bash
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query zod superjson
```

Versions to target: `@trpc/server@11`, `@tanstack/react-query@5`.

---

## Environment variables

No new env vars required for this slice.

---

## Files to create / modify

### 1. `src/lib/constants.ts`

```ts
export const PAGE_SIZE = 20;
export const FREE_TIER_JOB_SITE_MAX = 5;
export const RECENT_ACTIVITY_LIMIT = 10;
```

---

### 2. `src/server/trpc.ts` — tRPC initialisation

```ts
import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import superjson from 'superjson';

export async function createTRPCContext() {
  const session = await auth();
  return { session };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.session.user.id,
    },
  });
});
```

---

### 3. `src/server/routers/_app.ts` — root router

```ts
import { router } from '@/server/trpc';

export const appRouter = router({
  // Feature routers are merged here as slices are implemented:
  // clients: clientsRouter,
  // jobSites: jobSitesRouter,
  // quotes: quotesRouter,
  // dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
```

---

### 4. `src/app/api/trpc/[trpc]/route.ts` — HTTP handler

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

---

### 5. `src/lib/trpc/client.ts` — React Query client + tRPC client

```ts
'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

---

### 6. `src/lib/trpc/server.ts` — server-side caller (for server components)

```ts
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  const ctx = await createTRPCContext();
  return createCaller(ctx);
}
```

---

### 7. `src/components/providers.tsx` — tRPC + React Query provider

```tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc/client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

---

### 8. `src/app/layout.tsx` — add Providers

Import and wrap children with `<Providers>`. Keep the existing `SessionProvider` from slice 1 — nest `Providers` inside it:

```tsx
import { Providers } from '@/components/providers';

// inside RootLayout body:
<SessionProvider session={session}>
  <Providers>{children}</Providers>
</SessionProvider>;
```

---

## How to use tRPC in client components

```tsx
'use client';
import { trpc } from '@/lib/trpc/client';

// Query
const { data, isLoading } = trpc.clients.list.useQuery({ page: 1, search: '' });

// Mutation
const utils = trpc.useUtils();
const create = trpc.clients.create.useMutation({
  onSuccess: () => utils.clients.list.invalidate(),
});
```

## How to use tRPC in server components

```tsx
import { createServerCaller } from '@/lib/trpc/server';

const caller = await createServerCaller();
const clients = await caller.clients.list({ page: 1, search: '' });
```

---

## Checklist

- [ ] Install packages: `@trpc/server @trpc/client @trpc/react-query @tanstack/react-query zod superjson`
- [ ] Create `src/lib/constants.ts`
- [ ] Create `src/server/trpc.ts`
- [ ] Create `src/server/routers/_app.ts`
- [ ] Create `src/app/api/trpc/[trpc]/route.ts`
- [ ] Create `src/lib/trpc/client.ts`
- [ ] Create `src/lib/trpc/server.ts`
- [ ] Create `src/components/providers.tsx`
- [ ] Update `src/app/layout.tsx` to wrap with `<Providers>`
- [ ] Verify: `/api/trpc` returns a valid response (hit it in the browser — expect a tRPC error, not a 404)

---

## Important: Next.js version caveat

This project uses Next.js 16.x. Before writing any code, read:

```text
node_modules/next/dist/docs/
```
