import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 1500;
const DETECTION_WIDTH = 468;

const FILES: Record<string, string> = {
  "chomba azul etha.png": "etha-chomba-azul.webp",
  "chomba bachillerato n7 calilegua.png":
    "bachillerato-calilegua-chomba.webp",
  "chomba colegio de artes lola mora.png":
    "lola-mora-escuela-de-arte-chomba.webp",
  "chomba colegio secundario 47.png": "secundario-47-chomba.webp",
  "chomba colegio secundario agrotecnica.png": "agrotecnica-chomba.webp",
  "chomba colegio secundario robotica.png": "robotica-chomba.webp",
  "chomba comercial 4.png": "comercial-4-chomba.webp",
  "chomba comercial 6.png": "comercial-6-chomba.webp",
  "chomba dorrego.png": "dorrego-chomba.webp",
  "chomba escuela 261.png": "escuela-261-chomba.webp",
  "chomba escuela 311.png": "311-chomba.webp",
  "chomba escuela coperativa.png": "coperativa-chomba.webp",
  "chomba escuela coronel mariano santibañez.png":
    "coronel-mariano-santibanez-chomba.webp",
  "Chomba Escuela Martín Raúl Galán.png": "galan-chomba.webp",
  "chomba escuela n73 miguel estanislao soler.png":
    "escuela-73-soler-chomba.webp",
  "chomba escuela wallman.png": "wallman-chomba.webp",
  "chomba fasta.png": "fasta-chomba.webp",
  "chomba normal.png": "normal-chomba.webp",
  "remera bachillerato n7 calilegua.png":
    "bachillerato-calilegua-remera.webp",
  "remera colegio comercial 4.png": "comercial-4-remera.webp",
  "remera colegio de artes lola mora.png":
    "lola-mora-escuela-de-artes-remera.webp",
  "Remera colegio robotica.png": "robotica-remera.webp",
  "Remera colegio secundario agrotecnica.png": "agrotecnica-remera.webp",
  "remera colegio secundario n 47.png": "secundario-47-remera.webp",
  "Remera escuela 261.png": "escuela-261-remera.webp",
  "remera escuela coperativa.png": "coperativa-remera.webp",
  "remera escuela martin raul galan.png": "galan-remera.webp",
  "remera escuela wallman.png": "wallman-remera.webp",
  "remera ETHA.png": "etha-remera.webp",
  "remera fasta.png": "fasta-remera.webp",
  "remera normal.png": "normal-remera.webp",
};

const CROP_OVERRIDES: Record<
  string,
  { left: number; top: number; width: number; height: number }
> = {};

const HERO_IMAGES: Record<string, string> = {
  "chomba dorrego.png": "dorrego-chomba-hero.webp",
  "remera ETHA.png": "etha-remera-hero.webp",
  "remera normal.png": "normal-remera-hero.webp",
};

function getArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function percentile(values: number[], ratio: number) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0;
}

async function detectGarmentBounds(input: string) {
  const image = sharp(input).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`No se pudieron leer las dimensiones de ${input}`);
  }

  const detectionHeight = Math.round(
    (metadata.height / metadata.width) * DETECTION_WIDTH
  );
  const { data, info } = await image
    .clone()
    .resize(DETECTION_WIDTH, detectionHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const foregroundByColumn = Array.from({ length: info.width }, () => 0);
  const foregroundByRow = Array.from({ length: info.height }, () => 0);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

      if (luminance > 58 || (luminance > 42 && chroma > 28)) {
        foregroundByColumn[x] += 1;
        foregroundByRow[y] += 1;
      }
    }
  }

  const xs = foregroundByColumn
    .map((count, x) => ({ count, x }))
    .filter(({ count }) => count > info.height * 0.06)
    .map(({ x }) => x);
  const ys = foregroundByRow
    .map((count, y) => ({ count, y }))
    .filter(({ count }) => count > info.width * 0.08)
    .map(({ y }) => y);

  if (xs.length < info.width * 0.1 || ys.length < info.height * 0.1) {
    throw new Error(`No se pudo detectar la prenda en ${input}`);
  }

  const scaleX = metadata.width / info.width;
  const scaleY = metadata.height / info.height;
  const left = percentile(xs, 0.002) * scaleX;
  const right = percentile(xs, 0.998) * scaleX;
  const top = percentile(ys, 0.002) * scaleY;
  const bottom = percentile(ys, 0.998) * scaleY;
  const garmentWidth = right - left;
  const garmentHeight = bottom - top;

  let cropWidth = garmentWidth * 1.12;
  let cropHeight = garmentHeight * 1.16;
  const targetRatio = OUTPUT_WIDTH / OUTPUT_HEIGHT;

  if (cropWidth / cropHeight > targetRatio) {
    cropHeight = cropWidth / targetRatio;
  } else {
    cropWidth = cropHeight * targetRatio;
  }

  const fitScale = Math.min(
    1,
    metadata.width / cropWidth,
    metadata.height / cropHeight
  );
  cropWidth *= fitScale;
  cropHeight *= fitScale;

  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const cropLeft = Math.max(
    0,
    Math.min(metadata.width - cropWidth, centerX - cropWidth / 2)
  );
  const cropTop = Math.max(
    0,
    Math.min(metadata.height - cropHeight, centerY - cropHeight / 2)
  );

  return {
    left: Math.round(cropLeft),
    top: Math.round(cropTop),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight),
  };
}

