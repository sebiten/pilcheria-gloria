export default function UniformDetailLoading() {
  return (
    <main className="container mx-auto px-4 py-6" aria-busy="true">
      <div className="h-5 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none lg:h-[40rem]" />
        <div className="space-y-4">
          <div className="h-12 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-9 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    </main>
  );
}
