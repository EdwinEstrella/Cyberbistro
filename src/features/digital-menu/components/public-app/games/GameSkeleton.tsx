export function GameSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando juego..."
      className="flex flex-col items-center justify-center p-6 space-y-4 animate-pulse min-h-[360px]"
    >
      <div className="flex justify-between items-center w-full max-w-xs">
        <div className="h-8 w-20 bg-[#1a1a1a] rounded-lg" />
        <div className="h-8 w-24 bg-[#1a1a1a] rounded-lg" />
      </div>

      <div className="size-64 sm:size-72 rounded-[20px] bg-[#1a1a1a] border border-[#262626] flex items-center justify-center">
        <div className="size-10 rounded-full border-2 border-[#ff906d] border-t-transparent animate-spin" />
      </div>

      <div className="h-4 w-32 bg-[#1a1a1a] rounded" />
      <span className="sr-only">Cargando juego...</span>
    </div>
  );
}
