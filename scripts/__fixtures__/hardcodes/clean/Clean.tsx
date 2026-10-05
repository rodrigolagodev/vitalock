// spec #220 — a comment with a hash and bg-red-500 must never be scanned.
export function Clean() {
  return (
    <div className="bg-info/10 text-info h-px w-96 max-w-48 min-h-20">
      <p>Orden #123</p>
    </div>
  );
}
