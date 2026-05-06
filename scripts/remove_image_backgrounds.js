#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT_DIR = path.join(ROOT, "public", "racket-images");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "public", "racket-images-bg-removed");
const IMAGE_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_INPUT_DIR,
    outDir: DEFAULT_OUTPUT_DIR,
    files: [],
    extensions: null,
    limit: null,
    apply: false,
    overwrite: false,
    force: false,
    threshold: 28,
    softThreshold: 52,
    minBackgroundLightness: 232,
    maxBackgroundSaturation: 34,
    edgeSample: 18,
    feather: 1,
    protectForegroundRadius: 8,
    protectMinDistance: 8,
    quality: 92,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--dir") args.dir = path.resolve(readValue());
    else if (arg === "--out-dir") args.outDir = path.resolve(readValue());
    else if (arg === "--file") args.files.push(readValue());
    else if (arg === "--ext") {
      const raw = readValue();
      args.extensions = raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => (value.startsWith(".") ? value : `.${value}`));
    }
    else if (arg === "--limit") args.limit = Number.parseInt(readValue(), 10);
    else if (arg === "--threshold") args.threshold = Number.parseFloat(readValue());
    else if (arg === "--soft-threshold") args.softThreshold = Number.parseFloat(readValue());
    else if (arg === "--min-background-lightness") args.minBackgroundLightness = Number.parseFloat(readValue());
    else if (arg === "--max-background-saturation") args.maxBackgroundSaturation = Number.parseFloat(readValue());
    else if (arg === "--edge-sample") args.edgeSample = Number.parseInt(readValue(), 10);
    else if (arg === "--feather") args.feather = Number.parseInt(readValue(), 10);
    else if (arg === "--protect-foreground-radius") args.protectForegroundRadius = Number.parseInt(readValue(), 10);
    else if (arg === "--protect-min-distance") args.protectMinDistance = Number.parseFloat(readValue());
    else if (arg === "--quality") args.quality = Number.parseInt(readValue(), 10);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--overwrite") args.overwrite = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.softThreshold < args.threshold) {
    throw new Error("--soft-threshold must be greater than or equal to --threshold");
  }
  return args;
}

function printHelp() {
  console.log(`
Remove white/near-white image backgrounds without removing white racket details.

The algorithm flood-fills only background-colored pixels connected to the image edges.
White areas inside the racket are preserved unless they are directly connected to the
outer background and indistinguishable from it.

Usage:
  node scripts/remove_image_backgrounds.js --file public/racket-images/example.webp
  node scripts/remove_image_backgrounds.js --file public/racket-images/example.webp --apply
  node scripts/remove_image_backgrounds.js --apply --limit 20
  node scripts/remove_image_backgrounds.js --apply --overwrite

Options:
  --dir <path>                         Input directory. Default: public/racket-images
  --out-dir <path>                     Preview output directory. Default: public/racket-images-bg-removed
  --file <path>                        Process one file. Can be repeated.
  --ext <ext[,ext]>                    Directory mode extension filter, for example: webp
  --limit <n>                          Process at most n eligible images.
  --apply                              Write converted files. Without this, dry-run only.
  --overwrite                          Replace originals instead of writing to --out-dir.
  --force                              Process images that already have alpha.
  --threshold <n>                      Fully transparent color distance. Default: 28
  --soft-threshold <n>                 Feathered edge color distance. Default: 52
  --min-background-lightness <n>       Background seed lightness floor. Default: 232
  --max-background-saturation <n>      Background seed saturation ceiling. Default: 34
  --edge-sample <n>                    Border sample width for background color. Default: 18
  --feather <n>                        Extra alpha feather radius in pixels. Default: 1
  --protect-foreground-radius <n>      Preserve light pixels near definite racket pixels. Default: 8
  --protect-min-distance <n>           Protection starts above this color distance. Default: 8
  --quality <n>                        WebP output quality. Default: 92
`);
}

