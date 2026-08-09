import Image from "next/image";
import Link from "next/link";

interface HeroUniformCollageProps {
  href: string;
}

const heroProducts = [
  {
    src: "/images/uniforms/catalog/dorrego-chomba-hero.webp",
    alt: "Chomba escolar de la Escuela Coronel Manuel Dorrego",
    label: "Dorrego",
    number: "01",
    query: "Dorrego",
  },
  {
    src: "/images/uniforms/catalog/etha-remera-hero.webp",
    alt: "Remera escolar ETHA",
    label: "E.T.H.A.",
    number: "02",
    query: "ETHA",
  },
  {
    src: "/images/uniforms/catalog/normal-remera-hero.webp",
    alt: "Remera de la Escuela Normal Superior",
    label: "Escuela Normal",
    number: "03",
    query: "Normal",
  },
];

function getSchoolHref(baseHref: string, query: string) {
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}q=${encodeURIComponent(query)}`;
}

const garmentShadow =
  "drop-shadow-[0_20px_18px_oklch(0.2_0.045_136/0.24)]";

export function HeroUniformCollage({ href }: HeroUniformCollageProps) {
  return (
    <div
      className="relative -mt-6 h-[25rem] w-full sm:-mt-10 sm:h-[31rem] lg:absolute lg:inset-0 lg:mt-0 lg:h-auto"
      role="group"
      aria-label="Uniformes destacados por escuela"
    >
      <div
        aria-hidden="true"
        className="hero-scroll-drift absolute inset-x-[4%] bottom-[4%] top-[2%] rounded-[42%_58%_47%_53%/38%_44%_56%_62%] border border-dashed border-gloria-700/25 bg-gloria-200/55 lg:bottom-[4%] lg:left-[36%] lg:right-[1%] lg:top-[5%] lg:rounded-[46%_54%_42%_58%/38%_43%_57%_62%]"
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 390 420"
        className="absolute inset-0 z-[5] size-full text-gloria-700/40 lg:hidden"
        fill="none"
      >
        <path
          className="hero-thread-path"
          pathLength="1"
          d="M8 91C87 48 183 71 220 123C261 181 220 223 133 236C68 245 36 277 72 324C112 377 251 367 382 312"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="0.025 0.035"
          strokeLinecap="round"
        />
        <circle cx="9" cy="91" r="4" fill="currentColor" />
        <circle cx="381" cy="312" r="4" fill="currentColor" />
      </svg>

      <svg
        aria-hidden="true"
        viewBox="0 0 1440 760"
        preserveAspectRatio="none"
        className="absolute inset-0 z-[5] hidden size-full text-gloria-700/38 lg:block"
        fill="none"
      >
        <path
          className="hero-thread-path"
          pathLength="1"
          d="M4 171C223 69 447 102 588 224C733 349 741 462 931 471C1125 480 1284 333 1437 157"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="0.012 0.018"
          strokeLinecap="round"
        />
        <path
          className="hero-thread-path [animation-delay:180ms]"
          pathLength="1"
          d="M920 471C1017 605 1197 699 1438 671"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="8" cy="169" r="5" fill="currentColor" />
        <circle cx="1431" cy="671" r="5" fill="currentColor" />
      </svg>

      <div className="hero-garment-shell hero-garment-reveal pointer-events-none absolute right-0 top-[-10%] z-20 h-full w-[60%] [animation-delay:80ms] lg:left-[54%] lg:right-auto lg:top-[-7%] lg:h-[104%] lg:w-[34%]">
        <div className="hero-garment-art relative size-full rotate-3 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:rotate-2">
          <Image
            src={heroProducts[0].src}
            alt={heroProducts[0].alt}
            fill
            preload
            className={`object-contain ${garmentShadow}`}
            sizes="(max-width: 1023px) 60vw, 34vw"
          />
        </div>
        <Link
          href={getSchoolHref(href, heroProducts[0].query)}
          className="hero-school-link pointer-events-auto absolute right-[4%] top-[22%] z-40 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-gloria-950 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-700 focus-visible:ring-offset-4 lg:left-[-9%] lg:right-auto lg:top-[21%] lg:text-sm"
          aria-label={`Ver uniformes de ${heroProducts[0].label}`}
        >
          <span className="text-gloria-700">{heroProducts[0].number}</span>
          <span className="size-2 rounded-full bg-gloria-600" />
          {heroProducts[0].label}
        </Link>
      </div>

      <div className="hero-garment-shell hero-garment-reveal pointer-events-none absolute bottom-[-2%] left-0 z-20 h-[48%] w-[47%] [animation-delay:180ms] lg:bottom-[-3%] lg:left-0 lg:h-[48%] lg:w-[22%]">
        <div className="hero-garment-art relative size-full -rotate-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:rotate-0 xl:-rotate-3">
          <Image
            src={heroProducts[1].src}
            alt={heroProducts[1].alt}
            fill
            className={`object-contain ${garmentShadow}`}
            sizes="(max-width: 1023px) 47vw, 22vw"
          />
        </div>
        <Link
          href={getSchoolHref(href, heroProducts[1].query)}
          className="hero-school-link pointer-events-auto absolute bottom-[4%] left-[10%] z-40 inline-flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-gloria-950 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-700 focus-visible:ring-offset-4 lg:bottom-[3%] lg:left-[13%] lg:text-sm"
          aria-label={`Ver uniformes de ${heroProducts[1].label}`}
        >
          <span className="text-gloria-700">{heroProducts[1].number}</span>
          <span className="size-2 rounded-full bg-gloria-600" />
          {heroProducts[1].label}
        </Link>
      </div>

      <div className="hero-garment-shell hero-garment-reveal pointer-events-none absolute bottom-[-1%] right-0 z-20 h-[47%] w-[46%] [animation-delay:280ms] lg:bottom-[-2%] lg:right-0 lg:h-[49%] lg:w-[22%]">
        <div className="hero-garment-art relative size-full rotate-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:rotate-0 xl:rotate-3">
          <Image
            src={heroProducts[2].src}
            alt={heroProducts[2].alt}
            fill
            className={`object-contain ${garmentShadow}`}
            sizes="(max-width: 1023px) 46vw, 22vw"
          />
        </div>
        <Link
          href={getSchoolHref(href, heroProducts[2].query)}
          className="hero-school-link pointer-events-auto absolute bottom-[2%] right-[2%] z-40 inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-xs font-black uppercase tracking-[0.1em] text-gloria-950 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-700 focus-visible:ring-offset-4 lg:bottom-[1%] lg:right-[8%] lg:text-sm"
          aria-label={`Ver uniformes de ${heroProducts[2].label}`}
        >
          <span className="text-gloria-700">{heroProducts[2].number}</span>
          <span className="size-2 rounded-full bg-gloria-600" />
          {heroProducts[2].label}
        </Link>
      </div>
    </div>
  );
}
