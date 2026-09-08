import test from "node:test";
import assert from "node:assert/strict";
import { validateProject, srt } from "./core.mjs";
const assets = new Map([
  ["a", { kind: "video", duration: 3 }],
  ["v", { kind: "audio", duration: 5 }],
]);
const project = {
  format: "9:16",
  shots: [{ assetId: "a", in: 0.2, out: 2.8, caption: "Hello" }],
};
test("validates source trims and rejects missing media", () => {
  assert.equal(validateProject(project, assets), 2.5999999999999996);
  assert.throws(
    () =>
      validateProject(
        { ...project, shots: [{ assetId: "missing", in: 0, out: 2 }] },
        assets,
      ),
    /missing/,
  );
  assert.throws(
    () =>
      validateProject(
        { ...project, shots: [{ assetId: "a", in: 2, out: 4 }] },
        assets,
      ),
    /trim/,
  );
});
test("prevents accidentally truncating voiceover", () =>
  assert.throws(
    () => validateProject({ ...project, voiceover: "v" }, assets),
    /shorter/,
  ));
test("SRT keeps gaps for shots without captions", () =>
  assert.equal(
    srt([
      { in: 0, out: 1, caption: "Hello" },
      { in: 0, out: 2, caption: "" },
      { in: 0.5, out: 2, caption: "World" },
    ]),
    "1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,500\nWorld\n",
  ));

test("timed captions retain speech timing independently of cuts", () => {
  const cues = [
    { start: 0.2, end: 0.8, text: "First phrase" },
    { start: 1.3, end: 2.1, text: "Second phrase" },
  ];
  assert.equal(
    validateProject({ ...project, captions: cues }, assets),
    2.5999999999999996,
  );
  assert.match(srt(project.shots, cues), /00:00:00,200 --> 00:00:00,800/);
  assert.match(srt(project.shots, cues), /00:00:01,300 --> 00:00:02,100/);
  assert.throws(
    () =>
      validateProject(
        { ...project, captions: [{ start: 1, end: 3, text: "Outside" }] },
        assets,
      ),
    /Caption times/,
  );
  assert.throws(
    () =>
      validateProject(
        {
          ...project,
          captions: [
            { start: 0, end: 1, text: "A" },
            { start: 0.5, end: 2, text: "B" },
          ],
        },
        assets,
      ),
    /Caption times/,
  );
});

import { captionSlides, colorFilter } from "../shared/editing.mjs";
test("caption slides cap words, preserve text and timing, and toggle case without mutation", () => {
  const p = {
    ...project,
    style: { allCaps: true, maxWords: 4 },
    captions: [
      {
        start: 0.2,
        end: 2.5,
        text: "If you coach youth soccer, you know how it goes.",
      },
    ],
  };
  const slides = captionSlides(p);
  assert.ok(slides.every((c) => c.text.split(/\s+/).length <= 4));
  assert.equal(
    slides.map((c) => c.text).join(" "),
    p.captions[0].text.toUpperCase(),
  );
  assert.equal(slides[0].start, 0.2);
  assert.equal(slides.at(-1).end, 2.5);
  assert.ok(
    slides.every(
      (s, i) => s.end > s.start && (i === 0 || s.start === slides[i - 1].end),
    ),
  );
  p.style.allCaps = false;
  assert.equal(
    captionSlides(p)
      .map((c) => c.text)
      .join(" "),
    p.captions[0].text,
  );
  assert.match(srt([], slides), /IF YOU COACH YOUTH/);
});
test("four-word slides also apply to legacy shot captions and use word timestamps when available", () => {
  const p = {
    ...project,
    shots: [{ in: 0, out: 3, caption: "one two three four five" }],
  };
  assert.deepEqual(
    captionSlides(p).map((c) => c.text),
    ["one two three", "four five"],
  );
  const captions = [
    {
      start: 0,
      end: 3,
      text: "one two three four five",
      words: [
        { start: 0 },
        { start: 0.1 },
        { start: 0.2 },
        { start: 2 },
        { start: 2.5 },
      ],
    },
  ];
  assert.equal(captionSlides({ ...p, captions })[1].start, 2);
});
test("color defaults preserve original video and invalid settings are rejected", () => {
  assert.equal(colorFilter(), "null");
  assert.match(colorFilter({ saturation: 0 }), /saturation=0/);
  assert.throws(
    () => validateProject({ ...project, color: { brightness: 99 } }, assets),
    /Invalid color/,
  );
  assert.throws(() => colorFilter({ warmth: NaN }), /Invalid color/);
});
