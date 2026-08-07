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
const DIRECT_DOUBLE_TAP_MS = 450;
const PHYSICAL_POINTER_CLICK_MS = 900;
const VOICEOVER_CELL_TONE_DELAY_MS = 1800;
const VOICEOVER_ROTOR_ACTION_IDS = [
  "voiceover-action-delete",
  "voiceover-action-play-row",
  "voiceover-action-play-column",
  "voiceover-action-sweep-columns",
  "voiceover-action-sweep-rows",
];
const VOICEOVER_ROTOR_ACTIONS = VOICEOVER_ROTOR_ACTION_IDS.join(" ");
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
const touchShapeSelects = [...document.querySelectorAll("[data-touch-shape]")];
const touchPlotButtons = [...document.querySelectorAll("[data-touch-plot]")];
const touchEraseButtons = [...document.querySelectorAll("[data-touch-erase]")];
const voiceOverActionButtons = [
  ...document.querySelectorAll("[data-voiceover-action]"),
];
const voiceOverModeToggle = document.querySelector("#voiceover-mode-toggle");
const voiceOverActions = document.querySelector("#voiceover-actions");
const voiceOverSelectedAction = document.querySelector(
  "#voiceover-selected-action",
);
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
let voiceOverMode = false;
let selectedVoiceOverActionButton = null;
let focusPlaybackTimer = null;
let delayedCellOutput = null;
let delayedCellOutputCleanupTimer = null;
let directTouchStartKey = null;
let directTouchCurrentKey = null;
let directTouchMoved = false;
let lastDirectTapKey = null;
let lastDirectTapAt = 0;
let ignorePhysicalClickUntil = 0;
let lastPhysicalPointerKey = null;
let lastPhysicalPointerAt = 0;
let directTouchAudioPending = false;

setInterfaceMode(shouldUseTouchInterface());
syncVoiceOverMode();
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

function isVoiceOverMode() {
  return isTouchInterface() && voiceOverMode;
}

function syncVoiceOverMode() {
  document.documentElement.dataset.voiceover = voiceOverMode ? "on" : "off";
  voiceOverModeToggle.setAttribute("aria-pressed", String(voiceOverMode));
  voiceOverModeToggle.textContent = voiceOverMode
    ? "Turn off VoiceOver controls"
    : "Turn on VoiceOver controls";
  voiceOverActions.hidden = !voiceOverMode;
  voiceOverActionButtons.forEach((button) => {
    button.tabIndex = voiceOverMode ? 0 : -1;
  });
  if (voiceOverMode) {
    selectVoiceOverAction(voiceOverActionButtons[0]);
  } else {
    clearSelectedVoiceOverAction();
  }
}

function selectVoiceOverAction(button) {
  if (!button) return;
  selectedVoiceOverActionButton = button;
  voiceOverActionButtons.forEach((actionButton) => {
    actionButton.classList.toggle(
      "is-selected-action",
      actionButton === button,
    );
  });
  voiceOverSelectedAction.textContent = button.textContent
    .replace(/\s+/g, " ")
    .trim();
}

function clearSelectedVoiceOverAction() {
  selectedVoiceOverActionButton = null;
  voiceOverActionButtons.forEach((button) => {
    button.classList.remove("is-selected-action");
  });
  voiceOverSelectedAction.textContent = "None";
}

function setVoiceOverMode(enabled, options = {}) {
  const { unlockAudio = false } = options;
  voiceOverMode = isTouchInterface() && enabled;
  cancelPendingFocusPlayback();
  cancelPlayback();
  resetDirectTouchGesture();
  lastDirectTapKey = null;
  lastDirectTapAt = 0;
  syncVoiceOverMode();
  configureGridAccessibility();
  updateTouchCellAccessibility();

  if (voiceOverMode && unlockAudio) {
    // iOS requires a real activation before a webpage may start Web Audio.
    // This native button supplies that one-time activation. Cell focus can
    // then remain read-only and play sound without requiring a double-tap.
    resumeAudioContext();
  }
}

