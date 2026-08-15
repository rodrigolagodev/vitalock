// Compatibility shim — canonical implementation lives in @vitalock/ui.
// Kept so the 13 existing admin import sites keep resolving unchanged while
// tables migrate to DataTable (see openspec/changes/unified-tables).
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@vitalock/ui';
