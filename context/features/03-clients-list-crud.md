# Slice 3 — Clients: List + CRUD

## Goal

Wire up the clients list page with real data. Implement create, edit, and delete in a Sheet / AlertDialog. All data flows through tRPC.

## Prerequisites

- Slice 1 (Auth) complete
- Slice 2 (tRPC + constants) complete — `protectedProcedure`, `appRouter`, `PAGE_SIZE` must exist
- `clients` table exists in Drizzle schema (`src/lib/db/schema.ts`)

---

## Packages to install

```bash
npm install react-hook-form @hookform/resolvers
```

`zod` is already installed from slice 2.

---

## Data model reference (`src/lib/db/schema.ts`)

```ts
clients: {
  id: uuid (PK, default random)
  userId: uuid (not null)
  name: text (not null)
  company: text (optional)
  phone: text (not null)
  email: text (not null)
  address: text (optional)
  notes: text (optional)
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

## Files to create / modify

### 1. `src/lib/validations/clients.ts` — Zod schema

```ts
import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().optional(),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email'),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export type ClientFormValues = z.infer<typeof clientSchema>;
```

---

### 2. `src/server/routers/clients.ts` — tRPC router

```ts
import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq, and, ilike, desc, count } from 'drizzle-orm';
import { clientSchema } from '@/lib/validations/clients';
import { PAGE_SIZE } from '@/lib/constants';

export const clientsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        search: z.string().default(''),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * PAGE_SIZE;
      const where = and(
        eq(clients.userId, ctx.userId),
        input.search ? ilike(clients.name, `%${input.search}%`) : undefined,
      );
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(clients)
          .where(where)
          .orderBy(desc(clients.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset),
        db.select({ total: count() }).from(clients).where(where),
      ]);
      return { rows, total: Number(total), pageSize: PAGE_SIZE };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [client] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.userId)));
      if (!client) throw new TRPCError({ code: 'NOT_FOUND' });
      return client;
    }),

  create: protectedProcedure
    .input(clientSchema)
    .mutation(async ({ ctx, input }) => {
      const [client] = await db
        .insert(clients)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return client;
    }),

  update: protectedProcedure
    .input(clientSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [client] = await db
        .update(clients)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(clients.id, id), eq(clients.userId, ctx.userId)))
        .returning();
      if (!client) throw new TRPCError({ code: 'NOT_FOUND' });
      return client;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(clients)
        .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.userId)));
    }),
});
```

Add `TRPCError` import: `import { TRPCError } from "@trpc/server";`

Register in `src/server/routers/_app.ts`:

```ts
import { clientsRouter } from './clients';
export const appRouter = router({ clients: clientsRouter });
```

---

### 3. `src/components/clients/ClientSheet.tsx` — create/edit form in a Sheet

```tsx
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { clientSchema, type ClientFormValues } from '@/lib/validations/clients';

type Client = { id: string } & ClientFormValues;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client; // undefined = create mode
}