function toggleVoiceOverMode() {
  const enabling = !voiceOverMode;
  setVoiceOverMode(enabling, { unlockAudio: enabling });
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
  cancelPendingFocusPlayback();
  resetDirectTouchGesture();
  cancelPlayback();
  cursorX = 0;
  cursorY = 0;
  activeShape = "circle";
  syncTouchShapeControls();
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
    // Native buttons are reliably discoverable by VoiceOver touch exploration.
    // Desktop ARIA grid semantics and roving tabindex can hide cells that are
    // not already focused, so the touch interface deliberately avoids them.
    grid.setAttribute("role", "group");
    grid.setAttribute(
      "aria-label",
      isVoiceOverMode()
        ? "Robin sound map. VoiceOver controls on."
        : "Robin sound map.",
    );
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
      setCellAccessibility(cell, x, y, shapes);
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
        cell.addEventListener("pointerdown", (event) => {
          recordPhysicalPointer(event, x, y);
        });
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
  // Robin's audio communicates position and contents on touch. VoiceOver mode
  // uses one short stable name so the control is intelligible but speech does
  // not repeat coordinates or shapes over the delayed Robin tone.
  if (isTouchInterface()) return isVoiceOverMode() ? "Cell" : "";

  const contents = describeShapes(shapes);
  return contents ? `x ${x}, y ${y}, ${contents}` : `x ${x}, y ${y}`;
}

function setCellAccessibility(cell, x, y, shapes) {
  cell.setAttribute("aria-label", cellLabel(x, y, shapes));
  if (isTouchInterface() && isVoiceOverMode()) {
    // aria-actions is a progressive enhancement. WebKit versions that support
    // it expose these existing buttons as UIAccessibilityCustomAction entries
    // in VoiceOver's Actions rotor. Other browsers ignore the relationship and
    // retain the always-visible button panel as the complete fallback.
    cell.setAttribute("aria-actions", VOICEOVER_ROTOR_ACTIONS);
  } else {
    cell.removeAttribute("aria-actions");
  }
}

function updateTouchCellAccessibility() {
  if (!isTouchInterface()) return;
  grid.querySelectorAll(".grid-cell").forEach((cell) => {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const shapes = gridCells.get(pointKey(x, y)) || [];
    setCellAccessibility(cell, x, y, shapes);
  });
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
    audioDelayMs = 0,
  } = options;
  cancelPlayback();
  cursorX = x;
  cursorY = y;
  updateRenderedCursor();
  cancelPendingFocusPlayback();

  if (isVoiceOverMode() && !immediate) {
    // VoiceOver focus is exploration, not activation. Play every newly focused
    // cell after its brief native "Cell, button" announcement. The mode's
    // explicit start button has already supplied iOS's required audio gesture.
    focusPlaybackTimer = window.setTimeout(() => {
      focusPlaybackTimer = null;
      playDirectTouchCell(x, y);
    }, VOICEOVER_CELL_TONE_DELAY_MS);
    return;
  }

  // Ordinary touch has its own touchstart/move/end path below. A browser focus
  // event generated by the same finger must not add a second tone.
  if (!immediate) return;

  if (!playAudio) return;
  if (unlockAudio) {
    playDirectTouchCell(x, y, audioDelayMs);
  } else {
    playCell(x, y, false, audioDelayMs);
  }
}

function playDirectTouchCell(x, y, audioDelayMs = 0, drawing = false) {
  const audio = ensureAudio();
  if (!audio) return;
  if (audio.state === "running") {
    const output = scheduleCellAudio(audio, x, y, drawing, audioDelayMs);
    trackDelayedCellOutput(output, audioDelayMs);
    return;
  }

  // iOS WebKit may resolve AudioContext.resume() after the original touch has
  // lost its user-activation allowance. Queue the audible nodes synchronously
  // inside the activating touch/click, then resume the context; they play when
  // it starts.
  if (directTouchAudioPending) return;
  directTouchAudioPending = true;
  const resumeRequest = resumeAudioContext(audio);
  const output = scheduleCellAudio(audio, x, y, drawing, audioDelayMs);
  trackDelayedCellOutput(output, audioDelayMs);
  resumeRequest.then((runningAudio) => {
    directTouchAudioPending = false;
    if (!runningAudio) {
      setStatus(
        "Robin audio needs another touch.",
        "Touch the cell again to start its sound.",
      );
    }
  });
}

