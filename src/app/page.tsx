export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-xl rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">SupaStore</h1>
        <p className="mt-3 text-slate-600">
          A self-hosted, resilient online store for small merchants who manage availability manually and collect payment before preparing orders.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 border border-emerald-200">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Milestone M0 Foundations Active
        </div>
      </div>
    </main>
  );
}
