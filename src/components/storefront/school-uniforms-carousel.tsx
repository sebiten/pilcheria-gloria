"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./school-uniforms-carousel.module.css";

type SchoolIdentity = {
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
    name: "Escuela N° 311 Bernardino Rivadavia",
    level: "Nivel primario",
    mark: "311",
    image: {
      src: "/images/uniforms/catalog/311-chomba.webp",
      alt: "Chomba completa de la Escuela N° 311",
    },
  },
  {
    name: "Escuela Normal Superior General San Martín",
    level: "Primaria y secundaria",
    mark: "ENS",
    image: {
      src: "/images/uniforms/catalog/normal-remera.webp",
      alt: "Remera completa de la Escuela Normal Superior",
    },
  },
  {
    name: "Colegio Técnico Marista Ing. Herminio Arrieta",
    level: "Nivel secundario",
    mark: "ETHA",
    image: {
      src: "/images/uniforms/catalog/etha-remera.webp",
      alt: "Remera completa del Colegio Técnico Marista ETHA",
    },
  },
  {
    name: "Colegio FASTA Ing. José María Paz",
    level: "Nivel primario y secundario",
    mark: "FASTA",
    image: {
      src: "/images/uniforms/catalog/fasta-remera.webp",
      alt: "Remera completa del Colegio FASTA",
    },
  },
  {
    name: "Escuela N° 3 Enrique Wollmann",
    level: "Nivel primario",
    mark: "N° 3",
    image: {
      src: "/images/uniforms/catalog/wallman-remera.webp",
      alt: "Remera completa de la Escuela Enrique Wollmann",
    },
  },
  {
    name: "Escuela Provincial de Artes N° 3 Lola Mora",
    level: "Nivel secundario",
    mark: "ARTES",
    image: {
      src: "/images/uniforms/catalog/lola-mora-escuela-de-artes-remera.webp",
      alt: "Remera completa de la Escuela Provincial de Artes Lola Mora",
    },
  },
  {
    name: "Escuela Provincial de Comercio N° 4",
    level: "25 de Febrero · Secundaria",
    mark: "COM 4",
    image: {
      src: "/images/uniforms/catalog/comercial-4-remera.webp",
      alt: "Remera completa de la Escuela Provincial de Comercio N° 4",
    },
  },
  {
    name: "Escuela de Comercio N° 6",
    level: "Nivel secundario",
    mark: "COM 6",
    image: {
      src: "/images/uniforms/catalog/comercial-6-chomba.webp",
      alt: "Chomba completa de la Escuela de Comercio N° 6",
    },
  },
  {
    name: "Escuela N° 112 Coronel Manuel Dorrego",
    level: "Nivel primario",
    mark: "112",
    image: {
      src: "/images/uniforms/catalog/dorrego-chomba.webp",
      alt: "Chomba completa de la Escuela Coronel Manuel Dorrego",
    },
  },
  {
    name: "Bachillerato Provincial N° 7 de Calilegua",
    level: "Nivel secundario",
    mark: "BACH 7",
    image: {
      src: "/images/uniforms/catalog/bachillerato-calilegua-remera.webp",
      alt: "Remera completa del Bachillerato Provincial N° 7 de Calilegua",
    },
  },
  {
    name: "Escuela Cooperativa Libertad",
    level: "Nivel primario",
    mark: "COOP",
    image: {
      src: "/images/uniforms/catalog/coperativa-chomba.webp",
      alt: "Chomba completa de la Escuela Cooperativa Libertad",
    },
  },
  {
    name: "Escuela N° 213 Martín Raúl Galán",
    level: "Nivel primario",
    mark: "213",
    image: {
      src: "/images/uniforms/catalog/galan-remera.webp",
      alt: "Remera completa de la Escuela Martín Raúl Galán",
    },
  },
  {
    name: "Colegio Secundario N° 47",
    level: "Nivel secundario",
    mark: "47",
    image: {
      src: "/images/uniforms/catalog/secundario-47-remera.webp",
      alt: "Remera del Colegio Secundario N° 47",
    },
  },
  {
    name: "Colegio Secundario Agrotécnico",
    level: "Nivel secundario",
    mark: "AGRO",
    image: {
      src: "/images/uniforms/catalog/agrotecnica-remera.webp",
      alt: "Remera del Colegio Secundario Agrotécnico",
    },
  },
  {
    name: "Colegio Secundario de Robótica",
    level: "Nivel secundario",
    mark: "ROBÓTICA",
    image: {
      src: "/images/uniforms/catalog/robotica-remera.webp",
      alt: "Remera del Colegio Secundario de Robótica",
    },
  },
  {
    name: "Escuela N° 261 Provincia de Tucumán",
    level: "Nivel primario",
    mark: "261",
    image: {
      src: "/images/uniforms/catalog/escuela-261-remera.webp",
      alt: "Remera de la Escuela N° 261 Provincia de Tucumán",
    },
  },
  {
    name: "Escuela Coronel Mariano Santibáñez",
    level: "Nivel primario",
    mark: "SANTIBÁÑEZ",
    image: {
      src: "/images/uniforms/catalog/coronel-mariano-santibanez-chomba.webp",
      alt: "Chomba de la Escuela Coronel Mariano Santibáñez",
    },
  },
  {
    name: "Escuela N° 73 Miguel Estanislao Soler",
    level: "Nivel primario",
    mark: "73",
    image: {
      src: "/images/uniforms/catalog/escuela-73-soler-chomba.webp",
      alt: "Chomba de la Escuela N° 73 Miguel Estanislao Soler",
    },
  },
];

