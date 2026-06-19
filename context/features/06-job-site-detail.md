# Slice 6 — Job Site Detail

## Goal

Build the job site detail page at `/dashboard/job-sites/[id]`. Show job site info with an edit button, a linked client reference, and a linked quotes section (empty state until slice 7). The edit button reuses `JobSiteSheet` from slice 5.

## Prerequisites

- Slice 5 (Job Sites CRUD) complete — `JobSiteSheet`, `jobSitesRouter` (with `getById`), `DeleteJobSiteDialog`, `JobSiteStatusBadge` must exist

---

## Files to create / modify

### 1. `src/app/dashboard/job-sites/[id]/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { JobSiteSheet } from '@/components/job-sites/JobSiteSheet';
import { DeleteJobSiteDialog } from '@/components/job-sites/DeleteJobSiteDialog';
import { JobSiteStatusBadge } from '@/components/job-sites/JobSiteStatusBadge';

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function JobSiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: site, isLoading } = trpc.jobSites.getById.useQuery({ id });
  const { data: clientData } = trpc.clients.getById.useQuery(
    { id: site?.clientId ?? '' },
    { enabled: !!site?.clientId },
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (!site) {
    return (
      <div className="text-sm text-muted-foreground">Job site not found.</div>
    );
  }

  return (
    <div>
      {/* Back navigation */}
      <div className="mb-6">
        <Link
          href="/dashboard/job-sites"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Job Sites
        </Link>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {site.title}
          </h1>
          <JobSiteStatusBadge status={site.status} />
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

      {/* Details */}
      <div className="rounded-lg border p-4 md:p-5 mb-6">
        <h2 className="text-sm font-medium mb-4">Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Client</dt>
            <dd className="text-sm">
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
          {site.address && (
            <div>
              <dt className="text-xs text-muted-foreground mb-0.5">Address</dt>
              <dd className="text-sm">{site.address}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">Start date</dt>
            <dd className="text-sm">{formatDate(site.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-0.5">End date</dt>
            <dd className="text-sm">{formatDate(site.endDate)}</dd>
          </div>
        </dl>
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

      <JobSiteSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        jobSite={site}
      />
      <DeleteJobSiteDialog
        jobSiteId={site.id}
        jobSiteTitle={site.title}
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) router.push('/dashboard/job-sites');
        }}
      />
    </div>
  );
}
```

---

## After slice 7: wire up quotes section

Once `quotesRouter.listByJobSite` exists, replace the quotes placeholder:

```tsx
// Add query:
const { data: quotesData } = trpc.quotes.listByJobSite.useQuery({
  jobSiteId: id,
});

// Replace the quotes section body:
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

## Checklist

- [ ] Create `src/app/dashboard/job-sites/[id]/page.tsx`
- [ ] Verify: page loads with correct job site data
- [ ] Verify: status badge renders with correct colour
- [ ] Verify: client name links to `/dashboard/clients/[id]`
- [ ] Verify: edit button opens Sheet pre-filled
- [ ] Verify: after edit, page reflects updated data
- [ ] Verify: delete redirects to `/dashboard/job-sites`
- [ ] Verify: visiting a non-existent ID shows "Job site not found"