export function ClientSheet({ open, onOpenChange, client }: Props) {
  const utils = trpc.useUtils();
  const isEdit = !!client;

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      company: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (client) form.reset(client);
    else
      form.reset({
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        notes: '',
      });
  }, [client, open]);

  const create = trpc.clients.create.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success('Client created');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.clients.update.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success('Client updated');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(values: ClientFormValues) {
    if (isEdit) update.mutate({ id: client.id, ...values });
    else create.mutate(values);
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{isEdit ? 'Edit Client' : 'Add Client'}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company">Company</Label>
              <Input id="company" {...form.register('company')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" {...form.register('phone')} />
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...form.register('address')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} {...form.register('notes')} />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t mt-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add client'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

---

### 4. `src/components/clients/DeleteClientDialog.tsx`

```tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';

interface Props {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteClientDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
}: Props) {
  const utils = trpc.useUtils();

  const del = trpc.clients.delete.useMutation({
    onSuccess: () => {
      utils.clients.list.invalidate();
      toast.success('Client deleted');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {clientName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the client and all their job sites and
            quotes. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => del.mutate({ id: clientId })}
            disabled={del.isPending}
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

---

### 5. `src/app/dashboard/clients/page.tsx` — wired list page

Replace the shell created earlier with the fully wired version:

```tsx
'use client';

import { useState } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc/client';
import { ClientSheet } from '@/components/clients/ClientSheet';
import { DeleteClientDialog } from '@/components/clients/DeleteClientDialog';
import Link from 'next/link';
import { useDebounce } from '@/lib/hooks/use-debounce';

type Client = {
  id: string;
  name: string;
  company: string | null;
  phone: string;
  email: string;
};

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Client | undefined>();
  const [deleting, setDeleting] = useState<Client | undefined>();

  const { data, isLoading } = trpc.clients.list.useQuery({
    page,
    search: debouncedSearch,
  });

  function openCreate() {
    setEditing(undefined);
    setSheetOpen(true);
  }
  function openEdit(c: Client) {
    setEditing(c);
    setSheetOpen(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Clients
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your clients and their contact details.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          Add Client
        </Button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="rounded-lg border">
        {/* Desktop table header */}
        <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b bg-muted/40">
          {['Name', 'Company', 'Phone', 'Email'].map((col) => (
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
            <p className="text-sm font-medium">No clients yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first client to get started.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="size-4 mr-2" />
              Add Client
            </Button>
          </div>
        )}

        {/* Desktop rows */}
        {data?.rows.map((client) => (
          <div key={client.id}>
            {/* Desktop */}
            <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b last:border-0 items-center hover:bg-muted/30 text-sm">
              <Link
                href={`/dashboard/clients/${client.id}`}
                className="font-medium hover:underline"
              >
                {client.name}
              </Link>
              <span className="text-muted-foreground">
                {client.company ?? '—'}
              </span>
              <span>{client.phone}</span>
              <span>{client.email}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(client)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleting(client)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile card */}
            <div className="md:hidden flex items-start justify-between p-4 border-b last:border-0">
              <div className="flex flex-col gap-0.5">
                <Link
                  href={`/dashboard/clients/${client.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {client.name}
                </Link>
                {client.company && (
                  <p className="text-xs text-muted-foreground">
                    {client.company}
                  </p>
                )}
                <p className="text-xs">{client.phone}</p>
                <p className="text-xs">{client.email}</p>
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
                  <DropdownMenuItem onClick={() => openEdit(client)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleting(client)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">{data.total} clients</p>
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

      <ClientSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        client={editing}
      />
      {deleting && (
        <DeleteClientDialog
          clientId={deleting.id}
          clientName={deleting.name}
          open={!!deleting}
          onOpenChange={(o) => {
            if (!o) setDeleting(undefined);
          }}
        />
      )}
    </div>
  );
}
```

---

### 6. `src/lib/hooks/use-debounce.ts` — debounce hook for search

```ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

---

## shadcn components to install (if not already present)

```bash
npx shadcn@latest add sheet alert-dialog dropdown-menu input label textarea
npx shadcn@latest add sonner
```

After adding `sonner`, add `<Toaster />` to `src/app/layout.tsx`:

```tsx
import { Toaster } from '@/components/ui/sonner';
// inside body:
<Toaster />;
```

---

## Edge cases

- **Cascade delete**: handled by Supabase RLS + Postgres FK cascade (configured in schema). Confirm `onDelete: "cascade"` is set on `jobSites.clientId` and `quotes.clientId` in the Drizzle schema, or add it.
- **Search resets page**: when `search` changes, `setPage(1)` is called.
- **Empty company**: displayed as "—" in the table.

---

## Checklist

- [ ] Install `react-hook-form @hookform/resolvers`
- [ ] Install shadcn components: `sheet alert-dialog dropdown-menu input label textarea sonner`
- [ ] Add `<Toaster />` to `src/app/layout.tsx`
- [ ] Create `src/lib/validations/clients.ts`
- [ ] Create `src/server/routers/clients.ts`
- [ ] Register `clientsRouter` in `src/server/routers/_app.ts`
- [ ] Create `src/lib/hooks/use-debounce.ts`
- [ ] Create `src/components/clients/ClientSheet.tsx`
- [ ] Create `src/components/clients/DeleteClientDialog.tsx`
- [ ] Replace `src/app/dashboard/clients/page.tsx` with wired version
- [ ] Verify: clients list loads, search works, pagination appears when > 20 results
- [ ] Verify: Add Client sheet opens, submits, list refreshes
- [ ] Verify: Edit client pre-fills form, saves changes
- [ ] Verify: Delete shows confirmation, removes client from list
