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
    mobileLabel: "Dorrego",
    number: "01",
    query: "Dorrego",
  },
  {
    src: "/images/uniforms/catalog/etha-remera-hero.webp",
    alt: "Remera escolar ETHA",
    label: "E.T.H.A.",
    mobileLabel: "E.T.H.A.",
    number: "02",
    query: "ETHA",
  },
  {
    src: "/images/uniforms/catalog/normal-remera-hero.webp",
    alt: "Remera de la Escuela Normal Superior",
    label: "Escuela Normal",
    mobileLabel: "Normal",
    number: "03",
    query: "Normal",
  },
] as const;

function getSchoolHref(baseHref: string, query: string) {
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}q=${encodeURIComponent(query)}`;
}

const garmentShadow =
  "drop-shadow-[0_18px_16px_oklch(0.2_0.045_136/0.22)]";

export function HeroUniformCollage({ href }: HeroUniformCollageProps) {
  return (
    <div
      className="relative -mx-4 mt-5 grid w-[calc(100%+2rem)] grid-cols-2 items-start gap-x-4 px-4 pb-5 pt-3 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:absolute lg:inset-0 lg:m-0 lg:block lg:h-auto lg:w-full lg:p-0"
      role="group"
      aria-label="Uniformes destacados por escuela"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-2 inset-y-0 rounded-[2.5rem] border border-dashed border-gloria-700/25 bg-gloria-200/45 sm:inset-x-3 lg:bottom-[4%] lg:left-[36%] lg:right-[1%] lg:top-[5%] lg:rounded-[46%_54%_42%_58%/38%_43%_57%_62%] lg:bg-gloria-200/55"
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 390 430"
        preserveAspectRatio="none"
        className="absolute inset-0 z-[5] size-full text-gloria-700/35 lg:hidden"
        fill="none"
      >
        <path
          className="hero-thread-path"
          pathLength="1"
          d="M10 95C82 50 183 61 226 117C267 170 223 219 144 229C82 237 57 273 89 315C128 366 256 368 381 321"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="0.025 0.035"
          strokeLinecap="round"
        />
        <circle cx="10" cy="95" r="4" fill="currentColor" />
        <circle cx="380" cy="321" r="4" fill="currentColor" />
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

      <Link
        href={getSchoolHref(href, heroProducts[0].query)}
        className="hero-garment-reveal-desktop hero-garment-shell relative z-20 col-span-2 block rounded-[2rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-700 focus-visible:ring-offset-4 lg:absolute lg:left-[54%] lg:top-[-7%] lg:h-[104%] lg:w-[34%]"
        aria-label={`Ver uniformes de ${heroProducts[0].label}`}
      >
        <span className="hero-school-link relative z-40 mx-auto flex min-h-9 w-fit items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-gloria-950 lg:absolute lg:left-[-9%] lg:top-[21%] lg:min-h-11 lg:text-sm">
          <span className="text-gloria-700">{heroProducts[0].number}</span>
          <span className="size-2 rounded-full bg-gloria-600" />
          <span className="lg:hidden">{heroProducts[0].mobileLabel}</span>
          <span className="hidden lg:inline">{heroProducts[0].label}</span>
        </span>
        <span className="hero-dorrego-art hero-garment-art relative mx-auto block h-56 w-[60%] sm:h-64 sm:w-[52%] lg:size-full lg:rotate-2">
          <Image
            src={heroProducts[0].src}
            alt={heroProducts[0].alt}
            fill
            preload
            className={`object-contain ${garmentShadow}`}
            sizes="(max-width: 1023px) 72vw, 34vw"
          />
        </span>
      </Link>

      <Link
        href={getSchoolHref(href, heroProducts[1].query)}
        className="hero-garment-reveal-desktop hero-garment-shell relative z-20 min-w-0 rounded-[1.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-700 focus-visible:ring-offset-4 lg:absolute lg:bottom-[-3%] lg:left-0 lg:h-[48%] lg:w-[22%]"
        aria-label={`Ver uniformes de ${heroProducts[1].label}`}
      >
        <span className="hero-school-link relative z-40 flex min-h-9 items-center justify-center gap-2 whitespace-nowrap text-xs font-black uppercase tracking-[0.1em] text-gloria-950 lg:absolute lg:bottom-[3%] lg:left-[13%] lg:min-h-11 lg:text-sm lg:tracking-[0.12em]">
          <span className="text-gloria-700">{heroProducts[1].number}</span>
          <span className="size-2 rounded-full bg-gloria-600" />
          {heroProducts[1].mobileLabel}
        </span>
        <span className="hero-garment-art relative block h-40 w-full lg:size-full xl:-rotate-3">
          <Image
            src={heroProducts[1].src}
            alt={heroProducts[1].alt}
            fill
            className={`object-contain ${garmentShadow}`}
            sizes="(max-width: 1023px) 43vw, 22vw"
          />
        </span>
      </Link>

      <Link
        href={getSchoolHref(href, heroProducts[2].query)}
        className="hero-garment-reveal-desktop hero-garment-shell relative z-20 min-w-0 rounded-[1.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-700 focus-visible:ring-offset-4 lg:absolute lg:bottom-[-2%] lg:right-0 lg:h-[49%] lg:w-[22%]"
        aria-label={`Ver uniformes de ${heroProducts[2].label}`}
      >
        <span className="hero-school-link relative z-40 flex min-h-9 items-center justify-center gap-2 whitespace-nowrap text-xs font-black uppercase tracking-[0.1em] text-gloria-950 lg:absolute lg:bottom-[1%] lg:right-[8%] lg:min-h-11 lg:text-sm">
          <span className="text-gloria-700">{heroProducts[2].number}</span>
          <span className="size-2 rounded-full bg-gloria-600" />
          <span className="lg:hidden">{heroProducts[2].mobileLabel}</span>
          <span className="hidden lg:inline">{heroProducts[2].label}</span>
        </span>
        <span className="hero-garment-art relative block h-40 w-full lg:size-full xl:rotate-3">
          <Image
            src={heroProducts[2].src}
            alt={heroProducts[2].alt}
            fill
            className={`object-contain ${garmentShadow}`}
            sizes="(max-width: 1023px) 43vw, 22vw"
          />
        </span>
      </Link>
    </div>
  );
}
