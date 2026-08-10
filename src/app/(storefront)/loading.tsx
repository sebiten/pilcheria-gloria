export default function StorefrontLoading() {
  return (
    <div
      className="container mx-auto min-h-[55vh] px-4 py-10 sm:py-14"
      role="status"
      aria-live="polite"
      aria-label="Cargando contenido"
    >
      <span className="sr-only">Cargando contenidoâ€¦</span>
      <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
      <div className="mt-5 h-12 w-full max-w-xl animate-pulse rounded-2xl bg-muted" />
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="space-y-3">
            <div className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />
            <div className="h-4 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
