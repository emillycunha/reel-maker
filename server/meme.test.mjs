import test from "node:test";
import assert from "node:assert/strict";
import { validateCutout, validateMeme } from "./meme.mjs";
import {
  audioEnvelope,
  maskBox,
  normalizeMeme,
} from "../shared/meme-options.mjs";
const assets = new Map([
  ["v", { id: "v", kind: "video", duration: 20, width: 1920, height: 1080 }],
  ["bg", { kind: "image" }],
  ["music", { kind: "audio" }],
  [
    "cut",
    {
      kind: "video",
      cutout: true,
      sourceId: "v",
      sourceIn: 1,
      sourceOut: 4,
      duration: 3,
    },
  ],
]);
test("background removal requires valid video trims and bounds work", () => {
  assert.equal(
    validateCutout({ assetId: "v", in: 1, out: 4, method: "ai" }, assets).id,
    "v",
  );
  assert.equal(
    validateCutout({ assetId: "v", in: 0, out: 15, method: "ai" }, assets).id,
    "v",
  );
  assert.equal(
    validateCutout({ assetId: "v", in: 0, out: 15, method: "human" }, assets)
      .id,
    "v",
  );
  for (const req of [
    { assetId: "bg", in: 0, out: 3, method: "ai" },
    { assetId: "v", in: -1, out: 3, method: "ai" },
    { assetId: "v", in: 0, out: 15.1, method: "ai" },
    { assetId: "v", in: 0, out: 3, method: "unknown" },
  ])
    assert.throws(() => validateCutout(req, assets));
});
test("meme export requires image background, matching processed trim, and valid placement", () => {
  const p = {
    format: "9:16",
    meme: {
      backgroundId: "bg",
      overlayId: "v",
      cutoutId: "cut",
      in: 1,
      out: 4,
      x: 50,
      y: 65,
      size: 75,
      text: "POV: a test",
    },
  };
  assert.equal(validateMeme(p, assets), 3);
  for (const change of [
    { in: 0 },
    { cutoutId: "" },
    { backgroundId: "v" },
    { size: 0 },
    { x: NaN },
    { text: "a".repeat(301) },
    { layout: "v3" },
    { sourceVolume: 2 },
    { soundtrackId: "missing" },
    { freeText: "a".repeat(301) },
    { boxWidth: 5 },
  ])
    assert.throws(() =>
      validateMeme({ ...p, meme: { ...p.meme, ...change } }, assets),
    );
});

test("meme options preserve older projects and calculate the V2 mask", () => {
  const legacy = normalizeMeme({ text: "POV" });
  assert.equal(legacy.layout, "v1");
  assert.equal(legacy.freeText, "");
  assert.deepEqual(
    maskBox({ boxX: 75, boxY: 80, boxWidth: 40, boxHeight: 30 }, 1080, 1920),
    { x: 648, y: 1344, width: 432, height: 576 },
  );
});

test("original overlay mode does not require a processed cutout", () => {
  const p = {
    format: "9:16",
    meme: {
      backgroundId: "bg",
      overlayId: "v",
      cutoutId: "",
      in: 2,
      out: 5,
      x: 50,
      y: 65,
      size: 75,
      text: "POV: a test",
      overlayMode: "original",
    },
  };
  assert.equal(validateMeme(p, assets), 3);
  assert.equal(
    validateMeme({ ...p, meme: { ...p.meme, in: 0, out: 15 } }, assets),
    15,
  );
  assert.throws(() =>
    validateMeme({ ...p, meme: { ...p.meme, overlayMode: "unknown" } }, assets),
  );
  assert.throws(() =>
    validateMeme({ ...p, meme: { ...p.meme, out: 17.1 } }, assets),
  );
});

test("audio envelope applies bounded fade in and fade out", () => {
  assert.equal(audioEnvelope(0, 3, 0.5, 0.5), 0);
  assert.equal(audioEnvelope(0.25, 3, 0.5, 0.5), 0.5);
  assert.equal(audioEnvelope(1.5, 3, 0.5, 0.5), 1);
  assert.ok(Math.abs(audioEnvelope(2.75, 3, 0.5, 0.5) - 0.5) < 1e-9);
  assert.equal(audioEnvelope(3, 3, 0.5, 0.5), 0);
});