async function processImage(input: string, output: string) {
  const bounds =
    CROP_OVERRIDES[path.basename(input)] ?? (await detectGarmentBounds(input));

  await sharp(input)
    .rotate()
    .extract(bounds)
    .modulate({ brightness: 1.035, saturation: 0.97 })
    .linear(1.025, -2)
    .sharpen({ sigma: 0.7, m1: 0.7, m2: 1.4 })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: 88, effort: 5, smartSubsample: true })
    .toFile(output);

  return bounds;
}

async function processHeroImage(input: string, output: string) {
  const image = sharp(input).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const brightest = Math.max(red, green, blue);
    data[offset + 3] = Math.max(0, Math.min(255, (brightest - 10) * 12));
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize(1122, 1402, { fit: "contain" })
    .webp({ quality: 90, effort: 5 })
    .toFile(output);
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

async function createContactSheet(directory: string, output: string) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".webp"))
    .toSorted();
  const cellWidth = 260;
  const cellHeight = 355;
  const columns = 4;
  const rows = Math.ceil(files.length / columns);
  const layers: OverlayOptions[] = [];

  for (const [index, file] of files.entries()) {
    const left = (index % columns) * cellWidth + 10;
    const top = Math.floor(index / columns) * cellHeight + 10;
    const thumbnail = await sharp(path.join(directory, file))
      .resize(240, 300, { fit: "contain", background: "#f3f1e9" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const label = Buffer.from(
      `<svg width="240" height="35">
        <rect width="240" height="35" fill="#fff"/>
        <text x="8" y="22" font-family="Arial" font-size="12" fill="#17210f">
          ${escapeXml(file.replace(".webp", ""))}
        </text>
      </svg>`
    );

    layers.push(
      { input: thumbnail, left, top },
      { input: label, left, top: top + 300 }
    );
  }

  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 3,
      background: "#d9dccf",
    },
  })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toFile(output);
}

async function main() {
  const inputDirectory = getArgument("--input");
  const contactSheet = getArgument("--contact-sheet");
  const outputDirectory =
    getArgument("--output") ??
    path.join(process.cwd(), "public", "images", "uniforms", "catalog");

  if (!inputDirectory) {
    throw new Error(
      "Indicá la carpeta fuente con --input <ruta>. Opcional: --output <ruta>."
    );
  }

  await mkdir(outputDirectory, { recursive: true });

  for (const [sourceName, outputName] of Object.entries(FILES)) {
    const input = path.join(inputDirectory, sourceName);
    const output = path.join(outputDirectory, outputName);
    const bounds = await processImage(input, output);
    console.log(`${sourceName} -> ${outputName}`, bounds);
  }

  for (const [sourceName, outputName] of Object.entries(HERO_IMAGES)) {
    await processHeroImage(
      path.join(inputDirectory, sourceName),
      path.join(outputDirectory, outputName)
    );
    console.log(`${sourceName} -> ${outputName}`);
  }

  if (contactSheet) {
    await createContactSheet(outputDirectory, contactSheet);
    console.log(`Plancha comparativa -> ${contactSheet}`);
  }
}

await main();
