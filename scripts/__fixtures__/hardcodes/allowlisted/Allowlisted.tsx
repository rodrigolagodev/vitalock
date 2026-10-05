export function Allowlisted() {
  return (
    <div className="data-[state=open]:bg-accent w-[var(--radix-popover-trigger-width)] max-h-[--radix-select-content-available-height] translate-x-[-50%] slide-in-from-top-[48%] grid-cols-[200px_1fr] w-[calc(var(--sidebar-width)+8px)] bg-black/80 text-white">
      <span className="bg-info text-destructive" />
    </div>
  );
}