const schoolSearchTerms: Record<string, string> = {
  "311": "311",
  ENS: "Normal",
  ETHA: "ETHA",
  FASTA: "FASTA",
  "N° 3": "Wollmann",
  ARTES: "Lola Mora",
  "COM 4": "Comercio N° 4",
  "COM 6": "Comercio N° 6",
  "112": "Dorrego",
  "BACH 7": "Calilegua",
  COOP: "Cooperativa",
  "213": "Galán",
  "47": "Secundario N° 47",
  AGRO: "Agrotécnico",
  ROBÓTICA: "Robótica",
  "261": "261",
  SANTIBÁÑEZ: "Santibáñez",
  "73": "Miguel Estanislao Soler",
};

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
  const query = schoolSearchTerms[school.mark] ?? school.name;
  const productUrl = `/products?category=uniformes-escolares&q=${encodeURIComponent(query)}`;
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
        <span className="line-clamp-2 text-sm font-extrabold leading-5 text-gloria-950">
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
  const [selectedMark, setSelectedMark] = useState("");
  const whatsappUrl = getWhatsappUrl(whatsappPhone);
  const visibleSchools = selectedMark
    ? schools.filter((school) => school.mark === selectedMark)
    : schools;

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
              Buscá tu escuela en Ledesma.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Indicá institución, nivel, prenda y talle. Confirmamos el modelo y
              el stock antes de preparar tu pedido.
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
          <span className="flex shrink-0 items-center gap-2 px-2 text-xs font-bold uppercase tracking-[0.12em] text-gloria-700">
            <SlidersHorizontal className="size-3.5" />
            Filtrar escuela
          </span>
          <select
            value={selectedMark}
            onChange={(event) => setSelectedMark(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-2xl border border-input bg-gloria-50 px-4 text-sm font-bold text-gloria-950 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="">Todas las instituciones</option>
            {schools.map((school) => (
              <option key={school.mark} value={school.mark}>
                {school.name}
              </option>
            ))}
          </select>
          <span className="shrink-0 px-2 text-xs font-semibold text-muted-foreground">
            {visibleSchools.length} {visibleSchools.length === 1 ? "resultado" : "resultados"}
          </span>
        </label>
      </div>

      <div
        className={`${styles.viewport} ${selectedMark ? styles.filteredViewport : ""}`}
      >
        <div
          className={`${styles.track} ${selectedMark ? styles.filteredTrack : ""}`}
        >
          <div className={styles.group}>
            {visibleSchools.map((school) => (
              <SchoolCard
                key={`${school.name}-${school.level}`}
                school={school}
              />
            ))}
          </div>
          {!selectedMark ? (
            <div
              className={`${styles.group} ${styles.duplicate}`}
              aria-hidden="true"
            >
              {visibleSchools.map((school) => (
                <SchoolCard
                  key={`duplicate-${school.name}-${school.level}`}
                  school={school}
                  duplicate
                />
              ))}
            </div>
          ) : null}
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
