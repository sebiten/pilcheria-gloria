"use client";

import { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, MessageCircle, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackStorefrontEvent } from "@/lib/analytics/client";
import styles from "./school-uniforms-carousel.module.css";

type SchoolIdentity = {
  id: string;
  name: string;
  level: string;
  mark: string;
  image: {
    src: string;
    alt: string;
  };
};

const schools: SchoolIdentity[] = [
  {
    id: "311",
    name: "Escuela N.º 311",
    level: "Nivel primario",
    mark: "311",
    image: {
      src: "/images/uniforms/catalog/311-chomba.webp",
      alt: "Chomba completa de la Escuela N° 311",
    },
  },
  {
    id: "normal",
    name: "Normal",
    level: "Primaria y secundaria",
    mark: "ENS",
    image: {
      src: "/images/uniforms/catalog/normal-remera.webp",
      alt: "Remera completa de la Escuela Normal Superior",
    },
  },
  {
    id: "etha",
    name: "ETHA",
    level: "Nivel secundario",
    mark: "ETHA",
    image: {
      src: "/images/uniforms/catalog/etha-remera.webp",
      alt: "Remera completa del Colegio Técnico Marista ETHA",
    },
  },
  {
    id: "fasta",
    name: "FASTA",
    level: "Nivel primario y secundario",
    mark: "FASTA",
    image: {
      src: "/images/uniforms/catalog/fasta-remera.webp",
      alt: "Remera completa del Colegio FASTA",
    },
  },
  {
    id: "wollmann",
    name: "Enrique Wollmann",
    level: "Nivel primario",
    mark: "N° 3",
    image: {
      src: "/images/uniforms/catalog/wallman-remera.webp",
      alt: "Remera completa de la Escuela Enrique Wollmann",
    },
  },
  {
    id: "lola-mora",
    name: "Artes · Lola Mora",
    level: "Nivel secundario",
    mark: "ARTES",
    image: {
      src: "/images/uniforms/catalog/lola-mora-escuela-de-artes-remera.webp",
      alt: "Remera completa de la Escuela Provincial de Artes Lola Mora",
    },
  },
  {
    id: "comercial-4",
    name: "Comercio N.º 4",
    level: "25 de Febrero · Secundaria",
    mark: "COM 4",
    image: {
      src: "/images/uniforms/catalog/comercial-4-remera.webp",
      alt: "Remera completa de la Escuela Provincial de Comercio N° 4",
    },
  },
  {
    id: "comercial-6",
    name: "Comercio N.º 6",
    level: "Nivel secundario",
    mark: "COM 6",
    image: {
      src: "/images/uniforms/catalog/comercial-6-chomba.webp",
      alt: "Chomba completa de la Escuela de Comercio N° 6",
    },
  },
  {
    id: "dorrego",
    name: "Dorrego",
    level: "Nivel primario",
    mark: "112",
    image: {
      src: "/images/uniforms/catalog/dorrego-chomba.webp",
      alt: "Chomba completa de la Escuela Coronel Manuel Dorrego",
    },
  },
  {
    id: "bachillerato-7",
    name: "Bachillerato N.º 7 · Calilegua",
    level: "Nivel secundario",
    mark: "BACH 7",
    image: {
      src: "/images/uniforms/catalog/bachillerato-calilegua-remera.webp",
      alt: "Remera completa del Bachillerato Provincial N° 7 de Calilegua",
    },
  },
  {
    id: "cooperativa",
    name: "Cooperativa",
    level: "Nivel primario",
    mark: "COOP",
    image: {
      src: "/images/uniforms/catalog/coperativa-chomba.webp",
      alt: "Chomba completa de la Escuela Cooperativa Libertad",
    },
  },
  {
    id: "galan",
    name: "Galán",
    level: "Nivel primario",
    mark: "213",
    image: {
      src: "/images/uniforms/catalog/galan-remera.webp",
      alt: "Remera completa de la Escuela Martín Raúl Galán",
    },
  },
  {
    id: "secundario-47",
    name: "Secundario N.º 47",
    level: "Nivel secundario",
    mark: "47",
    image: {
      src: "/images/uniforms/catalog/secundario-47-remera.webp",
      alt: "Remera del Colegio Secundario N° 47",
    },
  },
  {
    id: "agrotecnico",
    name: "Agrotécnica",
    level: "Nivel secundario",
    mark: "AGRO",
    image: {
      src: "/images/uniforms/catalog/agrotecnica-remera.webp",
      alt: "Remera del Colegio Secundario Agrotécnico",
    },
  },
  {
    id: "robotica",
    name: "Robótica",
    level: "Nivel secundario",
    mark: "ROBÓTICA",
    image: {
      src: "/images/uniforms/catalog/robotica-remera.webp",
      alt: "Remera del Colegio Secundario de Robótica",
    },
  },
  {
    id: "escuela-261",
    name: "Escuela 261",
    level: "Nivel primario",
    mark: "261",
    image: {
      src: "/images/uniforms/catalog/escuela-261-remera.webp",
      alt: "Remera de la Escuela N° 261 Provincia de Tucumán",
    },
  },
  {
    id: "santibanez",
    name: "Mariano Santibáñez",
    level: "Nivel primario",
    mark: "SANTIBÁÑEZ",
    image: {
      src: "/images/uniforms/catalog/coronel-mariano-santibanez-chomba.webp",
      alt: "Chomba de la Escuela Coronel Mariano Santibáñez",
    },
  },
  {
    id: "escuela-73",
    name: "Miguel E. Soler",
    level: "Nivel primario",
    mark: "73",
    image: {
      src: "/images/uniforms/catalog/escuela-73-soler-chomba.webp",
      alt: "Chomba de la Escuela N° 73 Miguel Estanislao Soler",
    },
  },
];

