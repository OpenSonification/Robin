"use strict";

const GRID_MIN = -5;
const GRID_MAX = 5;
const GRID_COUNT = 11;
const ROOT_FREQUENCY = 130.81;
const TOP_TRIM = 0.97;
const PENTATONIC_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const CELL_TONE_DURATION = 0.22;
const DESKTOP_CELL_TONE_VOLUME = 0.3;
const TOUCH_CELL_TONE_VOLUME = 0.42;
const TOUCH_EVENT_DEDUPLICATION_MS = 500;
const DIRECT_DOUBLE_TAP_MS = 450;
const VALID_SHAPES = ["square", "circle", "triangle", "diamond"];
const SHAPE_SYMBOLS = {
  square: "□",
  circle: "○",
  triangle: "△",
  diamond: "◇",
};
// Every page load starts with two contrasting points so the map is immediately
// visible and sonically explorable. Browser state is deliberately not saved.
const demoPoints = [
  { x: -2, y: -2, shapes: ["square"] },
  { x: 2, y: 2, shapes: ["circle"] },
];

const grid = document.querySelector("#sound-grid");
const gridHelp = document.querySelector("#grid-help");
const importInputs = [...document.querySelectorAll("[data-import-project]")];
const statusTitles = [...document.querySelectorAll("[data-status-title]")];
const statusDetails = [...document.querySelectorAll("[data-status-detail]")];
const cursorXOutput = document.querySelector("#cursor-x");
const cursorYOutput = document.querySelector("#cursor-y");
const audioStartButton = document.querySelector("#audio-start");
const touchShapeSelect = document.querySelector("#touch-shape");
const touchPlotButton = document.querySelector("#touch-plot");
const blackoutToggleButtons = [
  ...document.querySelectorAll("[data-blackout-toggle]"),
];
const blackoutScreen = document.querySelector("#blackout-screen");
const touchInterfaceQuery = window.matchMedia(
  "(hover: none) and (pointer: coarse)",
);
const appleTouchDevice =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let gridCells = new Map();
let cursorX = 0;
let cursorY = 0;
let activeShape = "circle";
let audioContext = null;
let audioResumePromise = null;
let audioUnlocked = false;
let playbackToken = 0;
let blackout = false;
let lastTouchExplorationKey = null;
let lastTouchExplorationAt = 0;
let directTouchStartKey = null;
let directTouchCurrentKey = null;
let directTouchMoved = false;
let lastDirectTapKey = null;
let lastDirectTapAt = 0;
let ignorePhysicalClickUntil = 0;
let directTouchAudioPending = false;

setInterfaceMode(shouldUseTouchInterface());
loadInitialGrid();
buildAxes();
bindEvents();
configureGridAccessibility();
renderGrid({ focus: !isTouchInterface() });
announceCurrentCell();

function isTouchInterface() {
  return document.documentElement.dataset.interface === "touch";
}

function setInterfaceMode(touch) {
  document.documentElement.dataset.interface = touch ? "touch" : "desktop";
}

function shouldUseTouchInterface() {
  return touchInterfaceQuery.matches || appleTouchDevice;
}

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
  setPoints(demoPoints);
}

