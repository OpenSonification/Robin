"use strict";

const GRID_MIN = -5;
const GRID_MAX = 5;
const GRID_COUNT = 11;
const ROOT_FREQUENCY = 130.81;
const PENTATONIC_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const VALID_SHAPES = ["square", "circle", "triangle", "diamond"];
const SHAPE_SYMBOLS = {
  square: "□",
  circle: "○",
  triangle: "△",
  diamond: "◇",
};
const STORAGE_KEY = "robin-grid-v2";
const OLD_STORAGE_KEY = "robin-projects-v1";
const OLD_CURRENT_KEY = "robin-current-project-v1";

const demoPoints = [
  { x: 4, y: 4, shapes: ["circle"] },
  { x: 4, y: 3, shapes: ["circle"] },
  { x: 3, y: 2, shapes: ["circle"] },
  { x: 0, y: 1, shapes: ["circle"] },
  { x: 0, y: 0, shapes: ["circle"] },
];

const grid = document.querySelector("#sound-grid");
const importInput = document.querySelector("#import-project");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const cursorXOutput = document.querySelector("#cursor-x");
const cursorYOutput = document.querySelector("#cursor-y");
const mobileShapeSelect = document.querySelector("#mobile-shape");
const mobilePlotButton = document.querySelector("#mobile-plot");
const touchInterfaceQuery = window.matchMedia(
  "(hover: none) and (pointer: coarse)",
);

let gridCells = new Map();
let cursorX = 0;
let cursorY = 0;
let activeShape = "circle";
let audioContext = null;
let playbackToken = 0;

loadInitialGrid();
buildAxes();
bindEvents();
renderGrid({ focus: !touchInterfaceQuery.matches });
announceCurrentCell();

function pointKey(x, y) {
  return `${x},${y}`;
}

function normalisePoints(data) {
  if (!data || !Array.isArray(data.points)) {
    throw new Error("This file does not contain a Robin points list.");
  }

  return data.points.map((point) => {
    const shapes = Array.isArray(point.shapes) ? point.shapes : [point.shape];
    if (
      !Number.isInteger(point.x) ||
      !Number.isInteger(point.y) ||
      point.x < GRID_MIN ||
      point.x > GRID_MAX ||
      point.y < GRID_MIN ||
      point.y > GRID_MAX ||
      !shapes.length ||
      shapes.some((shape) => !VALID_SHAPES.includes(shape))
    ) {
      throw new Error("The project contains a point Robin cannot read.");
    }
    return { x: point.x, y: point.y, shapes };
  });
}

function loadInitialGrid() {
  let points = null;

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored) points = normalisePoints(stored);
  } catch {
    points = null;
  }

  if (!points) {
    try {
      const oldProjects = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || "{}");
      const oldCurrent = localStorage.getItem(OLD_CURRENT_KEY);
      const oldProject =
        oldProjects[oldCurrent] ||
        Object.values(oldProjects).sort(
          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
        )[0];
      if (oldProject) points = normalisePoints(oldProject);
    } catch {
      points = null;
    }
  }

  setPoints(points || demoPoints);
  saveGrid();
}

function setPoints(points) {
  gridCells = new Map();
  for (const point of points) {
    gridCells.set(pointKey(point.x, point.y), [...point.shapes]);
  }
}

function projectPoints() {
  return Array.from(gridCells.entries()).map(([key, shapes]) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y, shapes: [...shapes] };
  });
}

function saveGrid() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ points: projectPoints() }),
    );
  } catch {
    setStatus(
      "Browser storage is unavailable.",
      "Use Save JSON to keep a copy of your map.",
    );
  }
}

function buildAxes() {
  const xAxis = document.querySelector("#x-axis");
  const yAxis = document.querySelector("#y-axis");
  for (let value = GRID_MIN; value <= GRID_MAX; value += 1) {
    const xLabel = document.createElement("span");
    xLabel.textContent = value;
    xAxis.append(xLabel);
  }
  for (let value = GRID_MAX; value >= GRID_MIN; value -= 1) {
    const yLabel = document.createElement("span");
    yLabel.textContent = value;
    yAxis.append(yLabel);
  }
}