function getWhatsappUrl(phone: string | null | undefined) {
  const normalizedPhone = phone?.replace(/\D/g, "");
  if (!normalizedPhone) return null;

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(
    "Hola, busco un uniforme que no aparece en la tienda. Escuela: __. Prenda: __. Talle: __."
  )}`;
}

function SchoolCard({
  school,
  duplicate = false,
}: {
  school: SchoolIdentity;
  duplicate?: boolean;
}) {
  const productUrl = `/uniformes?school=${school.id}`;
  const content = (
    <>
      <span className="relative h-24 w-20 shrink-0 overflow-hidden rounded-2xl border border-gloria-200 bg-[#17151a]">
        <Image
          src={school.image.src}
          alt={school.image.alt}
          fill
          className="object-contain"
          sizes="5rem"
        />
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-base font-extrabold leading-5 text-gloria-950">
          {school.name}
        </span>
        <span className="mt-1 block text-xs font-medium text-muted-foreground">
          {school.level}
        </span>
      </span>
      <ArrowRight className="ml-auto size-4 shrink-0 text-gloria-700" />
    </>
  );
  const className =
    "flex h-32 w-[20rem] shrink-0 items-center gap-4 rounded-3xl border border-gloria-200 bg-white p-4 shadow-[0_12px_35px_-28px_oklch(0.35_0.085_134/0.55)] transition hover:-translate-y-0.5 hover:border-gloria-400 hover:shadow-[0_18px_40px_-26px_oklch(0.35_0.085_134/0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gloria-600 focus-visible:ring-offset-2";

  return (
    <Link
      href={productUrl}
      onClick={() =>
        trackStorefrontEvent({ event: "select_school", schoolId: school.id })
      }
      className={className}
      tabIndex={duplicate ? -1 : undefined}
      aria-label={`Ver uniformes de ${school.name}`}
    >
      {content}
    </Link>
  );
}

export function SchoolUniformsCarousel({
  whatsappPhone,
}: {
  whatsappPhone?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const whatsappUrl = getWhatsappUrl(whatsappPhone);

  const chooseSchool = (schoolId: string) => {
    if (!schoolId) return;
    trackStorefrontEvent({ event: "select_school", schoolId });
    startTransition(() => router.push(`/uniformes?school=${schoolId}`));
  };

  return (
    <section
      id="escuelas"
      className="scroll-mt-24 border-y border-gloria-200 bg-[linear-gradient(180deg,#fff_0%,var(--color-gloria-50)_100%)] py-12 sm:py-16"
    >
      <div className="container mx-auto px-4">
        <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gloria-700">
              Uniformes por institución
            </p>
            <h2 className="mt-3 font-display text-3xl text-gloria-950 sm:text-5xl">
              Elegí tu escuela.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Tocá el nombre y vas directo a sus remeras y chombas. Después
              elegís el talle y continuás la compra.
            </p>
          </div>
          <Button variant="outline" className="w-fit rounded-full bg-white" asChild>
            <Link href="/uniformes">
              Ver tienda de uniformes
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="container mx-auto mb-5 px-4">
        <label className="flex max-w-xl flex-col gap-2 rounded-3xl border border-gloria-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
          <span className="flex shrink-0 items-center gap-2 px-2 text-sm font-extrabold text-gloria-900">
            <SlidersHorizontal className="size-3.5" />
            Elegí tu escuela
          </span>
          <select
            value=""
            onChange={(event) => chooseSchool(event.target.value)}
            disabled={isPending}
            className="min-h-14 min-w-0 flex-1 rounded-2xl border border-input bg-gloria-50 px-4 text-base font-bold text-gloria-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
          >
            <option value="">Seleccioná una escuela</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <span className="shrink-0 px-2 text-xs font-semibold text-muted-foreground" aria-live="polite">
            {isPending ? "Abriendo…" : "Se filtra al elegir"}
          </span>
        </label>
      </div>

      <div className={styles.viewport}>
        <div className={styles.track}>
          <div className={styles.group}>
            {schools.map((school) => (
              <SchoolCard
                key={`${school.name}-${school.level}`}
                school={school}
              />
            ))}
          </div>
          <div className={`${styles.group} ${styles.duplicate}`} aria-hidden="true">
            {schools.map((school) => (
              <SchoolCard
                key={`duplicate-${school.name}-${school.level}`}
                school={school}
                duplicate
              />
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto mt-7 flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          Las instituciones se mencionan únicamente para identificar el uniforme.
          Pilchería Gloria no representa ni mantiene afiliación oficial con ellas.
        </p>
        {whatsappUrl ? (
          <Button className="w-fit shrink-0 rounded-full" asChild>
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 size-4" />
              Consultar otra escuela
            </a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
