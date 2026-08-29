import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function pngSize(path) {
  const bytes = await readFile(new URL(path, root));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function pngChunkTypes(path) {
  const bytes = await readFile(new URL(path, root));
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    chunks.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

test("ships generated Oura orbit artwork at every required size", async () => {
  const expected = new Map([
    ["assets/brand/oura-orbit-concept-sheet.png", [1536, 1024]],
    ["public/brand/oura-orbit-light.png", [320, 320]],
    ["public/brand/oura-orbit-dark.png", [320, 320]],
    ["public/favicon-light.png", [32, 32]],
    ["public/favicon-dark.png", [32, 32]],
    ["public/apple-touch-icon.png", [180, 180]],
    ["public/icon-192.png", [192, 192]],
    ["public/icon-512.png", [512, 512]],
  ]);

  for (const [path, [width, height]] of expected) {
    assert.deepEqual(await pngSize(path), { width, height }, path);
  }
});

test("ships a conventional 32px ICO fallback", async () => {
  const bytes = await readFile(new URL("public/favicon.ico", root));
  assert.deepEqual([...bytes.subarray(0, 4)], [0, 0, 1, 0]);
  assert.equal(bytes[6], 32);
  assert.equal(bytes[7], 32);
});

test("public PNG artwork contains no provenance or text metadata chunks", async () => {
  const pngPaths = [
    "assets/brand/oura-orbit-concept-sheet.png",
    "public/apple-touch-icon.png",
    "public/favicon-dark.png",
    "public/favicon-light.png",
    "public/health-rhythm-social.png",
    "public/icon-192.png",
    "public/icon-512.png",
    "public/oura-dashboard-social.png",
    "public/brand/oura-orbit-dark.png",
    "public/brand/oura-orbit-light.png",
  ];
  const forbidden = new Set(["caBX", "eXIf", "iTXt", "tEXt", "zTXt"]);
  for (const path of pngPaths) {
    const chunks = await pngChunkTypes(path);
    assert.equal(
      chunks.some((chunk) => forbidden.has(chunk)),
      false,
      path,
    );
  }
});

test("publishes installable Oura Dashboard metadata for mobile", async () => {
  const { default: manifest } = await import("../../app/manifest.ts");
  const value = manifest();

  assert.equal(value.name, "Oura Dashboard");
  assert.equal(value.short_name, "Oura");
  assert.equal(value.start_url, "/");
  assert.equal(value.display, "standalone");
  assert.deepEqual(value.icons?.map(({ src, sizes }) => [src, sizes]), [
    ["/icon-192.png", "192x192"],
    ["/icon-512.png", "512x512"],
  ]);
});

test("uses the orbit rebrand in the social preview", async () => {
  const path = "public/oura-dashboard-social.png";
  const bytes = await readFile(new URL(path, root));

  assert.deepEqual(await pngSize(path), { width: 1734, height: 907 });
  assert.notEqual(
    createHash("sha256").update(bytes).digest("hex"),
    "0a4ae1fed0aa5c73966159ae62e1b5817cda2e59b330dfda4e07491ac1b035a2",
  );
});
