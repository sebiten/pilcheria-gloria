export type SchoolUniformFilter = {
  id: string;
  name: string;
  fullName: string;
  query: string;
};

export const SCHOOL_UNIFORM_FILTERS: SchoolUniformFilter[] = [
  { id: "311", name: "Escuela N.º 311", fullName: "Escuela N.º 311 Bernardino Rivadavia", query: "311" },
  { id: "normal", name: "Normal", fullName: "Escuela Normal Superior General San Martín", query: "Normal" },
  { id: "etha", name: "ETHA", fullName: "Colegio Técnico Marista Ing. Herminio Arrieta", query: "ETHA" },
  { id: "fasta", name: "FASTA", fullName: "Colegio FASTA Ing. José María Paz", query: "FASTA" },
  { id: "wollmann", name: "Enrique Wollmann", fullName: "Escuela N.º 3 Enrique Wollmann", query: "Wollmann" },
  { id: "lola-mora", name: "Artes · Lola Mora", fullName: "Escuela Provincial de Artes N.º 3 Lola Mora", query: "Lola Mora" },
  { id: "comercial-4", name: "Comercio N.º 4", fullName: "Escuela Provincial de Comercio N.º 4", query: "Comercial N° 4" },
  { id: "comercial-6", name: "Comercio N.º 6", fullName: "Escuela de Comercio N.º 6", query: "Comercial N° 6" },
  { id: "dorrego", name: "Dorrego", fullName: "Escuela N.º 112 Coronel Manuel Dorrego", query: "Dorrego" },
  { id: "bachillerato-7", name: "Bachillerato N.º 7 · Calilegua", fullName: "Bachillerato Provincial N.º 7 de Calilegua", query: "Calilegua" },
  { id: "cooperativa", name: "Cooperativa", fullName: "Escuela Cooperativa Libertad", query: "Cooperativa" },
  { id: "galan", name: "Galán", fullName: "Escuela N.º 213 Martín Raúl Galán", query: "Galán" },
  { id: "secundario-47", name: "Secundario N.º 47", fullName: "Colegio Secundario N.º 47", query: "Secundario N° 47" },
  { id: "agrotecnico", name: "Agrotécnica", fullName: "Colegio Secundario Agrotécnico", query: "Agrotécnico" },
  { id: "robotica", name: "Robótica", fullName: "Colegio Secundario de Robótica", query: "Robótica" },
  { id: "escuela-261", name: "Escuela 261", fullName: "Escuela N.º 261 Provincia de Tucumán", query: "261" },
  { id: "santibanez", name: "Mariano Santibáñez", fullName: "Escuela Coronel Mariano Santibáñez", query: "Santibáñez" },
  { id: "escuela-73", name: "Miguel E. Soler", fullName: "Escuela N.º 73 Miguel Estanislao Soler", query: "Miguel Estanislao Soler" },
];

function normalizeSchoolText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.º°]/g, "")
    .toLocaleLowerCase("es-AR");
}

export function getUniformDisplayName(productName: string) {
  const normalizedName = normalizeSchoolText(productName);
  const school = SCHOOL_UNIFORM_FILTERS.find((item) =>
    normalizedName.includes(normalizeSchoolText(item.query))
  );
  if (!school) return productName;

  const garment = /\bchomba\b/i.test(productName)
    ? "Chomba"
    : /\bremera\b/i.test(productName)
      ? "Remera"
      : "Uniforme";
  const level = /\bprimaria\b/i.test(productName)
    ? "Primaria"
    : /\bsecundaria\b/i.test(productName)
      ? "Secundaria"
      : null;

  return [garment, school.name, level].filter(Boolean).join(" · ");
}

export function getSchoolDisplayName(value: string) {
  const normalizedValue = normalizeSchoolText(value);
  const school = SCHOOL_UNIFORM_FILTERS.find(
    (item) =>
      normalizedValue.includes(normalizeSchoolText(item.query)) ||
      normalizedValue.includes(normalizeSchoolText(item.fullName))
  );

  return school?.name || value;
}
