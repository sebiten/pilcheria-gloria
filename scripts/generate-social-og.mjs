import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const width = 1200;
const height = 630;

const asset = (relativePath) => path.join(projectRoot, "public", relativePath);

async function garment(relativePath, targetHeight) {
  return sharp(asset(relativePath))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ height: targetHeight, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}

const [backgroundPhoto, dorrego, etha, normal] = await Promise.all([
  sharp(asset("social/og/textile-bg-mobile-safe.webp"))
    .resize(width, height, { fit: "cover" })
    .png()
    .toBuffer(),
  garment("images/uniforms/catalog/dorrego-chomba-hero.webp", 400),
  garment("images/uniforms/catalog/etha-remera-hero.webp", 280),
  garment("images/uniforms/catalog/normal-remera-hero.webp", 270),
]);

const logoSource = await readFile(asset("gloria-logo.svg"), "utf8");
const lightLogo = Buffer.from(
  logoSource.replaceAll("#15210c", "#f8fcf2"),
  "utf8"
);
const logo = await sharp(lightLogo).resize({ width: 220 }).png().toBuffer();

const artDirection = Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="copyShade" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#0c1a05" stop-opacity="0.62"/>
        <stop offset="0.48" stop-color="#0c1a05" stop-opacity="0.36"/>
        <stop offset="0.64" stop-color="#0c1a05" stop-opacity="0"/>
      </linearGradient>
      <filter id="garmentShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="11"/>
      </filter>
    </defs>

    <rect width="1200" height="630" fill="url(#copyShade)"/>

    <text x="90" y="178" fill="#f8fcf2" font-family="Arial Black, Arial, sans-serif" font-size="48" font-weight="900" letter-spacing="-1.5">ENCONTRÁ EL</text>
    <text x="86" y="274" fill="#a7cc0a" font-family="Arial Black, Arial, sans-serif" font-size="90" font-weight="900" letter-spacing="-4">UNIFORME</text>
    <text x="88" y="352" fill="#f8fcf2" font-family="Arial Black, Arial, sans-serif" font-size="62" font-weight="900" letter-spacing="-2.5">DE TU ESCUELA</text>
    <text x="92" y="399" fill="#e8f0df" font-family="Arial, sans-serif" font-size="25" font-weight="700">Elegí escuela, prenda y talle desde el celular.</text>

    <g transform="translate(88 430)">
      <rect width="474" height="72" rx="18" fill="#f8fcf2"/>
      <text x="28" y="47" fill="#10230f" font-family="Arial Black, Arial, sans-serif" font-size="25" font-weight="900" letter-spacing="-0.4">TOCÁ PARA VER UNIFORMES</text>
      <path d="M425 36H445M437 27L446 36L437 45" fill="none" stroke="#10230f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <g transform="translate(90 542)">
      <circle cx="15" cy="15" r="15" fill="#a7cc0a"/>
      <path d="M8 15L13 20L22 10" fill="none" stroke="#10230f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="44" y="23" fill="#f8fcf2" font-family="Arial, sans-serif" font-size="21" font-weight="700">Mercado Pago · sin registrarte</text>
    </g>

    <ellipse cx="850" cy="577" rx="155" ry="22" fill="#0c1a05" fill-opacity="0.22" filter="url(#garmentShadow)"/>
    <ellipse cx="1034" cy="578" rx="130" ry="20" fill="#0c1a05" fill-opacity="0.2" filter="url(#garmentShadow)"/>
    <ellipse cx="947" cy="486" rx="170" ry="27" fill="#0c1a05" fill-opacity="0.24" filter="url(#garmentShadow)"/>
  </svg>
`);

const output = await sharp(backgroundPhoto)
  .composite([
    { input: artDirection, left: 0, top: 0 },
    { input: logo, left: 90, top: 48 },
    { input: etha, left: 625, top: 315 },
    { input: normal, left: 880, top: 326 },
    { input: dorrego, left: 770, top: 77 },
  ])
  .jpeg({ quality: 91, chromaSubsampling: "4:4:4", mozjpeg: true })
  .toBuffer();

const outputPath = asset("social/og/uniformes-mobile-facebook-2026.jpg");
await writeFile(outputPath, output);
console.log(`OG móvil generado: ${outputPath}`);
