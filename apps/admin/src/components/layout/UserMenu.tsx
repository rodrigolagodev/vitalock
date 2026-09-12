import { UserMenu as UserMenuBase } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import { ThemeToggle } from './ThemeToggle';

/**
 * Admin user menu: the shared `UserMenu` wired to the auth session, with
 * the app-owned theme toggle (next-themes lives in the app, not in ui).
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { staff, session, signOut } = useAuthContext();

  return (
    <UserMenuBase
      name={staff?.full_name ?? 'Usuario'}
      email={session?.user?.email ?? ''}
      onSignOut={signOut}
      collapsed={collapsed}
    >
      <ThemeToggle />
    </UserMenuBase>
  );
}