function renderGrid(options = {}) {
  const { focus = false } = options;
  const fragment = document.createDocumentFragment();

  for (let y = GRID_MAX; y >= GRID_MIN; y -= 1) {
    const row = document.createElement("div");
    row.className = "grid-row";
    row.setAttribute("role", "row");
    row.setAttribute("aria-rowindex", String(GRID_MAX - y + 1));

    for (let x = GRID_MIN; x <= GRID_MAX; x += 1) {
      const shapes = gridCells.get(pointKey(x, y)) || [];
      const current = x === cursorX && y === cursorY;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.tabIndex = current ? 0 : -1;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(x - GRID_MIN + 1));
      cell.setAttribute("aria-label", cellLabel(x, y, shapes));
      if (current) {
        cell.classList.add("is-current");
      }
      if (x === 0) cell.classList.add("on-y-axis");
      if (y === 0) cell.classList.add("on-x-axis");

      shapes.slice(0, 4).forEach((shape) => {
        const symbol = document.createElement("span");
        symbol.className = "plotted-shape";
        symbol.textContent = SHAPE_SYMBOLS[shape];
        symbol.setAttribute("aria-hidden", "true");
        cell.append(symbol);
      });

      if (shapes.length > 4) {
        const more = document.createElement("span");
        more.className = "shape-more";
        more.textContent = `+${shapes.length - 4}`;
        more.setAttribute("aria-hidden", "true");
        cell.append(more);
      }

      cell.addEventListener("click", () => selectCell(x, y));
      row.append(cell);
    }
    fragment.append(row);
  }

  grid.replaceChildren(fragment);
  cursorXOutput.textContent = cursorX;
  cursorYOutput.textContent = cursorY;
  if (focus) focusCurrentCell();
}

function cellLabel(x, y, shapes) {
  const contents = describeShapes(shapes);
  return contents ? `x ${x}, y ${y}, ${contents}` : `x ${x}, y ${y}`;
}

function describeShapes(shapes) {
  if (!shapes.length) return "";
  const counts = new Map();
  for (const shape of shapes) counts.set(shape, (counts.get(shape) || 0) + 1);
  return Array.from(counts.entries())
    .map(([shape, count]) => `${count} ${shape}${count === 1 ? "" : "s"}`)
    .join(", ");
}

function focusCurrentCell() {
  const cell = grid.querySelector(
    `[data-x="${cursorX}"][data-y="${cursorY}"]`,
  );
  cell?.focus({ preventScroll: true });
}

function selectCell(x, y) {
  cancelPlayback();
  cursorX = x;
  cursorY = y;
  playCell(x, y);
  renderGrid({ focus: true });
  announceCurrentCell();
}

function clamp(value) {
  return Math.max(GRID_MIN, Math.min(GRID_MAX, value));
}

function moveCursor(dx, dy, mode = "move", focus = true) {
  cancelPlayback();
  cursorX = clamp(cursorX + dx);
  cursorY = clamp(cursorY + dy);

  if (mode === "draw") {
    addShapeAtCursor(focus);
  } else if (mode === "erase") {
    eraseAtCursor(focus);
  } else {
    playCell(cursorX, cursorY);
    renderGrid({ focus });
    announceCurrentCell();
  }
}

function addShapeAtCursor(focus = false) {
  const key = pointKey(cursorX, cursorY);
  const shapes = gridCells.get(key) || [];
  shapes.push(activeShape);
  gridCells.set(key, shapes);
  saveGrid();
  playCell(cursorX, cursorY, true);
  renderGrid({ focus });
  setStatus(
    `${shapeLabel(activeShape)} plotted at x ${cursorX}, y ${cursorY}.`,
    describeShapes(shapes),
  );
}

function eraseAtCursor(focus = false) {
  const removed = gridCells.delete(pointKey(cursorX, cursorY));
  saveGrid();
  playCell(cursorX, cursorY);
  renderGrid({ focus });
  setStatus(
    removed
      ? `Cleared x ${cursorX}, y ${cursorY}.`
      : `Nothing to erase at x ${cursorX}, y ${cursorY}.`,
    "The position tone has been played.",
  );
}

function selectShape(shape, interfaceType = "keyboard") {
  activeShape = shape;
  mobileShapeSelect.value = shape;
  mobilePlotButton.textContent = `Plot ${shape}`;
  setStatus(
    `${shapeLabel(activeShape)} selected.`,
    interfaceType === "mobile"
      ? `Use Plot ${shape} to plot it.`
      : "Press Shift whilst in the grid to plot it.",
  );
}

function shapeLabel(shape) {
  return shape[0].toUpperCase() + shape.slice(1);
}

function announceCurrentCell() {
  const shapes = gridCells.get(pointKey(cursorX, cursorY)) || [];
  setStatus(`x ${cursorX}, y ${cursorY}.`, describeShapes(shapes));
}

function setStatus(title, detail) {
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
  statusDetail.hidden = !detail;
}

