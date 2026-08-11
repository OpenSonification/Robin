"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("README, grid skip, and Settings are exposed in that document order", () => {
  const readme = index.indexOf('id="readme-download"');
  const skip = index.indexOf('href="#sound-grid"');
  const settings = index.indexOf("data-settings-open");

  assert.ok(readme >= 0);
  assert.ok(readme < skip);
  assert.ok(skip < settings);
  assert.match(index.slice(settings, settings + 220), /aria-haspopup="dialog"/);
  assert.match(index.slice(settings, settings + 220), /aria-controls="settings-dialog"/);
});

test("desktop map avoids table row semantics that VoiceOver announces", () => {
  assert.doesNotMatch(index, /role="grid"|role="row"|role="gridcell"/);
  assert.doesNotMatch(app, /aria-rowindex|aria-colindex/);
  assert.match(index, /id="sound-grid"[\s\S]*?role="group"/);
});

test("Robin Settings uses Control-comma and preserves VoiceOver arrows", () => {
  assert.doesNotMatch(index, /Meta\+,/);
  assert.match(app, /event\.ctrlKey[\s\S]*?!event\.metaKey[\s\S]*?!event\.altKey[\s\S]*?event\.key === ","/);
  assert.match(app, /event\.ctrlKey && event\.altKey && directions\[event\.key\]/);
});

test("the browser loads the standalone-master audio port before the app", () => {
  const audioScript = index.indexOf('src="robin-audio.js');
  const appScript = index.indexOf('src="app.js');
  assert.ok(audioScript >= 0);
  assert.ok(audioScript < appScript);
  assert.doesNotMatch(app, /createDynamicsCompressor|createOscillator/);
});
