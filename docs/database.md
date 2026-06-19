# Database

## Stack

- **Database:** Supabase (PostgreSQL 17)
- **ORM:** Drizzle ORM
- **Migrations:** Custom script via Supabase Management API

## Schema

Schema is defined in `src/lib/db/schema.ts`. The Drizzle client is exported from `src/lib/db/index.ts`.

## Commands

### Generate a migration

Run after making changes to `src/lib/db/schema.ts`:

```bash
npm run db:generate
```

Creates a new SQL file in `drizzle/` and updates `drizzle/meta/_journal.json`.

### Apply migrations

```bash
npm run db:migrate
```

Applies any pending migrations to the Supabase database via the Management API. Requires `SUPABASE_ACCESS_TOKEN` in `.env.local`.

## Environment variables

| Variable                 | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `DATABASE_URL`           | Supabase transaction pooler URL (port 6543) — runtime   |
| `DIRECT_URL`             | Supabase direct or session pooler URL — reserved for future use |
| `SUPABASE_ACCESS_TOKEN`  | Personal access token for the Supabase Management API — required for `db:migrate` |

Get your personal access token at: **Supabase dashboard → Account → Access tokens**

## Adding a migration

1. Edit `src/lib/db/schema.ts`
2. Run `npm run db:generate` — review the generated SQL in `drizzle/`
3. Run `npm run db:migrate` to apply it

## Notes

- Direct database connections (`db.rllkfmcfdewpephpazqe.supabase.co`) are IPv6-only in the `us-west-2` region and not reachable from standard dev machines. Migrations use the Supabase Management API instead (`scripts/migrate.mjs`).
- `SUPABASE_ACCESS_TOKEN` is a personal token — never commit it. It lives in `.env.local` only.
- Row-level security is enabled on all tables. Drizzle connects as the `postgres` role (bypasses RLS), so always filter by `userId` explicitly in queries rather than relying on RLS alone.
