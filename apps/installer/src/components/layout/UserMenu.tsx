import { UserMenu as UserMenuBase } from '@vitalock/ui';
import { useAuthContext } from '@vitalock/shared';
import { ThemeToggle } from './ThemeToggle';

/**
 * Installer user menu: the shared `UserMenu` wired to the auth session, with
 * the app-owned theme toggle (next-themes lives in the app, not in ui).
 */
export function UserMenu({ variant = 'sidebar' }: { variant?: 'sidebar' | 'toolbar' }) {
  const { staff, signOut } = useAuthContext();

  return (
    <UserMenuBase
      name={staff?.full_name ?? 'Usuario'}
      subtitle={staff?.username ? `@${staff.username}` : ''}
      onSignOut={signOut}
      variant={variant}
    >
      <ThemeToggle />
    </UserMenuBase>
  );
}
