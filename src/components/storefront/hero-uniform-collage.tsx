import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface HeroUniformCollageProps {
  href: string;
}

const heroProducts = [
  {
    src: "/images/uniforms/catalog/coronel-arias-chomba.png",
    alt: "Chomba escolar de la Escuela Coronel Arias",
    label: "Coronel Arias",
    garment: "Chomba",
  },
  {
    src: "/images/uniforms/catalog/etha-remera.webp",
    alt: "Remera escolar ETHA",
    label: "E.T.H.A.",
  },
  {
    src: "/images/uniforms/catalog/normal-remera.webp",
    alt: "Remera de la Escuela Normal Superior",
    label: "Escuela Normal",
  },
];

export function HeroUniformCollage({ href }: HeroUniformCollageProps) {
  return (
    <Link
      href={href}
      className="group relative isolate mx-auto min-h-[31rem] w-full max-w-[46rem] sm:min-h-[42rem]"
      aria-label="Abrir tienda de uniformes escolares"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-[7%] bottom-[5%] top-[7%] -rotate-3 rounded-[44%_56%_48%_52%/42%_38%_62%_58%] border border-gloria-300/70 bg-gloria-200/65 shadow-[0_35px_90px_-55px_oklch(0.35_0.085_134/0.7)] transition duration-700 group-hover:rotate-0"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-[13%] bottom-[11%] top-[13%] rotate-6 rounded-[52%_48%_40%_60%/44%_55%_45%_56%] bg-white/75"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 720 660"
        className="absolute inset-0 z-0 size-full text-gloria-700/35"
        fill="none"
      >
        <path
          d="M84 216C128 70 340 24 538 99C674 150 676 384 592 519C506 656 248 660 107 539C29 472 40 350 84 216Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="7 11"
        />
      </svg>

      <div className="absolute left-[4%] top-[13%] z-20 h-[69%] w-[49%] -rotate-[7deg] rounded-[2.6rem_1rem_4.8rem_1.3rem] bg-white p-1.5 shadow-[0_30px_65px_-25px_oklch(0.2_0.045_136/0.55)] transition duration-700 group-hover:-translate-y-2 group-hover:-rotate-3 sm:p-2">
        <div className="relative size-full overflow-hidden rounded-[2.25rem_0.7rem_4.4rem_1rem] bg-[#17151a]">
          <Image
            src={heroProducts[0].src}
            alt={heroProducts[0].alt}
            fill
            preload
            className="object-cover transition duration-700 group-hover:scale-[1.025]"
            sizes="(max-width: 1024px) 50vw, 27vw"
          />
          <span className="absolute inset-2 rounded-[1.8rem_0.5rem_3.8rem_0.8rem] border border-dashed border-white/45" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[0.62rem] font-black uppercase tracking-[0.1em] text-gloria-950 shadow sm:left-4 sm:top-4 sm:text-xs">
            <span className="hidden sm:inline">
              {heroProducts[0].garment} · Escuela{` `}
            </span>
            {heroProducts[0].label}
          </span>
        </div>
      </div>

      <div className="absolute right-[4%] top-[5%] z-10 h-[46%] w-[43%] rotate-[7deg] rounded-[1rem_3.8rem_1.2rem_2.8rem] bg-white p-1.5 shadow-[0_24px_55px_-28px_oklch(0.2_0.045_136/0.48)] transition duration-700 group-hover:translate-x-1 group-hover:rotate-3 sm:p-2">
        <div className="relative size-full overflow-hidden rounded-[0.7rem_3.45rem_0.9rem_2.45rem] bg-[#17151a]">
          <Image
            src={heroProducts[1].src}
            alt={heroProducts[1].alt}
            fill
            loading="eager"
            className="object-cover transition duration-700 group-hover:scale-[1.025]"
            sizes="(max-width: 1024px) 44vw, 24vw"
          />
          <span className="absolute inset-2 rounded-[0.5rem_2.9rem_0.7rem_2rem] border border-dashed border-white/45" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[0.62rem] font-black uppercase tracking-[0.1em] text-gloria-950 shadow sm:left-4 sm:top-4 sm:text-xs">
            {heroProducts[1].label}
          </span>
        </div>
      </div>

      <div className="absolute bottom-[5%] right-[2%] z-30 h-[43%] w-[47%] rotate-[4deg] rounded-[3.4rem_1rem_3rem_1.2rem] bg-white p-1.5 shadow-[0_30px_65px_-26px_oklch(0.2_0.045_136/0.55)] transition duration-700 group-hover:translate-y-1 group-hover:rotate-1 sm:p-2">
        <div className="relative size-full overflow-hidden rounded-[3rem_0.7rem_2.65rem_0.9rem] bg-[#17151a]">
          <Image
            src={heroProducts[2].src}
            alt={heroProducts[2].alt}
            fill
            loading="eager"
            className="object-cover transition duration-700 group-hover:scale-[1.025]"
            sizes="(max-width: 1024px) 48vw, 26vw"
          />
          <span className="absolute inset-2 rounded-[2.5rem_0.5rem_2.1rem_0.7rem] border border-dashed border-white/45" />
          <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1.5 text-[0.62rem] font-black uppercase tracking-[0.1em] text-gloria-950 shadow sm:bottom-4 sm:right-4 sm:text-xs">
            {heroProducts[2].label}
          </span>
        </div>
      </div>

      <span className="absolute right-[1%] top-[45%] z-40 grid size-24 rotate-6 place-content-center rounded-[2.1rem_2.1rem_2.1rem_0.65rem] border-4 border-gloria-50 bg-gloria-950 px-2 text-center text-[0.62rem] font-black uppercase leading-4 tracking-[0.12em] text-white shadow-xl transition duration-500 group-hover:rotate-2 sm:size-32 sm:text-xs sm:leading-5">
        Elegí escuela
        <span className="text-gloria-300">y talle</span>
      </span>

      <span className="absolute bottom-[7%] left-[7%] z-50 rounded-full bg-gloria-500 px-4 py-2.5 text-xs font-black text-gloria-950 shadow-[0_14px_30px_-12px_oklch(0.2_0.045_136/0.6)] transition group-hover:bg-gloria-400 sm:px-5 sm:py-3 sm:text-sm">
        Ver todos los uniformes
        <ArrowRight className="ml-2 inline size-4" />
      </span>
    </Link>
  );
}
