// Compatibility shim — canonical implementation lives in @vitalock/ui.
// Kept only while sibling WIP (atomic-stock-work-resolution) still imports
// @/components/ui/dialog; delete when that change rewires its imports.
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@vitalock/ui';
