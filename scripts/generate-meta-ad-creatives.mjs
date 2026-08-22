import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputDir = path.join(root, "public", "social", "meta-ads");
const productSources = [
  path.join(root, "public", "images", "uniforms", "catalog", "dorrego-chomba-hero.webp"),
  path.join(root, "public", "images", "uniforms", "catalog", "etha-remera-hero.webp"),
  path.join(root, "public", "images", "uniforms", "catalog", "normal-remera-hero.webp"),
];

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[character]);
}

async function prepareLogo(width) {
  const source = await readFile(path.join(root, "public", "gloria-logo.svg"), "utf8");
  const whiteLogo = source
    .replaceAll("#15210c", "#ffffff")
    .replaceAll("#a8d829", "#b7ea20");
  return sharp(Buffer.from(whiteLogo)).resize({ width }).png().toBuffer();
}

async function prepareProduct(source, width, height) {
  return sharp(source)
    .resize({
      width,
      height,
      fit: "contain",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function backgroundSvg({ width, height, story }) {
  const headlineSize = story ? 102 : 82;
  const headlineY = story ? 390 : 255;
  const subtitleY = story ? 690 : 455;
  const pricesY = story ? 785 : 560;
  const productTop = story ? 860 : 645;
  const footerTop = story ? 1480 : height - 180;
  const title = story
    ? ["EL UNIFORME", "DE SU ESCUELA,", "EN POCOS PASOS"]
    : ["EL UNIFORME DE", "SU ESCUELA"];

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#071d09"/>
      <circle cx="${width - 20}" cy="${story ? 690 : 450}" r="${story ? 490 : 360}" fill="#9ed20c" opacity=".2"/>
      <path d="M0 ${productTop + 230} C ${width * 0.3} ${productTop + 80}, ${width * 0.64} ${productTop + 330}, ${width} ${productTop + 130} L ${width} ${footerTop} L0 ${footerTop}Z" fill="#9ed20c"/>
      <text x="64" y="${story ? 280 : 168}" fill="#b7ea20" font-family="Arial, sans-serif" font-size="28" font-weight="800" letter-spacing="5">UNIFORMES ESCOLARES · LEDESMA</text>
      ${title.map((line, index) => `<text x="64" y="${headlineY + index * (headlineSize * 0.94)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${headlineSize}" font-weight="900" letter-spacing="-3">${escapeXml(line)}</text>`).join("")}
      <text x="64" y="${subtitleY}" fill="#dce8d5" font-family="Arial, sans-serif" font-size="34" font-weight="600">Elegí escuela, prenda y talle.</text>
      <rect x="64" y="${pricesY}" width="${story ? 760 : 620}" height="76" rx="38" fill="#ffffff"/>
      <text x="${story ? 444 : 374}" y="${pricesY + 50}" text-anchor="middle" fill="#071d09" font-family="Arial, sans-serif" font-size="30" font-weight="900">Remeras $28.000  ·  Chombas $32.000</text>
      <text x="64" y="${footerTop + (story ? 52 : 52)}" fill="#b7ea20" font-family="Arial, sans-serif" font-size="${story ? 32 : 25}" font-weight="900">PAGO CON TARJETA POR MERCADO PAGO</text>
      <text x="64" y="${footerTop + (story ? 102 : 92)}" fill="#dce8d5" font-family="Arial, sans-serif" font-size="${story ? 28 : 23}" font-weight="700">Envío gratis desde 2 prendas · Compra sin registrarte</text>
      <rect x="64" y="${footerTop + (story ? 140 : 116)}" width="${width - 128}" height="${story ? 80 : 58}" rx="${story ? 40 : 29}" fill="#071d09"/>
      <text x="${width / 2}" y="${footerTop + (story ? 194 : 155)}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="${story ? 30 : 23}" font-weight="900" letter-spacing="1">TOCÁ COMPRAR Y ELEGÍ TU ESCUELA  ›</text>
    </svg>
  `);
}

async function generateCreative({ filename, width, height, story }) {
  const productWidth = story ? 330 : 330;
  const productHeight = story ? 540 : 540;
  const productTop = story ? 900 : 665;
  const preparedProducts = await Promise.all(
    productSources.map((source) => prepareProduct(source, productWidth, productHeight))
  );
  const positions = story
    ? [
        { left: 0, top: productTop + 50 },
        { left: 375, top: productTop },
        { left: 750, top: productTop + 50 },
      ]
    : [
        { left: -10, top: productTop + 45 },
        { left: 375, top: productTop - 5 },
        { left: 745, top: productTop + 55 },
      ];

  await sharp(backgroundSvg({ width, height, story }))
    .composite([
      { input: await prepareLogo(story ? 290 : 245), left: 64, top: story ? 110 : 45 },
      ...preparedProducts.map((input, index) => ({ input, ...positions[index] })),
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(path.join(outputDir, filename));
}

await mkdir(outputDir, { recursive: true });
await Promise.all([
  generateCreative({
    filename: "uniformes-meta-feed-4x5.jpg",
    width: 1080,
    height: 1350,
    story: false,
  }),
  generateCreative({
    filename: "uniformes-meta-story-9x16.jpg",
    width: 1080,
    height: 1920,
    story: true,
  }),
]);

console.log(`Creatividades guardadas en ${outputDir}`);