function clearGrid() {
  if (
    !window.confirm(
      "Clear every plotted shape from this map? This cannot be undone unless you saved a JSON copy.",
    )
  ) {
    return;
  }
  cancelPlayback();
  gridCells = new Map();
  cursorX = 0;
  cursorY = 0;
  saveGrid();
  renderGrid();
  setStatus("The map is clear. x 0, y 0.", "");
}

async function importProject() {
  const [file] = importInput.files;
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    setPoints(normalisePoints(data));
    cursorX = 0;
    cursorY = 0;
    saveGrid();
    renderGrid();
    setStatus(
      `Opened ${file.name}.`,
      `The map contains ${projectPoints().length} plotted cells.`,
    );
  } catch (error) {
    setStatus(
      "Robin could not open that file.",
      error.message || "The JSON project is not valid.",
    );
  } finally {
    importInput.value = "";
  }
}

function exportProject() {
  saveGrid();
  const data = JSON.stringify({ points: projectPoints() }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "robin-project.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Saved robin-project.json.", "Your map is ready to keep or share.");
}

function bindEvents() {
  document.querySelector("#clear-grid").addEventListener("click", clearGrid);
  document.querySelector("#export-project").addEventListener("click", exportProject);
  importInput.addEventListener("change", importProject);
  document.querySelectorAll("[data-move-x]").forEach((button) => {
    button.addEventListener("click", () => {
      moveCursor(
        Number(button.dataset.moveX),
        Number(button.dataset.moveY),
        "move",
        false,
      );
    });
  });
  mobileShapeSelect.addEventListener("change", () => {
    selectShape(mobileShapeSelect.value, "mobile");
  });
  mobilePlotButton.addEventListener("click", () => addShapeAtCursor(false));
  document
    .querySelector("#mobile-erase")
    .addEventListener("click", () => eraseAtCursor(false));
  document.querySelectorAll("[data-mobile-playback]").forEach((button) => {
    button.addEventListener("click", () => {
      runPlayback(button.dataset.mobilePlayback);
    });
  });
  window.addEventListener("keydown", handleKeyDown);
}

function handleKeyDown(event) {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement
  ) {
    return;
  }

  const directions = {
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  const inGrid = event.target instanceof Element && event.target.closest("#sound-grid");

  if (directions[event.key]) {
    event.preventDefault();
    const [dx, dy] = directions[event.key];
    moveCursor(dx, dy, event.shiftKey ? "draw" : "move");
    return;
  }

  if (event.key === "Shift" && !event.repeat && inGrid) {
    event.preventDefault();
    addShapeAtCursor(true);
  } else if (event.key === "Backspace" && !event.repeat && inGrid) {
    event.preventDefault();
    eraseAtCursor(true);
  } else if (shapeForKey(event.key)) {
    event.preventDefault();
    selectShape(shapeForKey(event.key));
  } else if (["1", "2", "3", "4"].includes(event.key)) {
    event.preventDefault();
    const kinds = { 1: "row", 2: "column", 3: "columns", 4: "rows" };
    runPlayback(kinds[event.key]);
  }
}

function shapeForKey(key) {
  return {
    s: "square",
    c: "circle",
    t: "triangle",
    d: "diamond",
  }[key.toLowerCase()];
}

function rowFrequency(y) {
  return ROOT_FREQUENCY * 2 ** (PENTATONIC_STEPS[y - GRID_MIN] / 12);
}

function rowPitchRatio(y) {
  const centreStep = PENTATONIC_STEPS[-GRID_MIN];
  return 2 ** ((PENTATONIC_STEPS[y - GRID_MIN] - centreStep) / 12);
}

function columnPan(x) {
  return x / GRID_MAX;
}

function ensureAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    setStatus(
      "Audio is unavailable.",
      "This browser does not support the Web Audio API.",
    );
    return null;
  }
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function createPannedOutput(x) {
  const audio = ensureAudio();
  if (!audio) return null;
  const output = audio.createGain();
  output.gain.value = 0.72;

  if (typeof audio.createStereoPanner === "function") {
    const panner = audio.createStereoPanner();
    panner.pan.value = columnPan(x);
    output.connect(panner);
    panner.connect(audio.destination);
  } else {
    output.connect(audio.destination);
  }
  return output;
}

