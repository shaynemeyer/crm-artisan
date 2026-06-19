# Slice 1 — Auth

## Goal

Implement email + password authentication using NextAuth v5 (Auth.js). Protect all `/dashboard/**` routes. Provide a login page that matches the app's UI.

---

## Prerequisites

- Supabase project is running (connection string in `.env.local`)
- Drizzle schema includes `profiles` table (already done)

---

## Packages to install

```bash
npm install next-auth@beta
```

No bcrypt needed — credential validation delegates to Supabase Auth (`auth.signInWithPassword`), which handles hashing.

---

## Environment variables (add to `.env.local`)

```env
AUTH_SECRET=<generate with: npx auth secret>
NEXTAUTH_URL=http://localhost:3000
```

`AUTH_SECRET` is required by NextAuth v5. Generate it with `npx auth secret` and copy the output.

---

## Files to create / modify

### 1. `src/lib/auth.ts` — NextAuth configuration

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { createClient } from '@/lib/supabase/server';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const supabase = await createClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email as string,
          password: credentials.password as string,
        });

        if (error || !data.user) return null;

        return {
          id: data.user.id,
          email: data.user.email,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
```

### 2. `src/app/api/auth/[...nextauth]/route.ts` — route handler

```ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

### 3. `src/middleware.ts` — protect dashboard routes

```ts
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isDashboard = req.nextUrl.pathname.startsWith('/dashboard');

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
});

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

### 4. `src/app/(auth)/login/page.tsx` — login page

This route group uses no layout (no sidebar). Create `src/app/(auth)/layout.tsx` as a passthrough:

```ts
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background">{children}</div>;
}
```

Login page:

```tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const result = await signIn('credentials', {
      email: form.get('email'),
      password: form.get('password'),
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid email or password.');
      setPending(false);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          CRM Artisan
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to your account
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
```

### 5. `src/app/layout.tsx` — add SessionProvider

NextAuth v5 requires `SessionProvider` from `next-auth/react` wrapping the tree for client components to access session.

```tsx
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";

// inside RootLayout:
const session = await auth();
return (
  <html ...>
    <body>
      <SessionProvider session={session}>
        {children}
      </SessionProvider>
    </body>
  </html>
);
```

---

## TypeScript: extend Session type

Create `src/types/next-auth.d.ts`:

```ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
    };
  }
}
```

---

## Supabase note

The Supabase client used in `authorize()` calls `auth.signInWithPassword` — this uses Supabase Auth, not the `profiles` table directly. The `profiles.id` is a FK to `auth.users.id`, so `data.user.id` from Supabase Auth matches the profile ID throughout the app.

The `createClient()` used here is the **server** client from `src/lib/supabase/server.ts` (already exists).

---

## Checklist

- [ ] Install `next-auth@beta`
- [ ] Add `AUTH_SECRET` and `NEXTAUTH_URL` to `.env.local`
- [ ] Create `src/lib/auth.ts`
- [ ] Create `src/app/api/auth/[...nextauth]/route.ts`
- [ ] Create `src/middleware.ts`
- [ ] Create `src/app/(auth)/layout.tsx`
- [ ] Create `src/app/(auth)/login/page.tsx`
- [ ] Create `src/types/next-auth.d.ts`
- [ ] Update `src/app/layout.tsx` with `SessionProvider`
- [ ] Verify: visiting `/dashboard` unauthenticated redirects to `/login`
- [ ] Verify: valid credentials redirect to `/dashboard`
- [ ] Verify: invalid credentials show error message

---

## Important: Next.js version caveat

This project uses Next.js 16.x. Before writing any code, read:

```text
node_modules/next/dist/docs/
```

APIs and conventions may differ from training data. Heed any deprecation notices.
