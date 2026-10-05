# Apply Progress: installer-mobile-hig

Mode: Strict TDD. Delivery: ONE PR, `size:exception` (user decision), commits C1 chore, C2 Slice A, C3 Slice B.

## Status

See `tasks.md` for the checklist (source of truth).

## TDD Cycle Evidence

| Task                  | Test file                                                                                          | Layer                | Safety net                              | RED                                        | GREEN                                           | TRIANGULATE                                                  | REFACTOR |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------- | ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ | -------- |
| 0.1                   | n/a (verification)                                                                                 | n/a                  | 458/458 baseline (admin, ui, installer) | n/a                                        | n/a                                             | n/a                                                          | n/a      |
| 1.1                   | removal of dead code                                                                               | n/a                  | installer 118/118 before and after      | Deletion test: `rg` empty                  | `rg` empty, installer lint/typecheck/test green | n/a                                                          | n/a      |
| 0.2 / 2.1 / 2.2       | `packages/ui/src/__tests__/tailwind-tokens.test.ts`, `packages/ui/src/lib/__tests__/utils.test.ts` | Unit                 | 137/137                                 | Written, 4 failing                         | Passed 137/137                                  | 4 cases (dedupe both sides, different sides/axes kept)       | Clean    |
| 2.3 / 3.2             | `packages/ui/src/components/layout/__tests__/TabBar.test.tsx`                                      | Unit                 | N/A (new)                               | Written, 7 failing                         | Passed                                          | 7 cases (active vs inactive, nested route, label, safe-area) | Clean    |
| 2.4 / 3.3             | `UserMenu.test.tsx`, `PageHeader.test.tsx` (ui)                                                    | Unit                 | existing suites green                   | Written, 2 failing                         | Passed 392/392                                  | toolbar + sidebar default + large-title vs default           | Clean    |
| 2.5 / 3.5 / 3.6 / 3.7 | `apps/installer/src/__tests__/pwa.test.ts`, `src/lib/__tests__/toastOffset.test.ts`                | Unit (fs reads)      | N/A (new)                               | Written, suites failing on missing modules | Passed                                          | manifest base-path variants, icon files exist                | Clean    |
| 2.6 / 3.4 / 3.8       | `App.test.tsx`, installer `UserMenu.test.tsx`, Dashboard/Tareas/Historial tests                    | Integration (router) | 118                                     | Written, 12 failing                        | Passed 135/135                                  | 4 routes offline, online/offline events, nested active tab   | Clean    |
| 3.9                   | `e2e/installer/auth.spec.ts`                                                                       | E2E                  | n/a                                     | Assertion rewritten to tab link            | See 6.3                                         | n/a                                                          | n/a      |
| 3.10                  | spec wording                                                                                       | docs                 | n/a                                     | n/a                                        | n/a                                             | n/a                                                          | n/a      |

## Work Unit Evidence

### C2

| Evidence          | Value                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Focused test      | `pnpm --filter @vitalock/ui test` 392 passed; `pnpm --filter @vitalock/installer test` 135 passed |
| Runtime harness   | `pnpm e2e --project=installer`, see 6.3                                                           |
| Rollback boundary | revert C2 (after C3)                                                                              |

## Deviations

- Task 2.2 says `cn('pb-4','pb-safe-b')` keeps both, but task 0.2 registers the tokens as spacing values, which makes them dedupe. The tests assert dedupe (later wins), consistent with `h-control-md`.
- Spec "TabBar router-agnostic" conflicts with design Decision 1 (`NavLink`) and with existing ui components that already import react-router. Followed the design and reworded the spec.
- Task 0.2 was done in C2 (RED and GREEN) rather than C1 because C1 is the chore deletion only.

### C3

| Evidence          | Value                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test      | `pnpm --filter @vitalock/installer test` 166 passed; `pnpm --filter @vitalock/ui test` 396 passed                                            |
| Runtime harness   | `pnpm e2e --project=installer` 2 passed (auth spec asserting the Tareas tab link) against local Supabase; manual iPhone check (6.4) NOT done |
| Rollback boundary | revert C3                                                                                                                                    |

## Final gate

`pnpm lint`, `pnpm typecheck`, `pnpm test` green (installer 166, ui 396, admin 846, shared 205, supabase 80).

## Notes

- Old test "shows a loading placeholder" on Dashboard (asserted "Cargando tareas…") removed: it contradicts SC-R4-1.
- ConfigureEquipmentInline keeps its filename and export (design did not rename it); it now renders the trigger, summary and Sheet.
- PNG icons generated with `pnpm dlx @vite-pwa/assets-generator --preset minimal-2023 public/icon-512.svg` (worked); `favicon.ico` and `pwa-64x64.png` discarded.
- Tasks 6.4 (manual device check) and 6.5 (PR label) remain for the human/orchestrator.
- The local e2e build ran the Sentry plugin because `SENTRY_AUTH_TOKEN` is set in the shell environment (source maps were uploaded); unset it for future e2e runs.
