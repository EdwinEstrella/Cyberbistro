export function Compras() {
  return (
    <div className="flex-1 flex flex-col gap-6 p-6 min-h-0 bg-[#0c0c0c]">
      <div className="flex justify-between items-center pb-4 border-b border-[rgba(72,72,71,0.15)]">
        <div>
          <span className="font-['Inter',sans-serif] text-[#6b7280] text-[11px] uppercase tracking-[0.5px]">
            Inventario y Abastecimiento
          </span>
          <h2 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[24px] uppercase tracking-[0.5px]">
            Registro de Compras
          </h2>
        </div>
      </div>

      <div className="bg-[#131313] border border-[rgba(72,72,71,0.18)] rounded-[20px] p-12 text-center flex flex-col items-center justify-center gap-4 max-w-[500px] mx-auto mt-10">
        <div className="bg-[rgba(255,144,109,0.08)] p-4 rounded-full border border-[rgba(255,144,109,0.18)] text-[#ff906d]">
          <svg className="size-[32px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-8 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
          </svg>
        </div>
        <h3 className="font-['Space_Grotesk',sans-serif] font-bold text-white text-[16px] uppercase">
          Módulo de Compras en Construcción
        </h3>
        <p className="font-['Inter',sans-serif] text-[#adaaaa] text-[12.5px] leading-relaxed">
          Las tablas y rutas ya se encuentran completamente configuradas en el sistema local-first y base de datos.
          El desarrollo de la interfaz interactiva y el control de existencias de compras comenzará en el próximo PR.
        </p>
      </div>
    </div>
  );
}
