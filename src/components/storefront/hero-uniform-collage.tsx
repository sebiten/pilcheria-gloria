import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface HeroUniformCollageProps {
  href: string;
}

const heroProducts = [
  {
    src: "/images/uniforms/catalog/dorrego-chomba-hero.webp",
    alt: "Chomba escolar de la Escuela Coronel Manuel Dorrego",
    label: "Dorrego",
  },
  {
    src: "/images/uniforms/catalog/etha-remera-hero.webp",
    alt: "Remera escolar ETHA",
    label: "E.T.H.A.",
  },
  {
    src: "/images/uniforms/catalog/normal-remera-hero.webp",
    alt: "Remera de la Escuela Normal Superior",
    label: "Escuela Normal",
  },
];

const garmentShadow =
  "drop-shadow-[0_2px_1px_oklch(0.2_0.045_136/0.18)] drop-shadow-[0_24px_18px_oklch(0.2_0.045_136/0.22)]";

export function HeroUniformCollage({ href }: HeroUniformCollageProps) {
  return (
    <Link
      href={href}
      className="group relative isolate mx-auto block min-h-[31rem] w-full max-w-[46rem] overflow-visible sm:min-h-[40rem] lg:min-h-[42rem]"
      aria-label="Abrir tienda de uniformes escolares"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-[7%] bottom-[7%] top-[7%] -rotate-3 rounded-[45%_55%_42%_58%/38%_44%_56%_62%] bg-gloria-200/60 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-0"
      />
      <div
        aria-hidden="true"
        className="absolute left-[14%] top-[18%] size-28 rounded-full bg-gloria-400/25 blur-2xl sm:size-44"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[13%] right-[8%] size-24 rounded-full bg-gloria-500/20 blur-2xl sm:size-36"
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 720 660"
        className="absolute inset-0 z-0 size-full text-gloria-700/35"
        fill="none"
      >
        <path
          d="M76 204C119 68 330 25 535 92C674 138 691 365 611 512C527 667 257 676 102 548C24 483 29 351 76 204Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="7 12"
        />
        <path
          d="M150 553C255 600 443 608 579 523"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="606" cy="132" r="5" fill="currentColor" />
        <circle cx="117" cy="435" r="4" fill="currentColor" />
      </svg>

      <div className="absolute left-[1%] top-[8%] z-30 h-[72%] w-[56%] -rotate-3 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:-rotate-1 sm:top-[5%] sm:h-[78%] sm:w-[57%]">
        <Image
          src={heroProducts[0].src}
          alt={heroProducts[0].alt}
          fill
          preload
          className={`object-contain scale-[1.3] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.34] sm:scale-[1.34] sm:group-hover:scale-[1.38] ${garmentShadow}`}
          sizes="(max-width: 1024px) 56vw, 31vw"
        />
      </div>

      <div className="absolute right-[1%] top-[3%] z-20 h-[50%] w-[44%] rotate-3 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:rotate-1 sm:right-[3%] sm:h-[55%] sm:w-[45%]">
        <Image
          src={heroProducts[1].src}
          alt={heroProducts[1].alt}
          fill
          loading="eager"
          className={`object-contain transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025] ${garmentShadow}`}
          sizes="(max-width: 1024px) 44vw, 25vw"
        />
      </div>

      <div className="absolute bottom-[10%] right-[-1%] z-20 h-[46%] w-[46%] rotate-2 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-1 group-hover:rotate-0 sm:bottom-[4%] sm:right-[1%] sm:h-[50%] sm:w-[47%]">
        <Image
          src={heroProducts[2].src}
          alt={heroProducts[2].alt}
          fill
          loading="eager"
          className={`object-contain transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.025] ${garmentShadow}`}
          sizes="(max-width: 1024px) 46vw, 26vw"
        />
      </div>

      <span className="absolute left-[4%] top-[18%] z-40 inline-flex items-center gap-2 rounded-full bg-gloria-950 px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.12em] text-gloria-50 shadow-[0_10px_24px_-12px_oklch(0.2_0.045_136/0.65)] sm:left-[6%] sm:px-4 sm:text-xs">
        <span className="size-1.5 rounded-full bg-gloria-500" />
        {heroProducts[0].label}
        <span className="hidden text-gloria-300 sm:inline">· Chomba</span>
      </span>

      <span className="absolute right-[7%] top-[5%] z-40 inline-flex items-center gap-2 rounded-full bg-gloria-50 px-3 py-2 text-[0.65rem] font-black uppercase tracking-[0.12em] text-gloria-950 shadow-[0_10px_24px_-12px_oklch(0.2_0.045_136/0.42)] ring-1 ring-gloria-300/70 sm:right-[10%] sm:px-4 sm:text-xs">
        <span className="size-1.5 rounded-full bg-gloria-600" />
        {heroProducts[1].label}
      </span>

      <span className="absolute bottom-[15%] right-[1%] z-40 inline-flex items-center gap-2 rounded-full bg-gloria-50 px-3 py-2 text-[0.62rem] font-black uppercase tracking-[0.1em] text-gloria-950 shadow-[0_10px_24px_-12px_oklch(0.2_0.045_136/0.42)] ring-1 ring-gloria-300/70 sm:bottom-[10%] sm:right-[3%] sm:px-4 sm:text-xs">
        <span className="size-1.5 rounded-full bg-gloria-600" />
        {heroProducts[2].label}
      </span>

      <span className="absolute bottom-[1%] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:bottom-[2%] sm:left-[7%] sm:translate-x-0 sm:items-start">
        <span className="pl-2 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-gloria-800">
          Elegí escuela y talle
        </span>
        <span className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-gloria-500 px-5 text-xs font-black text-gloria-950 shadow-[0_14px_30px_-12px_oklch(0.2_0.045_136/0.6)] transition-colors group-hover:bg-gloria-400 sm:px-6 sm:text-sm">
          Ver todos los uniformes
          <ArrowRight className="ml-2 size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </span>
    </Link>
  );
}
