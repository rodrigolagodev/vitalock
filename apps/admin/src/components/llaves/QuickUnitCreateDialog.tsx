// Barrel re-export — llaves QuickUnitCreateDialog delegates to the shared ordenes version.
// This indirection lets tests mock '@/components/llaves/QuickUnitCreateDialog' independently
// from the legacy ordenes version, and simplifies the PR-9 retirement boundary.
export { QuickUnitCreateDialog } from '@/components/ordenes/QuickUnitCreateDialog';
