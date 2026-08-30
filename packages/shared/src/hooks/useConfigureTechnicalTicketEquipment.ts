import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  configureTechnicalTicketEquipment,
  type ConfigureTechnicalTicketEquipmentInput,
} from '@vitalock/supabase';
import type { TypedSupabaseClient } from '@vitalock/supabase';

export interface CreateUseConfigureTechnicalTicketEquipmentOptions {
  /** Supabase client instance — injected by the app so the factory stays testable. */
  supabase: TypedSupabaseClient;
  /**
   * Called with the original mutation variables after a successful RPC response.
   * Each app passes its own implementation that performs query invalidation and
   * shows a success toast.
   */
  onSuccess: (vars: ConfigureTechnicalTicketEquipmentInput) => void | Promise<void>;
  /**
   * Maps a mutation error to a toast message string. Each app passes its own
   * toastMutationError call (with app-specific extraHandlers where needed).
   */
  mapMutationError: (error: unknown) => void;
}

/**
 * Factory that produces a `useConfigureTechnicalTicketEquipment` hook.
 *
 * Neither `useAuthContext` nor `useQueryClient` is called inside the factory —
 * all app-specific concerns (query invalidation, staffId, toast copy) are
 * delegated to the caller via `onSuccess` and `mapMutationError`.
 *
 * ADR-7: The underlying mutationFn is identical across admin and installer;
 * only the `onSuccess` callback and `mapMutationError` differ per app.
 */
export function createUseConfigureTechnicalTicketEquipment(
  opts: CreateUseConfigureTechnicalTicketEquipmentOptions,
): () => UseMutationResult<void, unknown, ConfigureTechnicalTicketEquipmentInput> {
  return function useConfigureTechnicalTicketEquipment() {
    return useMutation<void, unknown, ConfigureTechnicalTicketEquipmentInput>({
      mutationFn: (input) => configureTechnicalTicketEquipment(opts.supabase, input),
      onSuccess: (_data, vars) => opts.onSuccess(vars),
      onError: opts.mapMutationError,
    });
  };
}