function listInputFiles(args) {
  if (args.files.length > 0) {
    return args.files.map((file) => path.resolve(file));
  }

  const files = fs
    .readdirSync(args.dir)
    .filter((name) => {
      const extension = path.extname(name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) return false;
      if (args.extensions === null) return true;
      return args.extensions.includes(extension);
    })
    .map((name) => path.join(args.dir, name))
    .sort();

  return args.limit === null ? files : files.slice(0, args.limit);
}

function channelStats(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    lightness: (r + g + b) / 3,
    saturation: max - min,
  };
}

function colorDistance(pixel, background) {
  const dr = pixel[0] - background[0];
  const dg = pixel[1] - background[1];
  const db = pixel[2] - background[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

function estimateBackground(data, info, args) {
  const sample = Math.max(1, Math.min(args.edgeSample, Math.floor(Math.min(info.width, info.height) / 4)));
  const channels = info.channels;
  const candidates = [];

  const addPixel = (x, y) => {
    const offset = (y * info.width + x) * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const stats = channelStats(r, g, b);
    if (
      stats.lightness >= args.minBackgroundLightness &&
      stats.saturation <= args.maxBackgroundSaturation
    ) {
      candidates.push([r, g, b]);
    }
  };

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < sample; x += 1) addPixel(x, y);
    for (let x = Math.max(sample, info.width - sample); x < info.width; x += 1) addPixel(x, y);
  }
  for (let x = sample; x < Math.max(sample, info.width - sample); x += 1) {
    for (let y = 0; y < sample; y += 1) addPixel(x, y);
    for (let y = Math.max(sample, info.height - sample); y < info.height; y += 1) addPixel(x, y);
  }

  if (candidates.length === 0) {
    return null;
  }

  return [
    median(candidates.map((pixel) => pixel[0])),
    median(candidates.map((pixel) => pixel[1])),
    median(candidates.map((pixel) => pixel[2])),
  ];
}

function isBackgroundCandidate(data, info, pixelIndex, background, args) {
  const offset = pixelIndex * info.channels;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const stats = channelStats(r, g, b);
  return (
    stats.lightness >= args.minBackgroundLightness &&
    stats.saturation <= args.maxBackgroundSaturation &&
    colorDistance([r, g, b], background) <= args.softThreshold
  );
}

function buildConnectedBackgroundMask(data, info, background, args) {
  const total = info.width * info.height;
  const visited = new Uint8Array(total);
  const mask = new Uint8Array(total);
  const stack = [];

  const maybeSeed = (x, y) => {
    const index = y * info.width + x;
    if (!visited[index] && isBackgroundCandidate(data, info, index, background, args)) {
      visited[index] = 1;
      stack.push(index);
    }
  };

  for (let x = 0; x < info.width; x += 1) {
    maybeSeed(x, 0);
    maybeSeed(x, info.height - 1);
  }
  for (let y = 1; y < info.height - 1; y += 1) {
    maybeSeed(0, y);
    maybeSeed(info.width - 1, y);
  }

  while (stack.length > 0) {
    const index = stack.pop();
    mask[index] = 1;
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < info.width - 1 ? index + 1 : -1,
      y > 0 ? index - info.width : -1,
      y < info.height - 1 ? index + info.width : -1,
    ];

    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor]) continue;
      visited[neighbor] = 1;
      if (isBackgroundCandidate(data, info, neighbor, background, args)) {
        stack.push(neighbor);
      }
    }
  }

  return mask;
}

function buildForegroundProtectionMask(data, info, background, args) {
  const total = info.width * info.height;
  const foreground = new Uint8Array(total);
  const protectedMask = new Uint8Array(total);
  const radius = Math.max(0, args.protectForegroundRadius);

  for (let index = 0; index < total; index += 1) {
    const offset = index * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const stats = channelStats(r, g, b);
    if (
      stats.lightness < args.minBackgroundLightness ||
      stats.saturation > args.maxBackgroundSaturation ||
      colorDistance([r, g, b], background) > args.softThreshold
    ) {
      foreground[index] = 1;
    }
  }

  if (radius === 0) {
    return foreground;
  }

  for (let index = 0; index < total; index += 1) {
    if (!foreground[index]) continue;
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    for (let dy = -radius; dy <= radius; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= info.height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        if ((dx * dx + dy * dy) > radius * radius) continue;
        const xx = x + dx;
        if (xx < 0 || xx >= info.width) continue;
        protectedMask[yy * info.width + xx] = 1;
      }
    }
  }

  return protectedMask;
}

