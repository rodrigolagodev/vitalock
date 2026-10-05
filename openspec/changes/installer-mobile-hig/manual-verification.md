# Manual Verification — installer-mobile-hig

Date: 2026-10-05. Installer dev server from this worktree on the local Supabase stack, seeded installer user, Chrome DevTools emulation at 393×852 @3x (mobile, touch), light theme.

| Check       | Result                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Shell       | Pass. A top bar with the brand and the avatar `UserMenu` trigger replaces the hamburger floating button.                             |
| TabBar      | Pass. Inicio, Tareas and Historial sit at the bottom with icon and label. The active tab is tinted primary; inactive tabs are muted. |
| Large title | Pass. "Hola, Installer" renders on `text-large-title` above the subtitle.                                                            |
| Login       | Pass. The form renders and sign-in redirects to Inicio.                                                                              |

Not covered:

- **Safe-area insets, notch and home indicator.** These need a real iOS device in standalone PWA mode, because DevTools emulation reports zero insets.
- **TaskDetail sticky bar, bottom sheets and offline gating.** The local seed has no assigned tickets. Integration tests cover them (`TaskDetailPage.test.tsx`, `StickyActionBar.test.tsx`, `useOfflineGate.test.ts`).

Task 6.4 stays open for a one-time device pass before merge.
