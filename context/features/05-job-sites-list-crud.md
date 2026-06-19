# Slice 5 — Job Sites: List + CRUD

## Goal

Build the job sites list page with filtering (by status and client) and pagination. Implement create, edit, and delete via Sheet / AlertDialog. Enforce the free-tier job site limit. Create a reusable `JobSiteStatusBadge` component. Wire up the job sites section on the client detail page.

## Prerequisites

- Slice 2 (tRPC + constants) complete — `FREE_TIER_JOB_SITE_MAX`, `PAGE_SIZE` must exist
- Slice 3 (Clients CRUD) complete — `clientsRouter.list` needed to populate the client filter dropdown
- Slice 4 (Client Detail) complete — job sites section placeholder is ready to wire up

---

## Data model reference (`src/lib/db/schema.ts`)

```ts
jobSites: {
  id: uuid (PK, default random)
  userId: uuid (not null)
  clientId: uuid (not null, FK → clients.id)
  title: text (not null)
  address: text (optional)
  startDate: date (optional)
  endDate: date (optional)
  status: enum("planned" | "in_progress" | "completed") — default "planned"
  createdAt: timestamp
}

jobSiteStatusEnum: "planned" | "in_progress" | "completed"
```

Ensure cascade delete is set on `clientId` in schema:

```ts
clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
```

If not already set, add it and run `npm run db:generate && npm run db:migrate`.

---

## Files to create / modify

### 1. `src/lib/validations/job-sites.ts`

```ts
import { z } from 'zod';

export const jobSiteSchema = z.object({
  clientId: z.string().uuid('Client is required'),
  title: z.string().min(1, 'Title is required'),
  address: z.string().optional(),
  startDate: z.string().optional(), // ISO date string YYYY-MM-DD
  endDate: z.string().optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).default('planned'),
});

export type JobSiteFormValues = z.infer<typeof jobSiteSchema>;
```

---

### 2. `src/server/routers/job-sites.ts`

```ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '@/server/trpc';
import { db } from '@/lib/db';
import { jobSites, clients } from '@/lib/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { jobSiteSchema } from '@/lib/validations/job-sites';
import { PAGE_SIZE, FREE_TIER_JOB_SITE_MAX } from '@/lib/constants';

export const jobSitesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        clientId: z.string().uuid().optional(),
        status: z.enum(['planned', 'in_progress', 'completed']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * PAGE_SIZE;
      const conditions = [
        eq(jobSites.userId, ctx.userId),
        ...(input.clientId ? [eq(jobSites.clientId, input.clientId)] : []),
        ...(input.status ? [eq(jobSites.status, input.status)] : []),
      ];
      const where = and(...conditions);
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(jobSites)
          .where(where)
          .orderBy(desc(jobSites.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset),
        db.select({ total: count() }).from(jobSites).where(where),
      ]);
      return { rows, total: Number(total), pageSize: PAGE_SIZE };
    }),

  listByClient: protectedProcedure
    .input(z.object({ clientId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select()
        .from(jobSites)
        .where(
          and(
            eq(jobSites.clientId, input.clientId),
            eq(jobSites.userId, ctx.userId),
          ),
        )
        .orderBy(desc(jobSites.createdAt));
      return { rows };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [site] = await db
        .select()
        .from(jobSites)
        .where(and(eq(jobSites.id, input.id), eq(jobSites.userId, ctx.userId)));
      if (!site) throw new TRPCError({ code: 'NOT_FOUND' });
      return site;
    }),

  create: protectedProcedure
    .input(jobSiteSchema)
    .mutation(async ({ ctx, input }) => {
      // Enforce free-tier limit
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, ctx.userId),
        columns: { plan: true },
      });
      if (profile?.plan === 'free') {
        const [{ total }] = await db
          .select({ total: count() })
          .from(jobSites)
          .where(eq(jobSites.userId, ctx.userId));
        if (Number(total) >= FREE_TIER_JOB_SITE_MAX) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Free plan is limited to ${FREE_TIER_JOB_SITE_MAX} job sites. Upgrade to add more.`,
          });
        }
      }
      const [site] = await db
        .insert(jobSites)
        .values({ ...input, userId: ctx.userId })
        .returning();
      return site;
    }),

  update: protectedProcedure
    .input(jobSiteSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [site] = await db
        .update(jobSites)
        .set(data)
        .where(and(eq(jobSites.id, id), eq(jobSites.userId, ctx.userId)))
        .returning();
      if (!site) throw new TRPCError({ code: 'NOT_FOUND' });
      return site;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(jobSites)
        .where(and(eq(jobSites.id, input.id), eq(jobSites.userId, ctx.userId)));
    }),
});
```

Add `profiles` import: `import { jobSites, clients, profiles } from "@/lib/db/schema";`

Register in `src/server/routers/_app.ts`:

```ts
import { jobSitesRouter } from './job-sites';
export const appRouter = router({
  clients: clientsRouter,
  jobSites: jobSitesRouter,
});
```

---

### 3. `src/components/job-sites/JobSiteStatusBadge.tsx`

```tsx
import { cn } from '@/lib/utils';

