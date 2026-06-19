## Communication

- Be concise and direct
- Explain non-obvious decisions briefly
- Ask before large refactors or architectural changes
- Don't add features not in the project spec (`context/project-overview.md`)
- Never delete files without clarification

## Workflow

This is the common workflow for every feature/fix:

1. **Document** - Document the feature in `context/features/current-feature.md`
2. **Branch** - Create a new branch (`feature/[name]` or `fix/[name]`)
3. **Implement** - Implement against the spec in `context/project-overview.md`
4. **Test** - Verify it works in the browser. Write Vitest unit tests for any new server actions or utility functions (`npm run test:run`). Run `npm run build` and fix any errors
5. **Iterate** - Iterate and change things if needed
6. **Commit** - Only after build passes and everything works
7. **Merge** - Merge to main
8. **Delete Branch** - Delete the branch after merge
9. **Review** - Review AI-generated code periodically and on demand
10. Mark as completed in `context/features/current-feature.md` and add to history

Do NOT commit without permission and until the build passes. If build fails, fix the issues first.

## Branching

Create a new branch for every feature/fix. Name branches `feature/[feature]` or `fix/[fix]`. Ask to delete the branch once merged.

## Commits

- Ask before committing (don't auto-commit)
- Use conventional commit messages (`feat:`, `fix:`, `chore:`, etc.)
- Keep commits focused — one feature/fix per commit
- Never put "Generated With Claude" in commit messages

## When Stuck

- If something isn't working after 2–3 attempts, stop and explain the issue
- Don't keep trying random fixes
- Ask for clarification if requirements are unclear

## Code Changes

- Make minimal changes to accomplish the task
- Don't refactor unrelated code unless asked
- Don't add "nice to have" features
- Preserve existing patterns in the codebase
- `src/components/ui/` is ShadCN-only — custom components go in `src/components/`

## Stack Notes

- **Next.js 16** (App Router, Turbopack) — read `node_modules/next/dist/docs/` before writing Next.js code
- **Supabase** — use the server client (`@/lib/supabase/server`) in Server Components and Route Handlers; use the browser client (`@/lib/supabase/client`) only in Client Components
- **Tailwind v4** — no `tailwind.config.ts`; theme is defined in `globals.css` via `@theme inline`
- **Responsive** — mobile-first; see breakpoints and nav rules in `context/project-overview.md`

## Code Review

Review AI-generated code periodically, especially for:

- Security (RLS policies, auth checks, input validation)
- Performance (unnecessary re-renders, N+1 queries)
- Logic errors (edge cases, free-tier limit enforcement)
- Patterns (matches existing codebase?)
