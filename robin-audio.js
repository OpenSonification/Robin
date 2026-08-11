(function exposeRobinAudio(root, factory) {
  const audio = factory();
  if (typeof module === "object" && module.exports) module.exports = audio;
  root.RobinAudio = audio;
})(typeof globalThis === "object" ? globalThis : this, function createRobinAudio() {
  "use strict";

  // This module is a direct browser port of Robin Version 0.2/audio.py in the
  // standalone master repository. Keep waveform constants, envelopes, note
  // sequences, gaps, harmonics, and levels in step with that file. Web Audio
  // is used only to play these generated master waveforms.
  const SAMPLE_RATE = 44100;
  const GRID_MIN = -5;
  const GRID_MAX = 5;
  const ROOT_FREQUENCY = 130.81;
  const CENTRE_SEMITONES = 12;
  const TOP_TRIM = 0.97;
  const PENTATONIC_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function zeros(length) {
    return new Float64Array(Math.max(0, length));
  }

  function scaleWave(wave, amount) {
    const result = new Float64Array(wave.length);
    for (let index = 0; index < wave.length; index += 1) {
      result[index] = wave[index] * amount;
    }
    return result;
  }

  function concatenate(waves) {
    const length = waves.reduce((total, wave) => total + wave.length, 0);
    const result = new Float64Array(length);
    let offset = 0;
    waves.forEach((wave) => {
      result.set(wave, offset);
      offset += wave.length;
    });
    return result;
  }

  function mixWaves(first, second) {
    const result = new Float64Array(Math.max(first.length, second.length));
    for (let index = 0; index < result.length; index += 1) {
      result[index] = (first[index] || 0) + (second[index] || 0);
    }
    return result;
  }

  function makeEnvelope(length, attack, release) {
    const envelope = new Float64Array(length);
    envelope.fill(1);
    const attackLength = Math.max(1, Math.floor(length * attack));
    const releaseLength = Math.max(1, Math.floor(length * release));
    for (let index = 0; index < attackLength; index += 1) {
      envelope[index] = attackLength === 1 ? 0 : index / (attackLength - 1);
    }
    for (let index = 0; index < releaseLength; index += 1) {
      envelope[length - releaseLength + index] =
        releaseLength === 1 ? 1 : 1 - index / (releaseLength - 1);
    }
    return envelope;
  }

  function makeTone(frequency, duration, volume) {
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.08, 0.35);
    const wave = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      const time = (index * duration) / length;
      const phase = 2 * Math.PI * frequency * time;
      wave[index] =
        (Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.15 * Math.sin(phase * 3)) *
        envelope[index] *
        volume;
    }
    return wave;
  }

  function makePureTone(frequency, duration, volume, attack, release) {
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, attack, release);
    const wave = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      const time = (index * duration) / length;
      wave[index] =
        Math.sin(2 * Math.PI * frequency * time) * envelope[index] * volume;
    }
    return wave;
  }

  function arrayContour(length, checkpoints) {
    if (checkpoints.length === 1) {
      const result = new Float64Array(length);
      result.fill(checkpoints[0]);
      return result;
    }
    const result = new Float64Array(length);
    const lastCheckpoint = checkpoints.length - 1;
    const finalSample = Math.max(1, length - 1);
    for (let index = 0; index < length; index += 1) {
      const position = (index * lastCheckpoint) / finalSample;
      const left = Math.min(lastCheckpoint, Math.floor(position));
      const right = Math.min(lastCheckpoint, left + 1);
      const amount = position - left;
      result[index] = checkpoints[left] * (1 - amount) + checkpoints[right] * amount;
    }
    return result;
  }

  function durationContour(duration, checkpoints) {
    return arrayContour(Math.floor(SAMPLE_RATE * duration), checkpoints);
  }

  function axisPitchSemitones(position, settings) {
    return (
      (PENTATONIC_STEPS[position + 5] - CENTRE_SEMITONES) *
      settings.pitchRangeScale
    );
  }

  function combinedSemitones(x, y, settings) {
    let total = 0;
    if (settings.leftRight.pitchStyle === "pentatonic") {
      total += axisPitchSemitones(x, settings);
    }
    if (settings.upDown.pitchStyle === "pentatonic") {
      total += axisPitchSemitones(y, settings);
    }
    return total;
  }

  function positionPitchRatio(x, y, settings) {
    let ratio = 2 ** (combinedSemitones(x, y, settings) / 12);
    if (y === GRID_MAX) ratio *= TOP_TRIM;
    return ratio;
  }

  function runPitchRatio(y, settings) {
    let ratio = 2 ** (axisPitchSemitones(y, settings) / 12);
    if (y === GRID_MAX) ratio *= TOP_TRIM;
    return ratio;
  }

  function chordAxisValue(x, y, settings) {
    if (settings.leftRight.pitchStyle === "chord") return x;
    if (settings.upDown.pitchStyle === "chord") return y;
    return null;
  }

  function chordFrequencies(value, settings) {
    const semitones = axisPitchSemitones(value, settings);
    const root = ROOT_FREQUENCY * 2 ** ((CENTRE_SEMITONES + semitones) / 12);
    return [0, 7, 14, 19].map((interval) => root * 2 ** (interval / 12));
  }

  function makeSparkle(frequency) {
    const duration = 0.05;
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.05, 0.7);
    const wave = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      const time = (index * duration) / length;
      const phase = 2 * Math.PI * frequency * time;
      wave[index] =
        (Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * envelope[index] * 0.22;
    }
    return wave;
  }

  function squareSound(pitchRatio = 1) {
    const frequency = 400 * pitchRatio;
    return concatenate([
      makeTone(frequency, 0.05, 0.4),
      zeros(Math.floor(SAMPLE_RATE * 0.02)),
      makeTone(frequency, 0.05, 0.4),
    ]);
  }

  function circleSound(pitchRatio = 1) {
    const frequency = 600 * pitchRatio;
    const duration = 0.26;
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.25, 0.5);
    const detune = frequency * 0.006;
    const wave = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      const time = (index * duration) / length;
      wave[index] =
        (Math.sin(2 * Math.PI * frequency * time) +
          Math.sin(2 * Math.PI * (frequency + detune) * time) +
          0.15 * Math.sin(2 * Math.PI * frequency * 2 * time)) *
        envelope[index] *
        0.15;
    }
    return wave;
  }

  function triangleSound(pitchRatio = 1) {
    const pieces = [];
    [500, 650, 800].forEach((frequency) => {
      pieces.push(makeTone(frequency * pitchRatio, 0.05, 0.35));
      pieces.push(zeros(Math.floor(SAMPLE_RATE * 0.01)));
    });
    return concatenate(pieces);
  }

  function diamondSound(pitchRatio = 1) {
    const pieces = [];
    [1600, 2200, 1800, 2400].forEach((frequency) => {
      pieces.push(makeSparkle(frequency * pitchRatio));
      pieces.push(zeros(Math.floor(SAMPLE_RATE * 0.015)));
    });
    return concatenate(pieces);
  }

  function shapeSound(shape, pitchRatio = 1) {
    return {
      square: squareSound,
      circle: circleSound,
      triangle: triangleSound,
      diamond: diamondSound,
    }[shape](pitchRatio);
  }

  function echoTail(wave, delay, decay, repeats) {
    const gap = zeros(Math.floor(SAMPLE_RATE * delay));
    let result = wave;
    let echo = wave;
    for (let index = 0; index < repeats; index += 1) {
      echo = scaleWave(concatenate([gap, echo]), decay);
      result = mixWaves(result, echo);
    }
    return result;
  }

  function padTone(frequency, duration, volume) {
    const detune = frequency * 0.006;
    const softness = clamp(700 / frequency, 0.5, 1);
    const layers = [
      [frequency - detune, volume * 0.3, 0.45],
      [frequency, volume * 0.3, 0.45],
      [frequency + detune, volume * 0.3 * softness, 0.45],
      [frequency * 2, volume * 0.1 * softness, 0.6],
      [frequency / 2, volume * 0.16, 0.4],
    ];
    let wave = zeros(0);
    layers.forEach(([layerFrequency, layerVolume, attack]) => {
      wave = mixWaves(
        wave,
        makePureTone(layerFrequency, duration, layerVolume, attack, 0.75),
      );
    });
    return echoTail(wave, 0.18, 0.32, 3);
  }

  function positionWave(x, y, duration, volume, settings) {
    const chordValue = chordAxisValue(x, y, settings);
    if (chordValue !== null) {
      const weights = [0.45, 0.3, 0.2, 0.15];
      const padDuration = Math.max(duration, 1.4);
      let wave = zeros(0);
      chordFrequencies(chordValue, settings).forEach((frequency, index) => {
        wave = mixWaves(wave, padTone(frequency, padDuration, volume * weights[index]));
      });
      return wave;
    }
    const semitones = combinedSemitones(x, y, settings) + CENTRE_SEMITONES;
    const frequency = ROOT_FREQUENCY * 2 ** (semitones / 12);
    return makeTone(frequency, duration, volume);
  }

  function tremolo(wave, amount) {
    const result = new Float64Array(wave.length);
    let phase = 0;
    for (let index = 0; index < wave.length; index += 1) {
      const value = typeof amount === "number" ? amount : amount[index];
      const rate = 3 + value * 9;
      phase += rate / SAMPLE_RATE;
      const modulation = 1 - value * 0.5 * (1 - Math.cos(2 * Math.PI * phase));
      result[index] = wave[index] * modulation;
    }
    return result;
  }

  function combinedTremolo(x, y, settings) {
    let used = false;
    let amount = 0.5;
    if (settings.leftRight.timbre !== "none") {
      amount += (settings.leftRight.timbre === "reverse" ? -x : x) / 10;
      used = true;
    }
    if (settings.upDown.timbre !== "none") {
      amount += (settings.upDown.timbre === "reverse" ? -y : y) / 10;
      used = true;
    }
    return used ? clamp(amount, 0, 1) : null;
  }

  function applyTimbre(wave, x, y, settings) {
    const amount = combinedTremolo(x, y, settings);
    return amount === null ? wave : tremolo(wave, amount);
  }

  function applyTimbrePath(wave, points, settings) {
    const amounts = points.map(([x, y]) => combinedTremolo(x, y, settings));
    if (!amounts.some((amount) => amount !== null)) return wave;
    return tremolo(
      wave,
      arrayContour(
        wave.length,
        amounts.map((amount) => (amount === null ? 0.5 : amount)),
      ),
    );
  }

  function panGains(pan) {
    return [(1 - pan) / 2, (1 + pan) / 2];
  }

  function panWave(wave, pan) {
    const [leftGain, rightGain] = panGains(pan);
    return [scaleWave(wave, leftGain), scaleWave(wave, rightGain)];
  }

  function duplicateWave(wave) {
    return [new Float64Array(wave), new Float64Array(wave)];
  }

  function normaliseStereo(stereo) {
    let peak = 0;
    for (const channel of stereo) {
      for (let index = 0; index < channel.length; index += 1) {
        peak = Math.max(peak, Math.abs(channel[index]));
      }
    }
    if (peak <= 0.85) return stereo;
    const scale = 0.85 / peak;
    return stereo.map((channel) => scaleWave(channel, scale));
  }

  function normaliseMono(wave) {
    let peak = 0;
    for (let index = 0; index < wave.length; index += 1) {
      peak = Math.max(peak, Math.abs(wave[index]));
    }
    return peak > 0.85 ? scaleWave(wave, 0.85 / peak) : wave;
  }

  function spatialiseRawWithoutElevation(wave, x, y, settings) {
    const shaped = applyTimbre(wave, x, y, settings);
    return settings.leftRight.pan
      ? panWave(shaped, x / GRID_MAX)
      : duplicateWave(shaped);
  }

  function spatialiseWithoutElevation(wave, x, y, settings) {
    return normaliseStereo(spatialiseRawWithoutElevation(wave, x, y, settings));
  }

  function spatialisePathRawWithoutElevation(wave, points, settings) {
    const shaped = applyTimbrePath(wave, points, settings);
    if (!settings.leftRight.pan) return duplicateWave(shaped);
    const pans = arrayContour(
      shaped.length,
      points.map(([x]) => x / GRID_MAX),
    );
    const left = new Float64Array(shaped.length);
    const right = new Float64Array(shaped.length);
    for (let index = 0; index < shaped.length; index += 1) {
      left[index] = (shaped[index] * (1 - pans[index])) / 2;
      right[index] = (shaped[index] * (1 + pans[index])) / 2;
    }
    return [left, right];
  }

  function spatialisePathWithoutElevation(wave, points, settings) {
    return normaliseStereo(
      spatialisePathRawWithoutElevation(wave, points, settings),
    );
  }

  function smoothSquareTone(duration, ratios) {
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.06, 0.18);
    const wave = new Float64Array(length);
    let phase = 0;
    for (let index = 0; index < length; index += 1) {
      phase += (400 * ratios[index]) / SAMPLE_RATE;
      const time = (index * duration) / length;
      const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 5 * time));
      wave[index] = Math.sin(2 * Math.PI * phase) * pulse * envelope[index] * 0.32;
    }
    return wave;
  }

  function smoothCircleTone(duration, ratios) {
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.12, 0.25);
    const wave = new Float64Array(length);
    let phase = 0;
    for (let index = 0; index < length; index += 1) {
      phase += (600 * ratios[index]) / SAMPLE_RATE;
      wave[index] =
        (Math.sin(2 * Math.PI * phase) + 0.15 * Math.sin(2 * Math.PI * phase * 2)) *
        envelope[index] *
        0.28;
    }
    return wave;
  }

  function smoothTriangleTone(duration, ratios) {
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.06, 0.18);
    const wave = new Float64Array(length);
    let phase = 0;
    for (let index = 0; index < length; index += 1) {
      phase += (650 * ratios[index]) / SAMPLE_RATE;
      const time = (index * duration) / length;
      const ripple = 0.75 + 0.25 * Math.sin(2 * Math.PI * 3 * time);
      wave[index] =
        (Math.sin(2 * Math.PI * phase) + 0.25 * Math.sin(2 * Math.PI * phase * 2)) *
        ripple *
        envelope[index] *
        0.26;
    }
    return wave;
  }

  function smoothDiamondTone(duration, ratios) {
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.05, 0.2);
    const wave = new Float64Array(length);
    let phase = 0;
    for (let index = 0; index < length; index += 1) {
      const time = (index * duration) / length;
      const shimmer = 1 + (60 / 1900) * Math.sin(2 * Math.PI * 7 * time);
      phase += (1900 * ratios[index] * shimmer) / SAMPLE_RATE;
      wave[index] = Math.sin(2 * Math.PI * phase) * envelope[index] * 0.22;
    }
    return wave;
  }

  function smoothedPathWave(shape, points, duration, settings) {
    const ratios = durationContour(
      duration,
      points.map(([, y]) => runPitchRatio(y, settings)),
    );
    const maker = {
      square: smoothSquareTone,
      circle: smoothCircleTone,
      triangle: smoothTriangleTone,
      diamond: smoothDiamondTone,
    }[shape];
    return scaleWave(maker(duration, ratios), settings.pointsVolume);
  }

  function drawClick(random = Math.random) {
    const length = Math.floor(SAMPLE_RATE * 0.015);
    const envelope = makeEnvelope(length, 0.1, 0.6);
    const wave = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      wave[index] = (random() * 2 - 1) * envelope[index] * 0.12;
    }
    return wave;
  }

  function binSound(random = Math.random) {
    const thud = makePureTone(90, 0.09, 0.35, 0.02, 0.6);
    const length = Math.floor(SAMPLE_RATE * 0.05);
    const envelope = makeEnvelope(length, 0.05, 0.8);
    const rattle = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
      rattle[index] = (random() * 2 - 1) * envelope[index] * 0.15;
    }
    return concatenate([thud, zeros(Math.floor(SAMPLE_RATE * 0.01)), rattle]);
  }

  function edgeSound() {
    return concatenate([
      makePureTone(220, 0.05, 0.3, 0.01, 0.6),
      zeros(Math.floor(SAMPLE_RATE * 0.02)),
      makePureTone(170, 0.06, 0.3, 0.01, 0.6),
    ]);
  }

  function centrePing() {
    return mixWaves(
      makePureTone(ROOT_FREQUENCY * 2, 0.14, 0.4, 0.05, 0.7),
      scaleWave(makeSparkle(ROOT_FREQUENCY * 4), 0.5),
    );
  }

  function toggleSound(blackout) {
    const first = blackout
      ? makePureTone(500, 0.07, 0.3, 0.02, 0.5)
      : makePureTone(260, 0.07, 0.3, 0.02, 0.5);
    const second = blackout
      ? makePureTone(260, 0.09, 0.3, 0.02, 0.6)
      : makePureTone(500, 0.09, 0.3, 0.02, 0.6);
    return concatenate([first, zeros(Math.floor(SAMPLE_RATE * 0.01)), second]);
  }

  function confirmSparkle(major) {
    const intervals = major ? [0, 4, 7, 12] : [12, 7, 3, 0];
    const pieces = [];
    intervals.forEach((interval, index) => {
      pieces.push(makeSparkle(ROOT_FREQUENCY * 3 * 2 ** (interval / 12)));
      if (index < intervals.length - 1) {
        pieces.push(zeros(Math.floor(SAMPLE_RATE * 0.012)));
      }
    });
    return concatenate(pieces);
  }

  function selectSparkle() {
    const gap = zeros(Math.floor(SAMPLE_RATE * 0.03));
    const run = concatenate([
      makeSparkle(ROOT_FREQUENCY * 4),
      gap,
      makeSparkle(ROOT_FREQUENCY * 4 * 2 ** (4 / 12)),
      gap,
      makeSparkle(ROOT_FREQUENCY * 4 * 2 ** (7 / 12)),
    ]);
    const harmony = scaleWave(makeSparkle(ROOT_FREQUENCY * 8), 0.6);
    return mixWaves(run, concatenate([zeros(run.length - harmony.length), harmony]));
  }

  function bounceClick() {
    const duration = 0.04;
    const length = Math.floor(SAMPLE_RATE * duration);
    const envelope = makeEnvelope(length, 0.1, 0.6);
    const wave = new Float64Array(length);
    let phase = 0;
    for (let index = 0; index < length; index += 1) {
      const frequency = 300 + ((700 - 300) * index) / Math.max(1, length - 1);
      phase += frequency / SAMPLE_RATE;
      wave[index] = Math.sin(2 * Math.PI * phase) * envelope[index] * 0.18;
    }
    return wave;
  }

  function speedVolumeScale(speedMilliseconds) {
    return clamp(speedMilliseconds / 160, 0.5, 1);
  }

  return {
    SAMPLE_RATE,
    applyTimbre,
    applyTimbrePath,
    binSound,
    bounceClick,
    centrePing,
    confirmSparkle,
    drawClick,
    edgeSound,
    mixWaves,
    normaliseMono,
    normaliseStereo,
    panWave,
    positionPitchRatio,
    positionWave,
    scaleWave,
    selectSparkle,
    shapeSound,
    smoothedPathWave,
    spatialisePathWithoutElevation,
    spatialisePathRawWithoutElevation,
    spatialiseRawWithoutElevation,
    spatialiseWithoutElevation,
    speedVolumeScale,
    toggleSound,
  };
});
