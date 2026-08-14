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

const [dorrego, etha, normal] = await Promise.all([
  garment("images/uniforms/catalog/dorrego-chomba-hero.webp", 430),
  garment("images/uniforms/catalog/etha-remera-hero.webp", 315),
  garment("images/uniforms/catalog/normal-remera-hero.webp", 305),
]);

const logoSource = await readFile(asset("gloria-logo.svg"), "utf8");
const lightLogo = Buffer.from(
  logoSource.replaceAll("#15210c", "#f7faef"),
  "utf8"
);

const background = Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 1H8M1 0V8" stroke="#f7faef" stroke-opacity="0.025" stroke-width="1"/>
      </pattern>
      <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="16" stdDeviation="13" flood-color="#071006" flood-opacity="0.34"/>
      </filter>
    </defs>

    <rect width="1200" height="630" fill="#10230f"/>
    <rect width="1200" height="630" fill="url(#weave)"/>
    <path d="M754 -68C962 -40 1172 31 1260 180V686H716C652 558 658 403 724 286C781 183 822 73 754 -68Z" fill="#a8d829"/>
    <path d="M695 0C765 123 731 221 686 306C629 416 635 533 697 630" fill="none" stroke="#d9ef8c" stroke-width="3" stroke-dasharray="9 14" opacity="0.65"/>
    <path d="M1048 36C1130 126 1168 224 1152 331" fill="none" stroke="#628d16" stroke-width="3" stroke-dasharray="8 14" opacity="0.52"/>

    <text x="62" y="222" fill="#f7faef" font-family="Arial, sans-serif" font-size="74" font-weight="900" letter-spacing="-3">UNIFORMES</text>
    <text x="58" y="318" fill="#a8d829" font-family="Arial, sans-serif" font-size="92" font-weight="900" letter-spacing="-5">ESCOLARES</text>
    <text x="63" y="370" fill="#dfe9d6" font-family="Arial, sans-serif" font-size="27" font-weight="600">Elegí escuela, prenda y talle.</text>

    <g transform="translate(58 421)">
      <rect width="390" height="76" rx="38" fill="#f7faef"/>
      <text x="32" y="50" fill="#10230f" font-family="Arial, sans-serif" font-size="30" font-weight="900">TOCÁ LA IMAGEN</text>
      <path d="M342 38H365M355 27L366 38L355 49" fill="none" stroke="#10230f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <g transform="translate(62 535)">
      <circle cx="15" cy="15" r="15" fill="#a8d829"/>
      <path d="M8 15L13 20L22 10" fill="none" stroke="#10230f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="44" y="23" fill="#f7faef" font-family="Arial, sans-serif" font-size="23" font-weight="700">Envío gratis desde 2 prendas</text>
    </g>

    <g filter="url(#softShadow)">
      <rect x="716" y="58" width="434" height="506" rx="210" fill="#80b51c" opacity="0.36"/>
    </g>
  </svg>
`);

const logo = await sharp(lightLogo).resize({ width: 246 }).png().toBuffer();

const output = await sharp(background)
  .composite([
    { input: logo, left: 62, top: 48 },
    { input: etha, left: 662, top: 285 },
    { input: normal, left: 978, top: 300 },
    { input: dorrego, left: 824, top: 78 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

const outputPath = asset("social/og/uniformes-escolares-click-2026.png");
await writeFile(outputPath, output);
console.log(`OG generado: ${outputPath}`);
