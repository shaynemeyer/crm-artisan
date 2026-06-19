# Slice 4 — Client Detail

## Goal

Build the client detail page at `/dashboard/clients/[id]`. Show the client's info with an edit button, a linked job sites section, and a linked quotes section. The edit button reuses `ClientSheet` from slice 3.

## Prerequisites

- Slice 3 (Clients CRUD) complete — `ClientSheet`, `clientsRouter` (with `getById`), and `DeleteClientDialog` must exist

---

## Files to create / modify

### 1. `src/server/routers/clients.ts` — add `getById` (if not already added in slice 3)

```ts
getById: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, input.id), eq(clients.userId, ctx.userId)));
    if (!client) throw new TRPCError({ code: "NOT_FOUND" });
    return client;
  }),
```

Also add a `listByClient` query to `jobSitesRouter` and `quotesRouter` once those slices are done. For now, the detail page renders empty sections for job sites and quotes with a "coming soon" note — these will be wired up in slices 5 and 7.

---

### 2. `src/app/dashboard/clients/[id]/page.tsx`

This is a client component because it needs the edit Sheet state. It fetches the client via tRPC.

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { ClientSheet } from '@/components/clients/ClientSheet';
import { DeleteClientDialog } from '@/components/clients/DeleteClientDialog';
import Link from 'next/link';

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: client, isLoading } = trpc.clients.getById.useQuery({ id });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!client) {
    return (
      <div className="text-sm text-muted-foreground">Client not found.</div>
    );
  }

  return (
    <div>
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/dashboard/clients"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clients
        </Link>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {client.name}
          </h1>
          {client.company && (
            <p className="mt-1 text-sm text-muted-foreground">
              {client.company}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            <Pencil className="size-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Contact info */}
      <div className="rounded-lg border p-4 md:p-5 mb-6">
        <h2 className="text-sm font-medium mb-4">Contact details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Phone</dt>
            <dd className="text-sm">{client.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Email</dt>
            <dd className="text-sm">{client.email}</dd>
          </div>
          {client.address && (
            <div className="md:col-span-2">
              <dt className="text-xs text-muted-foreground mb-0.5">Address</dt>
              <dd className="text-sm">{client.address}</dd>
            </div>
          )}
          {client.notes && (
            <div className="md:col-span-2">
              <dt className="text-xs text-muted-foreground mb-0.5">Notes</dt>
              <dd className="text-sm whitespace-pre-wrap">{client.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Job sites section — wired up in slice 5 */}
      <div className="rounded-lg border mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-medium">Job sites</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Job sites will appear here.
          </p>
        </div>
      </div>

      {/* Quotes section — wired up in slice 7 */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-medium">Quotes</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Quotes will appear here.
          </p>
        </div>
      </div>

      <ClientSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        client={client}
      />

      <DeleteClientDialog
        clientId={client.id}
        clientName={client.name}
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) router.push('/dashboard/clients');
        }}
      />
    </div>
  );
}
```

---

## Notes

### After slice 5: wire up job sites section

Once `jobSitesRouter.listByClient` exists, replace the job sites placeholder with:

```tsx
// Add to the top of the component:
const { data: jobSites } = trpc.jobSites.listByClient.useQuery({
  clientId: id,
});

// Replace the job sites section body:
{
  jobSites?.rows.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-sm text-muted-foreground">No job sites yet.</p>
    </div>
  ) : (
    jobSites?.rows.map((site) => (
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
```

### After slice 7: wire up quotes section

Once `quotesRouter.listByClient` exists, replace the quotes placeholder similarly.

---

## Checklist

- [ ] Confirm `getById` exists in `src/server/routers/clients.ts`
- [ ] Create `src/app/dashboard/clients/[id]/page.tsx`
- [ ] Verify: navigating to `/dashboard/clients/[id]` shows correct client data
- [ ] Verify: edit button opens Sheet pre-filled with client data
- [ ] Verify: after editing, name/company in the header updates
- [ ] Verify: delete button opens confirmation dialog, on confirm redirects to `/dashboard/clients`
- [ ] Verify: visiting a non-existent ID shows "Client not found"
