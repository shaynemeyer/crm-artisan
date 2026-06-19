# Coding Standards

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## Next.js

- Server components by default
- Only use `'use client'` when needed (interactivity, hooks, browser APIs)
- **Do not use Server Actions** — use tRPC for all mutations and data fetching from client components
- Use API routes only when you need:
  - Webhooks (Stripe, GitHub, etc.)
  - File uploads with progress tracking
  - Long-running operations
  - Specific HTTP status codes or headers
  - Third-party integrations that require a raw endpoint
- Otherwise, fetch data directly in server components or via tRPC

## tRPC

- All client-side data fetching and mutations go through tRPC procedures
- Define routers in `src/server/routers/[feature].ts`
- Compose routers in `src/server/routers/_app.ts`
- Validate all procedure inputs with Zod schemas (see Validation section)
- Use `publicProcedure` for unauthenticated endpoints, `protectedProcedure` for authenticated ones
- Return plain objects — avoid returning class instances or complex types that don't serialize cleanly

## Tailwind CSS v4

**CRITICAL**: We are using Tailwind CSS v4, which uses CSS-based configuration.

- **DO NOT** create `tailwind.config.ts` or `tailwind.config.js` files (those are for v3)
- All theme configuration must be done in CSS using the `@theme` directive in `src/app/globals.css`
- Use CSS custom properties for colors, spacing, etc.
- No JavaScript-based config allowed

Example v4 configuration:

```css
@import 'tailwindcss';

@theme {
  --color-primary: oklch(50% 0.2 250);
}
```

## File Organization

- Components: `src/components/[feature]/ComponentName.tsx`
- Pages: `src/app/[route]/page.tsx`
- tRPC routers: `src/server/routers/[feature].ts`
- Zod schemas: `src/lib/validations/[feature].ts`
- Types: `src/types/[feature].ts`
- Lib/Utils: `src/lib/[utility].ts`

**`src/components/ui/` is reserved exclusively for ShadCN-generated components. Never place custom components there.** Use a feature folder instead (e.g. `components/contacts/`, `components/auth/`, `components/dashboard/`). Create a new named folder if none fits.

## Naming

- Components: PascalCase (`ContactCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS for all styling
- Use shadcn/ui components where applicable
- No inline styles
- Dark mode first, light mode as option

## Database

- Use Drizzle ORM for all database operations
- Define schema in `src/lib/db/schema.ts`
- Use `drizzle-kit generate` to create migration files, then `drizzle-kit migrate` to apply
- Never modify migration files after they have been applied
- Use the shared `db` client from `src/lib/db/index.ts` — do not instantiate new clients

## Validation

- **All tRPC procedures and API routes that accept user input must validate with Zod** before any business logic or database access
- Define schemas in `src/lib/validations/[feature].ts` — one file per feature area (e.g. `auth.ts`, `contacts.ts`)
- tRPC procedure inputs use Zod schemas directly via `.input(schema)`
- For forms, use `react-hook-form` with `@hookform/resolvers/zod` — pass the same Zod schema to both the form resolver and the tRPC input so client and server share one source of truth
- Use `.safeParse()` in API routes so validation errors can be returned as responses without throwing
- Query parameters and URL params must also be validated with Zod before use

## Error Handling

- tRPC procedures throw `TRPCError` with an appropriate code (`BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, etc.)
- Client components handle tRPC errors via the `onError` callback or `error` property from `useQuery`/`useMutation`
- Display user-friendly error messages via toast

## UI & Layout

- Sidebar navigation on the left (Dashboard, Clients, Job Sites, Quotes); main content area on the right
- Primary action buttons: blue (`bg-primary`), placed top-right of the content area
- Destructive actions (delete): red (`bg-destructive`), always require a confirmation `Dialog` before executing
- Lists use tables on desktop, cards on mobile — use a single component that switches layout via responsive classes
- All forms open in a shadcn/ui `Sheet` (slide-over panel) — no inline or full-page forms
- Toast messages (shadcn/ui `Sonner`) for all success and error feedback after actions
- Use shadcn/ui components throughout — do not mix with other component libraries
- Consistent spacing: follow the Tailwind spacing scale; do not use arbitrary values unless necessary
- Consistent typography: use the defined type scale from `globals.css`; do not set one-off font sizes inline

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