type Status = 'planned' | 'in_progress' | 'completed';

const config: Record<Status, { label: string; classes: string }> = {
  planned: { label: 'Planned', classes: 'bg-muted text-muted-foreground' },
  in_progress: {
    label: 'In Progress',
    classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  completed: {
    label: 'Completed',
    classes:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
};

export function JobSiteStatusBadge({ status }: { status: Status }) {
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

### 4. `src/components/job-sites/UpgradePrompt.tsx` — free-tier gate UI

Shown when a free-tier user tries to create a job site beyond the limit.

```tsx
import { Button } from '@/components/ui/button';
import { FREE_TIER_JOB_SITE_MAX } from '@/lib/constants';
import Link from 'next/link';

export function UpgradePrompt() {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <p className="text-sm font-medium">Job site limit reached</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Free plan allows up to {FREE_TIER_JOB_SITE_MAX} job sites.
      </p>
      <Button className="mt-4" asChild>
        <Link href="/payment">Upgrade to Premium</Link>
      </Button>
    </div>
  );
}
```

---

### 5. `src/components/job-sites/JobSiteSheet.tsx`

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
  jobSiteSchema,
  type JobSiteFormValues,
} from '@/lib/validations/job-sites';

type JobSite = { id: string } & JobSiteFormValues;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobSite?: JobSite;
  defaultClientId?: string; // pre-select client when opened from Client Detail
}

export function JobSiteSheet({
  open,
  onOpenChange,
  jobSite,
  defaultClientId,
}: Props) {
  const utils = trpc.useUtils();
  const isEdit = !!jobSite;

  const { data: clientsData } = trpc.clients.list.useQuery({
    page: 1,
    search: '',
  });

  const form = useForm<JobSiteFormValues>({
    resolver: zodResolver(jobSiteSchema),
    defaultValues: {
      clientId: defaultClientId ?? '',
      title: '',
      address: '',
      startDate: '',
      endDate: '',
      status: 'planned',
    },
  });

  useEffect(() => {
    if (jobSite) form.reset(jobSite);
    else
      form.reset({
        clientId: defaultClientId ?? '',
        title: '',
        address: '',
        startDate: '',
        endDate: '',
        status: 'planned',
      });
  }, [jobSite, open, defaultClientId]);

  const create = trpc.jobSites.create.useMutation({
    onSuccess: () => {
      utils.jobSites.list.invalidate();
      utils.jobSites.listByClient.invalidate();
      toast.success('Job site created');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.jobSites.update.useMutation({
    onSuccess: () => {
      utils.jobSites.list.invalidate();
      utils.jobSites.listByClient.invalidate();
      toast.success('Job site updated');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function onSubmit(values: JobSiteFormValues) {
    if (isEdit) update.mutate({ id: jobSite.id, ...values });
    else create.mutate(values);
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>{isEdit ? 'Edit Job Site' : 'Add Job Site'}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col flex-1 overflow-y-auto"
        >
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1.5">
              <Label>Client *</Label>
              <Select
                value={form.watch('clientId')}
                onValueChange={(v) => form.setValue('clientId', v)}
                disabled={isEdit}
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
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                {...form.register('title')}
                placeholder="e.g. Kitchen remodel"
              />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...form.register('address')} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...form.register('startDate')}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" type="date" {...form.register('endDate')} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) =>
                  form.setValue('status', v as JobSiteFormValues['status'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
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
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add job site'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

---

### 6. `src/components/job-sites/DeleteJobSiteDialog.tsx`

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
  jobSiteId: string;
  jobSiteTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteJobSiteDialog({
  jobSiteId,
  jobSiteTitle,
  open,
  onOpenChange,
}: Props) {
  const utils = trpc.useUtils();

  const del = trpc.jobSites.delete.useMutation({
    onSuccess: () => {
      utils.jobSites.list.invalidate();
      utils.jobSites.listByClient.invalidate();
      toast.success('Job site deleted');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{jobSiteTitle}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the job site and all its quotes. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => del.mutate({ id: jobSiteId })}
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

### 7. `src/app/dashboard/job-sites/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
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
import { trpc } from '@/lib/trpc/client';
import { JobSiteStatusBadge } from '@/components/job-sites/JobSiteStatusBadge';
import { JobSiteSheet } from '@/components/job-sites/JobSiteSheet';
import { DeleteJobSiteDialog } from '@/components/job-sites/DeleteJobSiteDialog';
import { UpgradePrompt } from '@/components/job-sites/UpgradePrompt';
import { FREE_TIER_JOB_SITE_MAX } from '@/lib/constants';

type Status = 'planned' | 'in_progress' | 'completed';
type JobSite = { id: string; title: string; status: Status; clientId: string };

export default function JobSitesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<JobSite | undefined>();
  const [deleting, setDeleting] = useState<JobSite | undefined>();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data, isLoading } = trpc.jobSites.list.useQuery({
    page,
    status: statusFilter === 'all' ? undefined : statusFilter,
    clientId: clientFilter === 'all' ? undefined : clientFilter,
  });
  const { data: clientsData } = trpc.clients.list.useQuery({
    page: 1,
    search: '',
  });

  function openCreate() {
    // Check free-tier limit client-side for a fast UX hint;
    // server enforces the real limit on mutation.
    setEditing(undefined);
    setSheetOpen(true);
  }

  function handleSheetError(message: string) {
    if (message.includes('Free plan')) setShowUpgrade(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Job Sites
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track active and upcoming work locations.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4 mr-2" />
          Add Job Site
        </Button>
      </div>

      {showUpgrade && (
        <div className="mb-6">
          <UpgradePrompt />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as Status | 'all');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
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
        <div className="hidden md:grid md:grid-cols-[1fr_1fr_auto_auto] gap-4 px-4 py-3 border-b bg-muted/40">
          {['Title', 'Client', 'Status'].map((col) => (
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
            <p className="text-sm font-medium">No job sites found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter !== 'all' || clientFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Add your first job site to get started.'}
            </p>
            {statusFilter === 'all' && clientFilter === 'all' && (
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="size-4 mr-2" />
                Add Job Site
              </Button>
            )}
          </div>
        )}

        {data?.rows.map((site) => (
          <div key={site.id}>
            {/* Desktop row */}
            <div className="hidden md:grid md:grid-cols-[1fr_1fr_auto_auto] gap-4 px-4 py-3 border-b last:border-0 items-center hover:bg-muted/30 text-sm">
              <Link
                href={`/dashboard/job-sites/${site.id}`}
                className="font-medium hover:underline"
              >
                {site.title}
              </Link>
              <span className="text-muted-foreground">
                {clientsData?.rows.find((c) => c.id === site.clientId)?.name ??
                  '—'}
              </span>
              <JobSiteStatusBadge status={site.status} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(site);
                      setSheetOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleting(site)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile card */}
            <div className="md:hidden flex items-start justify-between p-4 border-b last:border-0">
              <div className="flex flex-col gap-1">
                <Link
                  href={`/dashboard/job-sites/${site.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {site.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {clientsData?.rows.find((c) => c.id === site.clientId)
                    ?.name ?? '—'}
                </p>
                <JobSiteStatusBadge status={site.status} />
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
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(site);
                      setSheetOpen(true);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleting(site)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-muted-foreground">{data.total} job sites</p>
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

      <JobSiteSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        jobSite={editing}
      />
      {deleting && (
        <DeleteJobSiteDialog
          jobSiteId={deleting.id}
          jobSiteTitle={deleting.title}
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

### 8. Wire up job sites section on `src/app/dashboard/clients/[id]/page.tsx`

Add to the client detail page (slice 4):

```tsx
// Add query:
const { data: jobSitesData } = trpc.jobSites.listByClient.useQuery({
  clientId: id,
});

// Replace the job sites placeholder section body with:
<div className="flex items-center justify-between px-4 py-3 border-b">
  <h2 className="text-sm font-medium">Job sites</h2>
  <Button size="sm" onClick={() => setJobSiteSheetOpen(true)}>
    <Plus className="size-4 mr-2" />
    Add
  </Button>
</div>;
{
  jobSitesData?.rows.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">No job sites yet.</p>
    </div>
  ) : (
    jobSitesData?.rows.map((site) => (
      <Link
        key={site.id}
        href={`/dashboard/job-sites/${site.id}`}
        className="flex items-center justify-between px-4 py-3 border-b last:border-0 hover:bg-muted/30 text-sm"
      >
        <span className="font-medium">{site.title}</span>
        <JobSiteStatusBadge status={site.status} />
      </Link>
    ))
  );
}

// Also add the JobSiteSheet state and component at the bottom:
const [jobSiteSheetOpen, setJobSiteSheetOpen] = useState(false);
<JobSiteSheet
  open={jobSiteSheetOpen}
  onOpenChange={setJobSiteSheetOpen}
  defaultClientId={id}
/>;
```

---

## shadcn components to install (if not already present)

```bash
npx shadcn@latest add select
```

---

## Edge cases

- **Free-tier limit**: server throws `FORBIDDEN` with a human-readable message when limit is reached. The mutation `onError` in `JobSiteSheet` should call `toast.error(e.message)` — the message is safe to display.
- **End date optional**: `endDate` field can be blank — valid for ongoing work.
- **All statuses count toward limit**: the limit check counts all job sites for the user regardless of status.
- **Client dropdown in Sheet**: limited to the first page (20) of clients. If a user has many clients, this may need a search input in the future — acceptable limitation for MVP.

---

## Checklist

- [ ] Confirm `clientId` FK has `onDelete: "cascade"` in `src/lib/db/schema.ts`; if not, add + migrate
- [ ] Create `src/lib/validations/job-sites.ts`
- [ ] Create `src/server/routers/job-sites.ts`
- [ ] Register `jobSitesRouter` in `src/server/routers/_app.ts`
- [ ] Create `src/components/job-sites/JobSiteStatusBadge.tsx`
- [ ] Create `src/components/job-sites/UpgradePrompt.tsx`
- [ ] Create `src/components/job-sites/JobSiteSheet.tsx`
- [ ] Create `src/components/job-sites/DeleteJobSiteDialog.tsx`
- [ ] Install shadcn `select` if not already present
- [ ] Create `src/app/dashboard/job-sites/page.tsx`
- [ ] Wire up job sites section in `src/app/dashboard/clients/[id]/page.tsx`
- [ ] Verify: job sites list loads, status and client filters work
- [ ] Verify: Add Job Site creates and appears in list
- [ ] Verify: free-tier limit blocks creation at 5 and shows upgrade prompt
- [ ] Verify: Edit pre-fills form, client selector is disabled in edit mode
- [ ] Verify: Delete removes job site and all its quotes (cascade)
- [ ] Verify: job sites section on Client Detail page shows linked sites
