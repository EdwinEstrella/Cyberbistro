export function GameSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando juego..."
      className="flex flex-col items-center justify-center p-6 space-y-4 animate-pulse min-h-[360px]"
    >
      <div className="flex justify-between items-center w-full max-w-xs">
        <div className="h-8 w-20 bg-zinc-800 rounded-lg" />
        <div className="h-8 w-24 bg-zinc-800 rounded-lg" />
      </div>

      <div className="size-64 sm:size-72 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center">
        <div className="size-10 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
      </div>

      <div className="h-4 w-32 bg-zinc-800 rounded" />
      <span className="sr-only">Cargando juego...</span>
    </div>
  );
}
