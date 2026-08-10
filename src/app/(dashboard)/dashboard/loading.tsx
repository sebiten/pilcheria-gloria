export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Cargando panel">
      <span className="sr-only">Cargando panelâ€¦</span>
      <div className="h-9 w-56 animate-pulse rounded-xl bg-muted" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border bg-card"
          />
        ))}
      </div>
      <div className="mt-6 h-80 animate-pulse rounded-2xl border bg-card" />
    </div>
  );
}
