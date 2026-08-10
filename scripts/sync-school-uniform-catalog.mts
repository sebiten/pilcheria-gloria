import { createClient } from "@supabase/supabase-js";

type Garment = "Remera" | "Chomba";

type NewUniform = {
  garment: Garment;
  institution: string;
  name: string;
  slug: string;
  color: string;
};

const NEW_UNIFORMS: NewUniform[] = [
  {
    garment: "Chomba",
    institution: "Escuela Provincial de Comercio N° 4",
    name: "Chomba Escuela Comercial N° 4",
    slug: "chomba-escuela-comercial-4",
    color: "Blanco con detalles azul marino",
  },
  {
    garment: "Chomba",
    institution: "Escuela N° 213 Martín Raúl Galán",
    name: "Chomba Escuela Martín Raúl Galán",
    slug: "chomba-escuela-martin-raul-galan",
    color: "Blanco con detalles azul marino",
  },
  {
    garment: "Remera",
    institution: "Escuela Cooperativa Libertad",
    name: "Remera Escuela Cooperativa Libertad",
    slug: "remera-escuela-cooperativa-libertad",
    color: "Blanco con estampa verde",
  },
  {
    garment: "Chomba",
    institution: "Colegio Secundario N° 47",
    name: "Chomba Colegio Secundario N° 47",
    slug: "chomba-colegio-secundario-47",
    color: "Blanco con detalles azul marino y rojo",
  },
  {
    garment: "Remera",
    institution: "Colegio Secundario N° 47",
    name: "Remera Colegio Secundario N° 47",
    slug: "remera-colegio-secundario-47",
    color: "Gris claro con detalles azul marino y rojo",
  },
  {
    garment: "Chomba",
    institution: "Colegio Secundario Agrotécnico",
    name: "Chomba Colegio Secundario Agrotécnico",
    slug: "chomba-colegio-secundario-agrotecnico",
    color: "Blanco con detalles verde",
  },
  {
    garment: "Remera",
    institution: "Colegio Secundario Agrotécnico",
    name: "Remera Colegio Secundario Agrotécnico",
    slug: "remera-colegio-secundario-agrotecnico",
    color: "Blanco con detalles verde",
  },
  {
    garment: "Chomba",
    institution: "Colegio Secundario de Robótica",
    name: "Chomba Colegio Secundario de Robótica",
    slug: "chomba-colegio-secundario-robotica",
    color: "Azul con detalles blanco",
  },
  {
    garment: "Remera",
    institution: "Colegio Secundario de Robótica",
    name: "Remera Colegio Secundario de Robótica",
    slug: "remera-colegio-secundario-robotica",
    color: "Blanco con detalles azul",
  },
  {
    garment: "Chomba",
    institution: "Escuela N° 261 Provincia de Tucumán",
    name: "Chomba Escuela N° 261 Provincia de Tucumán",
    slug: "chomba-escuela-261-provincia-tucuman",
    color: "Blanco con detalles azul marino",
  },
  {
    garment: "Remera",
    institution: "Escuela N° 261 Provincia de Tucumán",
    name: "Remera Escuela N° 261 Provincia de Tucumán",
    slug: "remera-escuela-261-provincia-tucuman",
    color: "Blanco con estampa celeste y azul",
  },
  {
    garment: "Chomba",
    institution: "Escuela Coronel Mariano Santibáñez",
    name: "Chomba Escuela Coronel Mariano Santibáñez",
    slug: "chomba-escuela-coronel-mariano-santibanez",
    color: "Blanco con detalles celeste",
  },
  {
    garment: "Chomba",
    institution: "Escuela N° 73 Miguel Estanislao Soler",
    name: "Chomba Escuela N° 73 Miguel Estanislao Soler",
    slug: "chomba-escuela-73-miguel-estanislao-soler",
    color: "Blanco con detalles azul marino y naranja",
  },
];

const SIZES = [
  { sizeSystem: "infant", size: "8" },
  { sizeSystem: "infant", size: "10" },
  { sizeSystem: "infant", size: "12" },
  { sizeSystem: "infant", size: "14" },
  { sizeSystem: "infant", size: "16" },
  { sizeSystem: "adult", size: "1" },
  { sizeSystem: "adult", size: "2" },
  { sizeSystem: "adult", size: "3" },
  { sizeSystem: "adult", size: "4" },
  { sizeSystem: "adult", size: "5" },
] as const;

