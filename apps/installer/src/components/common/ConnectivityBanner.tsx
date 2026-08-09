import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * ConnectivityBanner — renders a non-blocking banner when the device is offline.
 * Satisfies installer-home R7, SC-R7-1.
 */
export function ConnectivityBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-800 border border-yellow-200"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>Sin conexión. Los datos pueden estar desactualizados.</span>
    </div>
  );
}