function scheduleTone(output, frequency, start, duration, volume, options = {}) {
  const audio = ensureAudio();
  if (!audio || !output) return;
  const {
    attack = 0.015,
    release = Math.min(duration * 0.45, 0.12),
  } = options;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const end = start + duration;
  const attackEnd = Math.min(end, start + attack);
  const releaseStart = Math.max(attackEnd, end - release);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), attackEnd);
  gain.gain.setValueAtTime(Math.max(volume, 0.0002), releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function scheduleHarmonicTone(output, frequency, start, duration, volume) {
  scheduleTone(output, frequency, start, duration, volume);
  scheduleTone(output, frequency * 2, start, duration, volume * 0.3);
  scheduleTone(output, frequency * 3, start, duration, volume * 0.15);
}

function scheduleClick(output, start) {
  const audio = ensureAudio();
  if (!audio || !output) return;
  const length = Math.floor(audio.sampleRate * 0.018);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / length);
  }
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.09;
  source.connect(gain);
  gain.connect(output);
  source.start(start);
}

function scheduleShape(output, shape, pitchRatio, start) {
  if (shape === "square") {
    scheduleHarmonicTone(output, 400 * pitchRatio, start, 0.05, 0.28);
    scheduleHarmonicTone(output, 400 * pitchRatio, start + 0.07, 0.05, 0.28);
  } else if (shape === "circle") {
    scheduleTone(output, 600 * pitchRatio, start, 0.26, 0.25, {
      attack: 0.065,
      release: 0.13,
    });
  } else if (shape === "triangle") {
    [500, 650, 800].forEach((frequency, index) => {
      scheduleHarmonicTone(
        output,
        frequency * pitchRatio,
        start + index * 0.06,
        0.05,
        0.24,
      );
    });
  } else if (shape === "diamond") {
    [1600, 2200, 1800, 2400].forEach((frequency, index) => {
      scheduleTone(
        output,
        frequency * pitchRatio,
        start + index * 0.065,
        0.05,
        0.16,
        { attack: 0.003, release: 0.035 },
      );
      scheduleTone(
        output,
        frequency * pitchRatio * 2,
        start + index * 0.065,
        0.05,
        0.035,
        { attack: 0.003, release: 0.035 },
      );
    });
  }
}

function playCell(x, y, drawing = false) {
  const audio = ensureAudio();
  if (!audio) return;
  const output = createPannedOutput(x);
  const start = audio.currentTime + 0.01;
  scheduleHarmonicTone(output, rowFrequency(y), start, 0.22, 0.3);
  for (const shape of gridCells.get(pointKey(x, y)) || []) {
    scheduleShape(output, shape, rowPitchRatio(y), start);
  }
  if (drawing) scheduleClick(output, start);
}

function playPlottedCell(x, y) {
  const shapes = gridCells.get(pointKey(x, y));
  if (!shapes?.length) return;
  const audio = ensureAudio();
  if (!audio) return;
  const output = createPannedOutput(x);
  const start = audio.currentTime + 0.01;
  for (const shape of shapes) {
    scheduleShape(output, shape, rowPitchRatio(y), start);
  }
}

function cancelPlayback() {
  playbackToken += 1;
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runPlayback(kind) {
  cancelPlayback();
  const token = playbackToken;
  const messages = {
    row: "Playing the current row from left to right.",
    column: "Playing the current column from bottom to top.",
    columns: "Playing plotted shapes by column.",
    rows: "Playing plotted shapes by row.",
  };
  setStatus(messages[kind], "Use an arrow key in the grid to stop.");

  if (kind === "row") {
    for (let x = GRID_MIN; x <= GRID_MAX && token === playbackToken; x += 1) {
      cursorX = x;
      playCell(x, cursorY);
      renderGrid();
      await delay(110);
    }
  } else if (kind === "column") {
    for (let y = GRID_MIN; y <= GRID_MAX && token === playbackToken; y += 1) {
      cursorY = y;
      playCell(cursorX, y);
      renderGrid();
      await delay(110);
    }
  } else if (kind === "columns") {
    for (let x = GRID_MIN; x <= GRID_MAX && token === playbackToken; x += 1) {
      cursorX = x;
      for (let y = GRID_MIN; y <= GRID_MAX; y += 1) playPlottedCell(x, y);
      renderGrid();
      await delay(160);
    }
  } else if (kind === "rows") {
    for (let y = GRID_MIN; y <= GRID_MAX && token === playbackToken; y += 1) {
      cursorY = y;
      for (let x = GRID_MIN; x <= GRID_MAX; x += 1) playPlottedCell(x, y);
      renderGrid();
      await delay(160);
    }
  }

  if (token === playbackToken) {
    setStatus("Playback complete.", `x ${cursorX}, y ${cursorY}.`);
  }
}