function restoreStarterMap() {
  resetDirectTouchGesture();
  cancelPlayback();
  cursorX = 0;
  cursorY = 0;
  activeShape = "circle";
  touchShapeSelect.value = activeShape;
  touchPlotButton.textContent = "Plot circle";
  setPoints(demoPoints);
  renderGrid({ focus: !isTouchInterface() });
  announceCurrentCell();
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

function configureGridAccessibility() {
  if (isTouchInterface()) {
    // iOS VoiceOver exposes native buttons reliably during touch exploration.
    // Desktop-style ARIA grid semantics and roving tabindex can otherwise make
    // cells with tabindex -1 difficult to discover by touching their location.
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Robin sound map");
    grid.removeAttribute("aria-describedby");
    grid.removeAttribute("aria-rowcount");
    grid.removeAttribute("aria-colcount");
    grid.removeAttribute("aria-keyshortcuts");
    gridHelp.hidden = true;
  } else {
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Robin sound grid");
    grid.setAttribute("aria-describedby", "grid-help");
    grid.setAttribute("aria-rowcount", String(GRID_COUNT));
    grid.setAttribute("aria-colcount", String(GRID_COUNT));
    grid.setAttribute(
      "aria-keyshortcuts",
      "ArrowUp ArrowDown ArrowLeft ArrowRight Shift Backspace S C T D 1 2 3 4 Space",
    );
    gridHelp.hidden = false;
  }
}

function renderGrid(options = {}) {
  const { focus = false } = options;
  const touchGrid = isTouchInterface();
  const fragment = document.createDocumentFragment();

  for (let y = GRID_MAX; y >= GRID_MIN; y -= 1) {
    const row = document.createElement("div");
    row.className = "grid-row";
    if (!touchGrid) {
      row.setAttribute("role", "row");
      row.setAttribute("aria-rowindex", String(GRID_MAX - y + 1));
    }

    for (let x = GRID_MIN; x <= GRID_MAX; x += 1) {
      const shapes = gridCells.get(pointKey(x, y)) || [];
      const current = x === cursorX && y === cursorY;
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.tabIndex = touchGrid || current ? 0 : -1;
      if (!touchGrid) {
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-colindex", String(x - GRID_MIN + 1));
      }
      cell.setAttribute("aria-label", cellLabel(x, y, shapes));
      if (current) {
        cell.classList.add("is-current");
        if (!touchGrid) cell.setAttribute("aria-current", "true");
      }
      if (x === 0) cell.classList.add("on-y-axis");
      if (y === 0) cell.classList.add("on-x-axis");

      renderCellShapes(cell, shapes);

      if (touchGrid) {
        const exploreCell = () => focusTouchCell(x, y);
        cell.addEventListener("focus", exploreCell);
        // VoiceOver navigation and direct touch do not produce exactly the
        // same DOM events across WebKit versions. These redundant, read-only
        // exploration handlers improve coverage without changing activation.
        // Direct double-tap and synthesized activation are handled separately.
        cell.addEventListener("pointerenter", exploreCell);
        cell.addEventListener("mouseover", exploreCell);
        cell.addEventListener(
          "touchstart",
          (event) => beginDirectTouch(event, x, y),
          { passive: false },
        );
        cell.addEventListener("click", (event) => {
          handleTouchCellClick(event, x, y);
        });
      } else {
        cell.addEventListener("click", () => selectCell(x, y));
      }
      row.append(cell);
    }
    fragment.append(row);
  }

  grid.replaceChildren(fragment);
  cursorXOutput.textContent = cursorX;
  cursorYOutput.textContent = cursorY;
  if (focus) focusCurrentCell();
}

function renderCellShapes(cell, shapes) {
  cell.replaceChildren();
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
}

function cellLabel(x, y, shapes) {
  // Keep native buttons so VoiceOver can reliably discover and activate each
  // touch cell, but leave their name empty: Robin's audio communicates the
  // cell position and contents without spoken coordinates or "Sound".
  if (isTouchInterface()) return "";

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

function uniqueShapes(shapes) {
  return [...new Set(shapes)];
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
  if (isTouchInterface()) {
    updateRenderedCursor();
  } else {
    renderGrid({ focus: true });
  }
  announceCurrentCell();
}

function focusTouchCell(x, y, options = {}) {
  const {
    immediate = false,
    unlockAudio = false,
    playAudio = true,
  } = options;
  const key = pointKey(x, y);
  const now = performance.now();
  if (
    !immediate &&
    key === lastTouchExplorationKey &&
    now - lastTouchExplorationAt < TOUCH_EVENT_DEDUPLICATION_MS
  ) {
    return;
  }
  lastTouchExplorationKey = key;
  lastTouchExplorationAt = now;

  cancelPlayback();
  cursorX = x;
  cursorY = y;
  updateRenderedCursor();
  if (immediate) {
    if (!playAudio) return;
    if (unlockAudio) {
      playDirectTouchCell(x, y);
    } else {
      playCell(x, y);
    }
    return;
  }

  // iOS can send hover/focus-style events immediately before the real
  // touchstart. Those events do not carry the tap's audio permission, so an
  // attempted resume here can remain pending and prevent touchstart from
  // performing the valid unlock. VoiceOver users start audio once with the
  // dedicated button; sighted first-touch unlock is handled by touchstart.
  if (!audioUnlocked && audioContext?.state !== "running") return;

  // Use the same immediate cell-audio path as a direct touch. This schedules
  // the tone at the instant VoiceOver moves focus, and also retries a paused
  // iOS AudioContext instead of silently dropping the focus sound.
  playDirectTouchCell(x, y);
}

function playDirectTouchCell(x, y) {
  const audio = ensureAudio();
  if (!audio) return;
  if (audio.state === "running") {
    scheduleCellAudio(audio, x, y);
    return;
  }

  // iOS WebKit may resolve AudioContext.resume() after the original touch has
  // lost its user-activation allowance. Queue the audible nodes synchronously
  // inside touchstart, then resume the context; they play when it starts.
  if (directTouchAudioPending) return;
  directTouchAudioPending = true;
  const resumeRequest = resumeAudioContext(audio);
  scheduleCellAudio(audio, x, y);
  resumeRequest.then((runningAudio) => {
    directTouchAudioPending = false;
    if (!runningAudio) {
      setStatus(
        "Robin audio needs another touch.",
        "Touch a cell again or activate Start Robin audio.",
      );
    }
  });
}

function beginDirectTouch(event, x, y) {
  if (event.touches.length !== 1) return;
  event.preventDefault();
  const now = performance.now();
  directTouchStartKey = pointKey(x, y);
  directTouchCurrentKey = directTouchStartKey;
  directTouchMoved = false;
  ignorePhysicalClickUntil = now + DIRECT_DOUBLE_TAP_MS * 2;
  const completingDoubleTap =
    directTouchStartKey === lastDirectTapKey &&
    now - lastDirectTapAt <= DIRECT_DOUBLE_TAP_MS;
  const precedingExplorationPlayed =
    audioContext?.state === "running" &&
    directTouchStartKey === lastTouchExplorationKey &&
    now - lastTouchExplorationAt < TOUCH_EVENT_DEDUPLICATION_MS;
  focusTouchCell(x, y, {
    immediate: true,
    unlockAudio: true,
    playAudio: !completingDoubleTap && !precedingExplorationPlayed,
  });
}

function handleDirectTouchMove(event) {
  if (directTouchStartKey === null || event.touches.length !== 1) return;
  event.preventDefault();
  const touch = event.touches[0];
  const cell = document
    .elementFromPoint(touch.clientX, touch.clientY)
    ?.closest(".grid-cell");
  if (!cell || !grid.contains(cell)) {
    directTouchMoved = true;
    return;
  }

  const key = pointKey(Number(cell.dataset.x), Number(cell.dataset.y));
  if (key === directTouchCurrentKey) return;
  directTouchCurrentKey = key;
  if (key !== directTouchStartKey) directTouchMoved = true;
  focusTouchCell(Number(cell.dataset.x), Number(cell.dataset.y), {
    immediate: true,
    unlockAudio: true,
  });
}

function handleDirectTouchEnd(event) {
  if (directTouchStartKey === null) return;
  event.preventDefault();
  const completedKey = directTouchCurrentKey;
  const wasTap = !directTouchMoved && completedKey === directTouchStartKey;
  resetDirectTouchGesture();
  if (!wasTap) {
    lastDirectTapKey = null;
    lastDirectTapAt = 0;
    return;
  }

  const now = performance.now();
  if (
    completedKey === lastDirectTapKey &&
    now - lastDirectTapAt <= DIRECT_DOUBLE_TAP_MS
  ) {
    lastDirectTapKey = null;
    lastDirectTapAt = 0;
    const [x, y] = completedKey.split(",").map(Number);
    activateTouchCell(x, y);
  } else {
    lastDirectTapKey = completedKey;
    lastDirectTapAt = now;
  }
}

function resetDirectTouchGesture() {
  directTouchStartKey = null;
  directTouchCurrentKey = null;
  directTouchMoved = false;
}

function handleTouchCellClick(event, x, y) {
  // A physical iOS tap is handled by the touch sequence above. VoiceOver and
  // keyboard activation instead synthesize a click, which must still plot.
  if (event.detail > 0 && performance.now() < ignorePhysicalClickUntil) {
    event.preventDefault();
    return;
  }
  activateTouchCell(x, y);
}

function activateTouchCell(x, y) {
  cursorX = x;
  cursorY = y;
  updateRenderedCursor();
  addShapeAtCursor(false);
}

function updateRenderedCursor() {
  grid.querySelectorAll(".grid-cell").forEach((cell) => {
    const current =
      Number(cell.dataset.x) === cursorX && Number(cell.dataset.y) === cursorY;
    cell.classList.toggle("is-current", current);
    if (current && !isTouchInterface()) {
      cell.setAttribute("aria-current", "true");
    } else {
      cell.removeAttribute("aria-current");
    }
  });
  cursorXOutput.textContent = cursorX;
  cursorYOutput.textContent = cursorY;
}

function updateRenderedCell(x, y) {
  const cell = grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return;
  const shapes = gridCells.get(pointKey(x, y)) || [];
  cell.setAttribute("aria-label", cellLabel(x, y, shapes));
  renderCellShapes(cell, shapes);
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
  playCell(cursorX, cursorY, true);
  if (isTouchInterface()) {
    updateRenderedCell(cursorX, cursorY);
  } else {
    renderGrid({ focus });
  }
  setStatus(
    `${shapeLabel(activeShape)} plotted at x ${cursorX}, y ${cursorY}.`,
    describeShapes(shapes),
  );
}

function eraseAtCursor(focus = false) {
  const key = pointKey(cursorX, cursorY);
  const shapes = gridCells.get(key);
  const removedShape = shapes?.pop();
  if (shapes && !shapes.length) gridCells.delete(key);
  if (removedShape) playBin(cursorX);
  playCell(cursorX, cursorY);
  if (isTouchInterface()) {
    updateRenderedCell(cursorX, cursorY);
  } else {
    renderGrid({ focus });
  }
  setStatus(
    removedShape
      ? `${shapeLabel(removedShape)} removed from x ${cursorX}, y ${cursorY}.`
      : `Nothing to erase at x ${cursorX}, y ${cursorY}.`,
    shapes?.length ? describeShapes(shapes) : "",
  );
}

function selectShape(shape, interfaceType = "keyboard") {
  activeShape = shape;
  touchShapeSelect.value = shape;
  touchPlotButton.textContent = `Plot ${shape}`;
  setStatus(
    `${shapeLabel(activeShape)} selected.`,
    interfaceType === "touch"
      ? `Double-tap a focused cell or use Plot ${shape}.`
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
  statusTitles.forEach((element) => {
    element.textContent = title;
  });
  statusDetails.forEach((element) => {
    element.textContent = detail;
    element.hidden = !detail;
  });
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
  renderGrid();
  setStatus(
    "The map is clear for this session. x 0, y 0.",
    "Reload the page to restore the starter example.",
  );
}

async function importProject(event) {
  const input = event.currentTarget;
  const [file] = input.files;
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    setPoints(normalisePoints(data));
    cursorX = 0;
    cursorY = 0;
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
    input.value = "";
  }
}

function exportProject() {
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
  document.querySelectorAll("[data-clear-grid]").forEach((button) => {
    button.addEventListener("click", clearGrid);
  });
  document.querySelectorAll("[data-export-project]").forEach((button) => {
    button.addEventListener("click", exportProject);
  });
  audioStartButton.addEventListener("click", startAudio);
  importInputs.forEach((input) => {
    input.addEventListener("change", importProject);
  });
  touchShapeSelect.addEventListener("change", () => {
    selectShape(touchShapeSelect.value, "touch");
  });
  touchPlotButton.addEventListener("click", () => addShapeAtCursor(false));
  document
    .querySelector("#touch-erase")
    .addEventListener("click", () => eraseAtCursor(false));
  blackoutToggleButtons.forEach((button) => {
    button.addEventListener("click", toggleBlackout);
  });
  blackoutScreen.addEventListener("click", toggleBlackout);
  document.querySelectorAll("[data-touch-playback]").forEach((button) => {
    button.addEventListener("click", () => {
      runPlayback(button.dataset.touchPlayback);
    });
  });
  grid.addEventListener("touchmove", handleDirectTouchMove, {
    passive: false,
  });
  grid.addEventListener("touchend", handleDirectTouchEnd, {
    passive: false,
  });
  grid.addEventListener("touchcancel", resetDirectTouchGesture);
  const handleTouchInterfaceChange = () => {
    setInterfaceMode(shouldUseTouchInterface());
    configureGridAccessibility();
    renderGrid({ focus: !isTouchInterface() });
  };
  if (typeof touchInterfaceQuery.addEventListener === "function") {
    touchInterfaceQuery.addEventListener("change", handleTouchInterfaceChange);
  } else {
    touchInterfaceQuery.addListener(handleTouchInterfaceChange);
  }
  document.addEventListener("visibilitychange", recoverInterruptedAudio);
  window.addEventListener("pageshow", (event) => {
    recoverInterruptedAudio();
    // iOS WebKit can restore a complete page from its back-forward cache
    // without rerunning the script. Discard that preserved session map too.
    if (event.persisted) restoreStarterMap();
  });
  window.addEventListener("keydown", handleKeyDown);
}

function handleKeyDown(event) {
  if (isTouchInterface()) return;

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
  } else if (event.code === "Space" && inGrid) {
    event.preventDefault();
    toggleBlackout();
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
  const ratio = 2 ** ((PENTATONIC_STEPS[y - GRID_MIN] - centreStep) / 12);
  return y === GRID_MAX ? ratio * TOP_TRIM : ratio;
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
  if (!audioContext || audioContext.state === "closed") {
    const createdAudio = new AudioContext();
    audioContext = createdAudio;
    createdAudio.addEventListener("statechange", () => {
      // Some WebKit versions report the running state just after resume()'s
      // promise settles. The state event is the authoritative point at which
      // later VoiceOver focus events may safely reuse the unlocked context.
      if (createdAudio.state === "running") audioUnlocked = true;
      updateAudioStartButton();
    });
  }
  return audioContext;
}

function primeAudioContext(audio) {
  // Starting a silent one-sample source inside the user's button/key gesture
  // makes iOS WebKit's audio unlock more reliable without producing a sound.
  const buffer = audio.createBuffer(1, 1, audio.sampleRate);
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  gain.gain.value = 0;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audio.destination);
  source.start();
}

async function resumeAudioContext(audio = ensureAudio()) {
  if (!audio) return null;
  if (audio.state === "running") {
    audioUnlocked = true;
    updateAudioStartButton();
    return audio;
  }
  if (audio.state === "closed") return null;
  if (audioResumePromise) return audioResumePromise;

  try {
    primeAudioContext(audio);
  } catch {
    // The silent primer is an iOS compatibility aid; resume can still work
    // without it in browsers that reject a source while interrupted.
  }

  let resumeRequest;
  try {
    resumeRequest = audio.resume();
  } catch {
    updateAudioStartButton();
    return null;
  }
  audioResumePromise = resumeRequest
    .then(() => {
      if (audio.state !== "running") return null;
      audioUnlocked = true;
      updateAudioStartButton();
      return audio;
    })
    .catch(() => null)
    .finally(() => {
      audioResumePromise = null;
    });
  return audioResumePromise;
}

function withRunningAudio(schedule) {
  const audio = ensureAudio();
  if (!audio) return;
  if (audio.state === "running") {
    schedule(audio);
    return;
  }

  // On touch browsers, Start Robin audio must be activated once by the user.
  // Do not leave unresolved resume requests behind while VoiceOver explores.
  if (isTouchInterface() && !audioUnlocked) return;
  resumeAudioContext(audio).then((runningAudio) => {
    if (runningAudio) schedule(runningAudio);
  });
}

function recoverInterruptedAudio() {
  if (
    document.visibilityState === "hidden" ||
    !audioUnlocked ||
    !audioContext
  ) {
    return;
  }
  if (audioContext.state !== "running") {
    resumeAudioContext(audioContext);
  } else {
    updateAudioStartButton();
  }
}

async function startAudio() {
  const audio = ensureAudio();
  if (!audio) return;
  const runningAudio = await resumeAudioContext(audio);
  if (runningAudio) {
    scheduleCellAudio(runningAudio, cursorX, cursorY);
    setStatus(
      "Robin audio is on.",
      "Every cell, including an empty one, now plays when VoiceOver reaches it.",
    );
  } else {
    setStatus(
      "Robin could not start audio.",
      "Try activating Start Robin audio again.",
    );
  }
}

function updateAudioStartButton() {
  if (!audioStartButton) return;
  if (audioContext?.state === "running") {
    audioStartButton.textContent = "Replay focused cell";
    audioStartButton.setAttribute(
      "aria-label",
      "Robin audio is on. Replay focused cell",
    );
  } else if (audioUnlocked) {
    audioStartButton.textContent = "Resume Robin audio";
    audioStartButton.setAttribute("aria-label", "Resume Robin audio");
  } else {
    audioStartButton.textContent = "Start Robin audio";
    audioStartButton.setAttribute("aria-label", "Start Robin audio");
  }
}

function createPannedOutput(x, audio) {
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
  if (!output) return;
  const audio = output.context;
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
  if (!output) return;
  const audio = output.context;
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

function playBin(x) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(x, audio);
    const start = audio.currentTime + 0.01;
    scheduleTone(output, 90, start, 0.09, 0.28, {
      attack: 0.003,
      release: 0.055,
    });

    const length = Math.floor(audio.sampleRate * 0.05);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.12;
    source.connect(gain);
    gain.connect(output);
    source.start(start + 0.1);
  });
}