function getPartnerPrice(garment: Garment, sizeSystem: string, size: string) {
  if (garment === "Remera") {
    if (sizeSystem === "infant") return ["8", "10"].includes(size) ? 24500 : 26000;
    return size === "5" ? 28000 : 27000;
  }

  if (sizeSystem === "infant") return ["8", "10"].includes(size) ? 28500 : 29000;
  return size === "5" ? 32000 : 31000;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureOffer(
  variantId: string,
  sourceId: string,
  values: {
    availability_mode: "finite" | "on_demand";
    sale_price: number;
    stock_quantity: number | null;
    priority: number;
    lead_time_min_hours: number;
    lead_time_max_hours: number;
  }
) {
  const { data: existing, error: selectError } = await supabase
    .from("variant_offers")
    .select("id")
    .eq("variant_id", variantId)
    .eq("source_id", sourceId)
    .eq("active", true)
    .maybeSingle();

  if (selectError) throw selectError;

  const payload = { ...values, active: true };
  const query = existing
    ? supabase.from("variant_offers").update(payload).eq("id", existing.id)
    : supabase.from("variant_offers").insert({
        variant_id: variantId,
        source_id: sourceId,
        ...payload,
      });
  const { error } = await query;
  if (error) throw error;
}

const { data: category, error: categoryError } = await supabase
  .from("categories")
  .select("id")
  .eq("slug", "uniformes-escolares")
  .single();
if (categoryError) throw categoryError;

const { data: sources, error: sourcesError } = await supabase
  .from("inventory_sources")
  .select("id, code")
  .in("code", ["own", "grandma_store"]);
if (sourcesError) throw sourcesError;

const ownSourceId = sources.find((source) => source.code === "own")?.id;
const partnerSourceId = sources.find((source) => source.code === "grandma_store")?.id;
if (!ownSourceId || !partnerSourceId) throw new Error("Faltan los orígenes de inventario.");

for (const uniform of NEW_UNIFORMS) {
  const basePrice = getPartnerPrice(uniform.garment, "infant", "8");
  const { data: product, error: productError } = await supabase
    .from("products")
    .upsert(
      {
        name: uniform.name,
        slug: uniform.slug,
        description: `${uniform.garment} escolar para ${uniform.institution}, disponible por encargo en talles juveniles y adultos.`,
        base_price: basePrice,
        category_id: category.id,
        featured: false,
        active: true,
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (productError) throw productError;

  for (const option of SIZES) {
    const partnerPrice = getPartnerPrice(uniform.garment, option.sizeSystem, option.size);
    const { data: existingVariant, error: variantSelectError } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", product.id)
      .eq("size_system", option.sizeSystem)
      .eq("size", option.size)
      .is("school_level", null)
      .maybeSingle();
    if (variantSelectError) throw variantSelectError;

    let variantId = existingVariant?.id;
    if (variantId) {
      const { error } = await supabase
        .from("product_variants")
        .update({ color: uniform.color, price_override: partnerPrice, active: true })
        .eq("id", variantId);
      if (error) throw error;
    } else {
      const { data: insertedVariant, error } = await supabase
        .from("product_variants")
        .insert({
          product_id: product.id,
          size: option.size,
          size_system: option.sizeSystem,
          school_level: null,
          color: uniform.color,
          price_override: partnerPrice,
          stock: 0,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      variantId = insertedVariant.id;
    }

    await ensureOffer(variantId, ownSourceId, {
      availability_mode: "finite",
      sale_price: 20000,
      stock_quantity: 0,
      priority: 10,
      lead_time_min_hours: 0,
      lead_time_max_hours: 0,
    });
    await ensureOffer(variantId, partnerSourceId, {
      availability_mode: "on_demand",
      sale_price: partnerPrice,
      stock_quantity: null,
      priority: 20,
      lead_time_min_hours: 24,
      lead_time_max_hours: 48,
    });
  }

  console.log(`${uniform.slug}: 10 talles sincronizados`);
}