function beginDirectTouch(event, x, y) {
  if (isVoiceOverMode()) return;
  if (event.touches.length !== 1) return;
  const now = performance.now();
  directTouchStartKey = pointKey(x, y);
  directTouchCurrentKey = directTouchStartKey;
  directTouchMoved = false;
  ignorePhysicalClickUntil = now + DIRECT_DOUBLE_TAP_MS * 2;
  const completingDoubleTap =
    directTouchStartKey === lastDirectTapKey &&
    now - lastDirectTapAt <= DIRECT_DOUBLE_TAP_MS;
  const canPlayImmediately = audioContext?.state === "running";
  focusTouchCell(x, y, {
    immediate: true,
    unlockAudio: canPlayImmediately,
    playAudio: canPlayImmediately && !completingDoubleTap,
  });
}

function handleDirectTouchMove(event) {
  if (isVoiceOverMode()) return;
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
  const canPlayImmediately = audioContext?.state === "running";
  focusTouchCell(Number(cell.dataset.x), Number(cell.dataset.y), {
    immediate: true,
    unlockAudio: canPlayImmediately,
    playAudio: canPlayImmediately,
  });
}

function handleDirectTouchEnd(event) {
  if (isVoiceOverMode()) return;
  if (directTouchStartKey === null) return;
  const completedKey = directTouchCurrentKey;
  const wasTap = !directTouchMoved && completedKey === directTouchStartKey;

  // WebKit treats touchend (rather than touchstart or touchmove) as the
  // explicit activation that is allowed to start media. On the first gesture,
  // create/resume Web Audio and queue the cell tone synchronously here. Once
  // the context is running, beginDirectTouch and handleDirectTouchMove can play
  // immediately for later exploration gestures.
  if (audioContext?.state !== "running" && completedKey) {
    const [x, y] = completedKey.split(",").map(Number);
    focusTouchCell(x, y, { immediate: true, unlockAudio: true });
  }

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

function cancelPendingFocusPlayback() {
  if (focusPlaybackTimer !== null) {
    window.clearTimeout(focusPlaybackTimer);
    focusPlaybackTimer = null;
  }
  if (delayedCellOutput) {
    delayedCellOutput.gain.value = 0;
    delayedCellOutput.disconnect();
    delayedCellOutput = null;
  }
  if (delayedCellOutputCleanupTimer !== null) {
    window.clearTimeout(delayedCellOutputCleanupTimer);
    delayedCellOutputCleanupTimer = null;
  }
}

function trackDelayedCellOutput(output, audioDelayMs) {
  if (!output || audioDelayMs <= 0) return;
  delayedCellOutput = output;
  delayedCellOutputCleanupTimer = window.setTimeout(() => {
    if (delayedCellOutput === output) delayedCellOutput = null;
    delayedCellOutputCleanupTimer = null;
  }, audioDelayMs + 400);
}

function recordPhysicalPointer(event, x, y) {
  if (isVoiceOverMode()) return;
  if (!event.isPrimary) return;
  lastPhysicalPointerKey = pointKey(x, y);
  lastPhysicalPointerAt = performance.now();
}

function isPhysicalPointerClick(event, x, y, now) {
  const key = pointKey(x, y);
  const recentPointer =
    key === lastPhysicalPointerKey &&
    now - lastPhysicalPointerAt <= PHYSICAL_POINTER_CLICK_MS;
  const touchGeneratedClick =
    event.sourceCapabilities?.firesTouchEvents === true;
  if (recentPointer) {
    lastPhysicalPointerKey = null;
    lastPhysicalPointerAt = 0;
  }
  return recentPointer || touchGeneratedClick;
}

function handleTouchCellClick(event, x, y) {
  if (isVoiceOverMode()) {
    event.preventDefault();
    // VoiceOver dispatches the native button activation to the cell carrying
    // accessibility focus. Plot exactly once; focus itself remains read-only.
    activateTouchCell(
      x,
      y,
      VOICEOVER_CELL_TONE_DELAY_MS,
      audioContext?.state !== "running",
    );
    return;
  }

  const now = performance.now();
  const accessibleActivation = event.detail === 0;
  // Most physical taps are handled by touchstart/touchend. Suppress their
  // follow-up click so the same gesture does not plot twice. A zero-detail
  // click is the browser's device-independent activation for VoiceOver or a
  // keyboard, and must not be swallowed even if iOS also emitted touch events.
  if (!accessibleActivation && now < ignorePhysicalClickUntil) {
    event.preventDefault();
    return;
  }

  // A physical pointer that did not produce touch events still needs Robin's
  // sighted first-tap/double-tap fallback. VoiceOver and other non-pointer
  // activation mechanisms intentionally do not fire pointer events, so their
  // synthesized click proceeds directly to the button's plotting action.
  if (!accessibleActivation && isPhysicalPointerClick(event, x, y, now)) {
    event.preventDefault();
    handleClickOnlyTouch(x, y, now);
    return;
  }

  event.preventDefault();
  const unlockAudio = audioContext?.state !== "running";
  activateTouchCell(x, y, 0, unlockAudio);
}

function handleClickOnlyTouch(x, y, now) {
  const key = pointKey(x, y);
  if (
    key === lastDirectTapKey &&
    now - lastDirectTapAt <= DIRECT_DOUBLE_TAP_MS
  ) {
    lastDirectTapKey = null;
    lastDirectTapAt = 0;
    activateTouchCell(x, y);
    return;
  }

  lastDirectTapKey = key;
  lastDirectTapAt = now;
  focusTouchCell(x, y, { immediate: true, unlockAudio: true });
}

function activateTouchCell(
  x,
  y,
  audioDelayMs = 0,
  unlockAudio = false,
) {
  cancelPendingFocusPlayback();
  cursorX = x;
  cursorY = y;
  updateRenderedCursor();
  addShapeAtCursor(false, audioDelayMs, unlockAudio);
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
  setCellAccessibility(cell, x, y, shapes);
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

function addShapeAtCursor(
  focus = false,
  audioDelayMs = 0,
  unlockAudio = false,
) {
  const key = pointKey(cursorX, cursorY);
  const shapes = gridCells.get(key) || [];
  shapes.push(activeShape);
  gridCells.set(key, shapes);
  if (unlockAudio) {
    playDirectTouchCell(cursorX, cursorY, audioDelayMs, true);
  } else {
    playCell(cursorX, cursorY, true, audioDelayMs);
  }
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

function eraseAtCursor(focus = false, audioDelayMs = 0) {
  const key = pointKey(cursorX, cursorY);
  const shapes = gridCells.get(key);
  const removedShape = shapes?.pop();
  if (shapes && !shapes.length) gridCells.delete(key);
  if (removedShape) playBin(cursorX, audioDelayMs);
  playCell(cursorX, cursorY, false, audioDelayMs);
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
  syncTouchShapeControls();
  setStatus(
    `${shapeLabel(activeShape)} selected.`,
    interfaceType === "touch"
      ? `Double-tap a focused cell or use Plot ${shape}.`
      : "Press Shift whilst in the grid to plot it.",
  );
}

function syncTouchShapeControls() {
  touchShapeSelects.forEach((select) => {
    select.value = activeShape;
  });
  touchPlotButtons.forEach((button) => {
    button.textContent = `Plot ${activeShape}`;
  });
  if (selectedVoiceOverActionButton) {
    selectVoiceOverAction(selectedVoiceOverActionButton);
  }
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
  importInputs.forEach((input) => {
    input.addEventListener("change", importProject);
  });
  voiceOverActionButtons.forEach((button) => {
    button.addEventListener("focus", () => {
      cancelPendingFocusPlayback();
      selectVoiceOverAction(button);
    });
    button.addEventListener("click", () => selectVoiceOverAction(button));
  });
  touchShapeSelects.forEach((select) => {
    select.addEventListener("change", () => {
      selectShape(select.value, "touch");
    });
  });
  touchPlotButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const voiceOverAction =
        isVoiceOverMode() && button.hasAttribute("data-voiceover-action");
      if (voiceOverAction) cancelPendingFocusPlayback();
      addShapeAtCursor(
        false,
        voiceOverAction ? VOICEOVER_CELL_TONE_DELAY_MS : 0,
        audioContext?.state !== "running",
      );
    });
  });
  touchEraseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const voiceOverAction =
        isVoiceOverMode() && button.hasAttribute("data-voiceover-action");
      if (voiceOverAction) cancelPendingFocusPlayback();
      eraseAtCursor(
        false,
        voiceOverAction ? VOICEOVER_CELL_TONE_DELAY_MS : 0,
      );
    });
  });
  voiceOverModeToggle.addEventListener("click", toggleVoiceOverMode);
  blackoutToggleButtons.forEach((button) => {
    button.addEventListener("click", toggleBlackout);
  });
  blackoutScreen.addEventListener("click", toggleBlackout);
  document.querySelectorAll("[data-touch-playback]").forEach((button) => {
    button.addEventListener("click", () => {
      const voiceOverAction =
        isVoiceOverMode() && button.hasAttribute("data-voiceover-action");
      if (voiceOverAction) cancelPendingFocusPlayback();
      runPlayback(
        button.dataset.touchPlayback,
        voiceOverAction ? VOICEOVER_CELL_TONE_DELAY_MS : 0,
      );
    });
  });
  grid.addEventListener("touchmove", handleDirectTouchMove, {
    passive: false,
  });
  grid.addEventListener("touchend", handleDirectTouchEnd, {
    passive: false,
  });
  grid.addEventListener("touchcancel", resetDirectTouchGesture);
  grid.addEventListener("focusout", cancelPendingFocusPlayback);
  const handleTouchInterfaceChange = () => {
    setInterfaceMode(shouldUseTouchInterface());
    if (!isTouchInterface()) setVoiceOverMode(false);
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
    return null;
  }
  audioResumePromise = resumeRequest
    .then(() => {
      if (audio.state !== "running") return null;
      audioUnlocked = true;
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

  // On touch browsers, a cell activation must unlock audio once. Do not leave
  // unresolved resume requests behind while VoiceOver only explores.
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

function playBin(x, audioDelayMs = 0) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(x, audio);
    const start =
      audio.currentTime + Math.max(0.01, audioDelayMs / 1000);
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

function playCell(x, y, drawing = false, audioDelayMs = 0) {
  withRunningAudio((audio) => {
    const output = scheduleCellAudio(audio, x, y, drawing, audioDelayMs);
    trackDelayedCellOutput(output, audioDelayMs);
  });
}

function scheduleCellAudio(audio, x, y, drawing = false, audioDelayMs = 0) {
  const output = createPannedOutput(x, audio);
  const start = audio.currentTime + Math.max(0.01, audioDelayMs / 1000);
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
  return output;
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

async function runPlayback(kind, audioDelayMs = 0) {
  cancelPlayback();
  const token = playbackToken;
  const runningAudio = await resumeAudioContext();
  if (!runningAudio) {
    setStatus(
      "Robin audio is off.",
      "Touch a cell, then try this action again.",
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

  if (audioDelayMs > 0) {
    await delay(audioDelayMs);
    if (token !== playbackToken) return;
  }

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