function playToggleSound(turningOff) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(0, audio);
    const start = audio.currentTime + 0.01;
    const first = turningOff ? 500 : 260;
    const second = turningOff ? 260 : 500;
    scheduleTone(output, first, start, 0.07, 0.24, {
      attack: 0.003,
      release: 0.04,
    });
    scheduleTone(output, second, start + 0.08, 0.09, 0.24, {
      attack: 0.003,
      release: 0.055,
    });
  });
}

function toggleBlackout() {
  blackout = !blackout;
  blackoutScreen.hidden = !blackout;
  blackoutToggleButtons.forEach((button) => {
    button.textContent = blackout ? "Turn screen on" : "Turn screen off";
  });
  playToggleSound(blackout);
  setStatus(
    blackout ? "Screen off." : "Screen on.",
    blackout
      ? isTouchInterface()
        ? "Tap the screen to restore it."
        : "Press Space or click the screen to restore it."
      : "",
  );
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
  withRunningAudio((audio) => scheduleCellAudio(audio, x, y, drawing));
}

function scheduleCellAudio(audio, x, y, drawing = false) {
  const output = createPannedOutput(x, audio);
  const start = audio.currentTime + 0.01;
  // This row tone is always present. Empty cells play just this sound; plotted
  // cells layer their shape sounds over it, matching desktop cell_stereo().
  scheduleHarmonicTone(
    output,
    rowFrequency(y),
    start,
    CELL_TONE_DURATION,
    isTouchInterface()
      ? TOUCH_CELL_TONE_VOLUME
      : DESKTOP_CELL_TONE_VOLUME,
  );
  for (const shape of uniqueShapes(gridCells.get(pointKey(x, y)) || [])) {
    scheduleShape(output, shape, rowPitchRatio(y), start);
  }
  if (drawing) scheduleClick(output, start);
}

