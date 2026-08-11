"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const audio = require("../robin-audio.js");

const settings = {
  leftRight: { pan: true, timbre: "none", pitchStyle: "none" },
  upDown: { elevation: false, timbre: "none", pitchStyle: "pentatonic" },
  pitchRangeScale: 1,
  positionVolume: 1,
  pointsVolume: 1,
  systemVolume: 1,
};

function energy(wave) {
  let result = 0;
  for (const sample of wave) result += sample * sample;
  return result;
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("shape waveforms match the standalone Robin 0.2 master references", () => {
  const references = {
    square: { length: 5292, energy: 279.8769859447451, sample: -0.24390280729420444 },
    circle: { length: 11466, energy: 72.8403327036934, sample: 0.008499635484559837 },
    triangle: { length: 7938, energy: 321.8092506153536, sample: 0.19682055273097013 },
    diamond: { length: 11464, energy: 111.07073699948313, sample: -0.014260431947981003 },
  };

  for (const [shape, reference] of Object.entries(references)) {
    const wave = audio.shapeSound(shape);
    assert.equal(wave.length, reference.length);
    close(energy(wave), reference.energy);
    close(wave[97], reference.sample);
  }
});

test("system sparkles and cues retain the master sequences and envelopes", () => {
  const select = audio.selectSparkle();
  const confirm = audio.confirmSparkle(true);
  const centre = audio.centrePing();
  const edge = audio.edgeSound();
  const toggle = audio.toggleSound(true);
  const bounce = audio.bounceClick();

  assert.equal(select.length, 9261);
  close(energy(select), 93.17275600915184);
  assert.equal(confirm.length, 10407);
  close(energy(confirm), 111.08906851501052);
  assert.equal(centre.length, 6174);
  close(energy(centre), 254.08337887031627);
  assert.equal(edge.length, 5733);
  close(energy(edge), 130.74083829921045);
  assert.equal(toggle.length, 7497);
  close(energy(toggle), 195.48076185414112);
  assert.equal(bounce.length, 1764);
  close(energy(bounce), 15.272705144309523);
});

test("position and chord sounds match the master waveform composition", () => {
  const position = audio.positionWave(2, 2, 0.22, 0.45, settings);
  assert.equal(position.length, 9702);
  close(energy(position), 779.7214199986652);

  const chordSettings = JSON.parse(JSON.stringify(settings));
  chordSettings.upDown.pitchStyle = "chord";
  const chord = audio.positionWave(2, 2, 0.22, 0.45, chordSettings);
  assert.equal(chord.length, 85553);
  close(energy(chord), 226.78955323616037);
  close(chord[777], -0.007052643942333969);
});

test("master panning uses the original linear channel gains", () => {
  const wave = Float64Array.from([1, -0.5]);
  const [left, right] = audio.panWave(wave, 0.5);
  assert.deepEqual(Array.from(left), [0.25, -0.125]);
  assert.deepEqual(Array.from(right), [0.75, -0.375]);
});

test("connected-line waveforms match the master pitch and pan contours", () => {
  const points = [
    [-2, -1],
    [0, 1],
    [2, 3],
  ];
  const references = {
    square: [164.95880752719813, 134.7951858687599],
    circle: [175.6625013880656, 154.40795935811693],
    triangle: [118.35328367905771, 98.47435416717744],
    diamond: [119.25093362226235, 102.60139622337498],
  };

  for (const [shape, [leftEnergy, rightEnergy]] of Object.entries(references)) {
    const wave = audio.smoothedPathWave(shape, points, 0.48, settings);
    const [left, right] = audio.spatialisePathRawWithoutElevation(
      wave,
      points,
      settings,
    );
    assert.equal(left.length, 21168);
    close(energy(left), leftEnergy);
    close(energy(right), rightEnergy);
  }
});
