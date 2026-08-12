"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("touchscreens initially receive only the unsupported notice", () => {
  assert.match(index, /dataset\.touchPreview = touchInterface/);
  assert.match(index, /\? "blocked"\s*: "allowed"/);
  assert.match(index, /navigator\.maxTouchPoints > 0/);
  assert.match(app, /touchCapableDevice = navigator\.maxTouchPoints > 0/);
  assert.match(
    index,
    /web browser version is not currently supported on touchscreen/i,
  );
  assert.match(index, /desktop web browser on a desktop or\s+laptop/i);
  assert.match(index, /not fully accessible/i);
  assert.match(index, /developing a native iOS app/i);
  assert.match(
    styles,
    /data-touch-preview="blocked"[\s\S]*?\.robin-application[\s\S]*?display:\s*none\s*!important/,
  );
});

test("the touchscreen gate wrapper is layout-transparent on desktop", () => {
  assert.match(
    styles,
    /@media \(min-width: 901px\)[\s\S]*?html\[data-interface="desktop"\] \.robin-application \{[\s\S]*?display:\s*contents/,
  );
});

test("the warned touchscreen preview can be deliberately revealed", () => {
  assert.match(index, /data-touch-preview-open/);
  assert.match(index, /aria-controls="robin-application"/);
  assert.match(index, /Continue to touchscreen preview \(not fully accessible\)/);
  assert.match(app, /function openTouchPreview\(\)/);
  assert.match(app, /touchPreviewAllowed = true/);
  assert.match(app, /touchPreviewAllowed = true;\s*resumeAudioContext\(\)/);
  assert.match(app, /touchPreviewButton\.hidden = true/);
  assert.match(app, /touchPreviewStatus\.hidden = false/);
  assert.match(
    styles,
    /\.banner-actions \[hidden\][\s\S]*?display:\s*none\s*!important/,
  );
  assert.match(
    app,
    /touchPreviewButton\?\.addEventListener\("click", openTouchPreview\)/,
  );
});

test("README, grid skip, and Settings are exposed in that document order", () => {
  const readme = index.indexOf('id="readme-download"');
  const skip = index.indexOf('href="#sound-grid"');
  const settings = index.indexOf("data-settings-open");

  assert.ok(readme >= 0);
  assert.ok(readme < skip);
  assert.ok(skip < settings);
  assert.match(index.slice(settings, settings + 220), /aria-haspopup="dialog"/);
  assert.match(index.slice(settings, settings + 220), /aria-controls="settings-dialog"/);
  assert.match(index.slice(skip, skip + 100), /data-skip-grid/);
});

test("Skip to grid moves focus without scrolling the desktop layout", () => {
  assert.match(
    app,
    /event\.preventDefault\(\);[\s\S]*?window\.scrollTo\(0, 0\);[\s\S]*?focusCurrentCell\(\);/,
  );
  assert.match(
    app,
    /window\.location\.hash !== "#sound-grid"[\s\S]*?window\.history\.replaceState/,
  );
});

test("desktop map avoids table row semantics that VoiceOver announces", () => {
  assert.doesNotMatch(index, /role="grid"|role="row"|role="gridcell"/);
  assert.doesNotMatch(app, /aria-rowindex|aria-colindex/);
  assert.match(index, /id="sound-grid"[\s\S]*?role="group"/);
  assert.match(app, /document\.createElement\(touchGrid \? "button" : "span"\)/);
  assert.match(app, /cell\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(app, /grid\.tabIndex = 0/);
  assert.doesNotMatch(app, /row\.className = "grid-row"/);
});

test("Robin Settings uses Control-comma and preserves every VoiceOver chord", () => {
  assert.doesNotMatch(index, /Meta\+,/);
  assert.match(app, /event\.ctrlKey[\s\S]*?!event\.metaKey[\s\S]*?!event\.altKey[\s\S]*?event\.key === ","/);
  assert.match(app, /if \(event\.ctrlKey && event\.altKey\) return/);
  assert.ok(
    app.indexOf("if (event.ctrlKey && event.altKey) return") <
      app.indexOf('const commandDown = event.metaKey || event.ctrlKey'),
  );
});

test("touch VoiceOver works without a separate mode toggle", () => {
  assert.doesNotMatch(index, /voiceover-mode-toggle|Turn on VoiceOver controls/);
  assert.doesNotMatch(app, /voiceOverMode|isVoiceOverMode|toggleVoiceOverMode/);
  assert.match(app, /cell\.setAttribute\("aria-actions", VOICEOVER_ROTOR_ACTIONS\)/);
  assert.match(index, /class="voiceover-actions"[\s\S]*?VoiceOver cell actions/);
});

test("the browser loads the standalone-master audio port before the app", () => {
  const audioScript = index.indexOf('src="robin-audio.js');
  const appScript = index.indexOf('src="app.js');
  assert.ok(audioScript >= 0);
  assert.ok(audioScript < appScript);
  assert.doesNotMatch(app, /createDynamicsCompressor|createOscillator/);
});