function playPlottedCell(x, y) {
  const shapes = gridCells.get(pointKey(x, y));
  if (!shapes?.length) return;
  withRunningAudio((audio) => {
    const output = createPannedOutput(x, audio);
    const start = audio.currentTime + 0.01;
    for (const shape of uniqueShapes(shapes)) {
      scheduleShape(output, shape, rowPitchRatio(y), start);
    }
  });
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
  const runningAudio = await resumeAudioContext();
  if (!runningAudio) {
    setStatus(
      "Robin audio is off.",
      "Activate Start Robin audio, then try this action again.",
    );
    return;
  }
  const messages = {
    row: "Playing the current row from left to right.",
    column: "Playing the current column from bottom to top.",
    columns: "Playing plotted shapes by column.",
    rows: "Playing plotted shapes by row.",
  };
  setStatus(
    messages[kind],
    isTouchInterface()
      ? "Focus another cell to stop."
      : "Use an arrow key in the grid to stop.",
  );

  if (kind === "row") {
    for (let x = GRID_MIN; x <= GRID_MAX && token === playbackToken; x += 1) {
      cursorX = x;
      playCell(x, cursorY);
      renderPlaybackCursor();
      await delay(110);
    }
  } else if (kind === "column") {
    for (let y = GRID_MIN; y <= GRID_MAX && token === playbackToken; y += 1) {
      cursorY = y;
      playCell(cursorX, y);
      renderPlaybackCursor();
      await delay(110);
    }
  } else if (kind === "columns") {
    for (let x = GRID_MIN; x <= GRID_MAX && token === playbackToken; x += 1) {
      cursorX = x;
      for (let y = GRID_MIN; y <= GRID_MAX; y += 1) playPlottedCell(x, y);
      renderPlaybackCursor();
      await delay(160);
    }
  } else if (kind === "rows") {
    for (let y = GRID_MIN; y <= GRID_MAX && token === playbackToken; y += 1) {
      cursorY = y;
      for (let x = GRID_MIN; x <= GRID_MAX; x += 1) playPlottedCell(x, y);
      renderPlaybackCursor();
      await delay(160);
    }
  }

  if (token === playbackToken) {
    setStatus("Playback complete.", `x ${cursorX}, y ${cursorY}.`);
  }
}

function renderPlaybackCursor() {
  if (isTouchInterface()) {
    updateRenderedCursor();
  } else {
    renderGrid();
  }
}