function isNearMask(mask, width, height, index, radius) {
  if (radius <= 0) return false;
  const x = index % width;
  const y = Math.floor(index / width);
  for (let dy = -radius; dy <= radius; dy += 1) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      if (mask[yy * width + xx]) return true;
    }
  }
  return false;
}

function applyAlpha(data, info, mask, foregroundProtectionMask, background, args) {
  let transparent = 0;
  let feathered = 0;
  let protectedForeground = 0;
  const total = info.width * info.height;

  for (let index = 0; index < total; index += 1) {
    const offset = index * info.channels;
    let alpha = data[offset + 3];
    const distance = colorDistance(
      [data[offset], data[offset + 1], data[offset + 2]],
      background,
    );
    const isProtectedForeground =
      mask[index] &&
      foregroundProtectionMask[index] &&
      distance >= args.protectMinDistance;

    if (isProtectedForeground) {
      alpha = 255;
      protectedForeground += 1;
    } else if (mask[index]) {
      if (distance <= args.threshold) {
        alpha = 0;
      } else {
        const span = Math.max(1, args.softThreshold - args.threshold);
        alpha = Math.min(255, Math.max(0, Math.round(((distance - args.threshold) / span) * 255)));
      }
    } else if (isNearMask(mask, info.width, info.height, index, args.feather)) {
      if (distance <= args.threshold) {
        alpha = Math.min(alpha, 90);
      }
    }

    data[offset + 3] = alpha;
    if (alpha === 0) transparent += 1;
    else if (alpha < 255) feathered += 1;
  }

  return {
    transparent,
    feathered,
    protectedForeground,
    transparentPct: total === 0 ? 0 : transparent / total,
    featheredPct: total === 0 ? 0 : feathered / total,
  };
}

async function processFile(file, args) {
  const metadata = await sharp(file, { failOn: "none" }).metadata();
  if (metadata.hasAlpha && !args.force) {
    return {
      file,
      status: "skipped_has_alpha",
      width: metadata.width,
      height: metadata.height,
    };
  }

  const { data, info } = await sharp(file, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const background = estimateBackground(data, info, args);
  if (!background) {
    return {
      file,
      status: "skipped_no_light_edge_background",
      width: metadata.width,
      height: metadata.height,
    };
  }

  const mask = buildConnectedBackgroundMask(data, info, background, args);
  const foregroundProtectionMask = buildForegroundProtectionMask(data, info, background, args);
  const alphaStats = applyAlpha(data, info, mask, foregroundProtectionMask, background, args);
  const outputPath = args.overwrite
    ? file
    : path.join(args.outDir, path.relative(args.dir, file));

  if (args.apply) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const encoded = await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .webp({ quality: args.quality, alphaQuality: 100 })
      .toBuffer();

    if (args.overwrite) {
      const tempPath = `${file}.tmp-${process.pid}.webp`;
      fs.writeFileSync(tempPath, encoded);
      fs.renameSync(tempPath, file);
    } else {
      fs.writeFileSync(outputPath, encoded);
    }
  }

  return {
    file,
    outputPath,
    status: args.apply ? "converted" : "dry_run",
    width: metadata.width,
    height: metadata.height,
    background,
    ...alphaStats,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = listInputFiles(args);
  const results = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      results.push({ file, status: "missing" });
      continue;
    }
    results.push(await processFile(file, args));
  }

  const summary = {
    mode: args.apply ? (args.overwrite ? "overwrite" : "preview") : "dry_run",
    inputCount: files.length,
    converted: results.filter((result) => result.status === "converted").length,
    dryRun: results.filter((result) => result.status === "dry_run").length,
    skippedHasAlpha: results.filter((result) => result.status === "skipped_has_alpha").length,
    skippedNoLightEdgeBackground: results.filter((result) => result.status === "skipped_no_light_edge_background").length,
    missing: results.filter((result) => result.status === "missing").length,
    outDir: args.overwrite ? null : args.outDir,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
