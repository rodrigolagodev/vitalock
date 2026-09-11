## What

<!-- One or two sentences. What changes, for whom. -->

## Why

<!-- The problem or the spec. Link the OpenSpec change if there is one: openspec/changes/<name>/ -->

## How to verify

- [ ] `pnpm lint && pnpm typecheck && pnpm test` green locally
- [ ] `pnpm test:sql` green (if `supabase/**` changed)
- [ ] Manually exercised: <!-- route / flow -->

## Risk

<!-- Migrations? RLS/RPC changes? Breaking UI contract? Rollback plan? Delete this section if none. -->

## Checklist

- [ ] Conventional Commit title (`type(scope): subject`)
- [ ] No new `as unknown as` casts without a justifying comment
- [ ] New SECURITY DEFINER functions follow `supabase/README.md` § Authorization convention
