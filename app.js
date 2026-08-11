"use strict";

const {
  GRID_MIN,
  GRID_MAX,
  lineGroups,
  normaliseProject,
  parseCsv,
  pointKey,
  projectToCsv,
} = RobinCore;
const GRID_COUNT = 11;
const ROOT_FREQUENCY = 130.81;
const TOP_TRIM = 0.97;
const CENTRE_SEMITONES = 12;
const PENTATONIC_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const CELL_TONE_DURATION = 0.22;
const DESKTOP_CELL_TONE_VOLUME = 0.3;
const TOUCH_CELL_TONE_VOLUME = 0.42;
const MOVE_BLEND_MS = 160;
const UNDO_LIMIT = 20;
const SETTINGS_STORAGE_KEY = "robin-settings-v1";
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

const DEFAULT_SETTINGS = {
  leftRight: { pan: true, timbre: "none", pitchStyle: "none" },
  upDown: {
    elevation: false,
    timbre: "none",
    pitchStyle: "pentatonic",
  },
  pitchRangeScale: 1,
  rowSpeedMs: 110,
  sweepSpeedMs: 160,
  positionVolume: 1,
  pointsVolume: 1,
  systemVolume: 1,
  smoothLines: false,
  colourTheme: "black on white, light mode",
};

const COLOUR_THEMES = {
  "white on black, dark mode": {
    paper: "#14141e",
    gridPaper: "#14141e",
    ink: "#e6e6f0",
    muted: "#b9b9c6",
    line: "#46465a",
    lineStrong: "#8d8da0",
    focus: "#79b8ff",
    cursor: "#ffb450",
  },
  "black on white, light mode": {
    paper: "#f7f7f2",
    gridPaper: "#ffffff",
    ink: "#171717",
    muted: "#5d5d59",
    line: "#b9b9b2",
    lineStrong: "#62625d",
    focus: "#005fcc",
    cursor: "#d43c16",
  },
  "yellow on black": {
    paper: "#000000",
    gridPaper: "#000000",
    ink: "#ffffff",
    muted: "#fff176",
    line: "#ffffff",
    lineStrong: "#ffffff",
    focus: "#52b7ff",
    cursor: "#ffe600",
  },
  "blue on black": {
    paper: "#191919",
    gridPaper: "#191919",
    ink: "#56b4e9",
    muted: "#d7d7d7",
    line: "#5f5f5f",
    lineStrong: "#adadad",
    focus: "#8bcaff",
    cursor: "#e69f00",
  },
  "cream on brown": {
    paper: "#28221b",
    gridPaper: "#28221b",
    ink: "#e8d5b8",
    muted: "#d1baa0",
    line: "#5f5244",
    lineStrong: "#b49d80",
    focus: "#8ec5ff",
    cursor: "#d88d41",
  },
};

const grid = document.querySelector("#sound-grid");
const gridHelp = document.querySelector("#grid-help");
const importInputs = [...document.querySelectorAll("[data-import-project]")];
const csvImportInputs = [...document.querySelectorAll("[data-import-csv]")];
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
const readmeDownload = document.querySelector("#readme-download");
const blackoutToggleButtons = [
  ...document.querySelectorAll("[data-blackout-toggle]"),
];
const blackoutScreen = document.querySelector("#blackout-screen");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const settingsInputs = settingsForm
  ? [...settingsForm.querySelectorAll("input, select")]
  : [];
const touchInterfaceQuery = window.matchMedia(
  "(hover: none) and (pointer: coarse)",
);
const appleTouchDevice =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let gridCells = new Map();
let strokes = [];
let strokeActive = false;
let undoStack = [];
let allSelected = false;
let cursorX = 0;
let cursorY = 0;
let activeShape = "circle";
let audioContext = null;
let masterOutput = null;
let audioResumePromise = null;
let audioUnlocked = false;
let playbackToken = 0;
let activePlaybackSources = new Set();
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
let lastMoveAt = 0;
let backspaceHeld = false;
let shiftPlotPending = false;
let settings = loadSettings();
let settingsBeforeDialog = null;
let csvDownloadName = "robin-data.csv";

applyTheme();
setInterfaceMode(shouldUseTouchInterface());
syncVoiceOverMode();
loadInitialGrid();
buildAxes();
bindEvents();
configureGridAccessibility();
renderGrid({ focus: false });
announceCurrentCell();
readmeDownload.focus({ preventScroll: true });

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

function numberInRange(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function loadSettings() {
  const loaded = cloneSettings(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_STORAGE_KEY) || "null",
    );
    if (!saved || typeof saved !== "object") return loaded;
    loaded.leftRight.pan = saved.leftRight?.pan !== false;
    loaded.leftRight.timbre = ["none", "forward", "reverse"].includes(
      saved.leftRight?.timbre,
    )
      ? saved.leftRight.timbre
      : loaded.leftRight.timbre;
    loaded.leftRight.pitchStyle = ["none", "pentatonic", "chord"].includes(
      saved.leftRight?.pitchStyle,
    )
      ? saved.leftRight.pitchStyle
      : loaded.leftRight.pitchStyle;
    loaded.upDown.elevation = saved.upDown?.elevation === true;
    loaded.upDown.timbre = ["none", "forward", "reverse"].includes(
      saved.upDown?.timbre,
    )
      ? saved.upDown.timbre
      : loaded.upDown.timbre;
    loaded.upDown.pitchStyle = ["none", "pentatonic", "chord"].includes(
      saved.upDown?.pitchStyle,
    )
      ? saved.upDown.pitchStyle
      : loaded.upDown.pitchStyle;
    loaded.pitchRangeScale = numberInRange(
      saved.pitchRangeScale,
      loaded.pitchRangeScale,
      0,
      1,
    );
    loaded.rowSpeedMs = numberInRange(
      saved.rowSpeedMs,
      loaded.rowSpeedMs,
      20,
      500,
    );
    loaded.sweepSpeedMs = numberInRange(
      saved.sweepSpeedMs,
      loaded.sweepSpeedMs,
      20,
      500,
    );
    for (const key of ["positionVolume", "pointsVolume", "systemVolume"]) {
      loaded[key] = numberInRange(saved[key], loaded[key], 0, 1);
    }
    loaded.smoothLines = saved.smoothLines === true;
    if (COLOUR_THEMES[saved.colourTheme])
      loaded.colourTheme = saved.colourTheme;
  } catch {
    // Restricted or malformed browser storage should not prevent Robin loading.
  }
  return loaded;
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this page when storage is unavailable.
  }
}

function applyTheme() {
  const theme =
    COLOUR_THEMES[settings.colourTheme] ||
    COLOUR_THEMES[DEFAULT_SETTINGS.colourTheme];
  const root = document.documentElement;
  root.style.setProperty("--paper", theme.paper);
  root.style.setProperty("--grid-paper", theme.gridPaper);
  root.style.setProperty("--ink", theme.ink);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--line-strong", theme.lineStrong);
  root.style.setProperty("--focus", theme.focus);
  root.style.setProperty("--cursor", theme.cursor);
  root.style.colorScheme = settings.colourTheme.includes("light mode")
    ? "light"
    : "dark";
  root.dataset.theme = settings.colourTheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.paper);
}

function setSettingValue(id, value) {
  const control = document.querySelector(`#${id}`);
  if (!control) return;
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    control.checked = Boolean(value);
  } else {
    control.value = String(value);
  }
}

function populateSettingsForm() {
  setSettingValue("setting-lr-pan", settings.leftRight.pan);
  setSettingValue("setting-lr-timbre", settings.leftRight.timbre);
  setSettingValue("setting-lr-pitch", settings.leftRight.pitchStyle);
  setSettingValue("setting-ud-elevation", settings.upDown.elevation);
  setSettingValue("setting-ud-timbre", settings.upDown.timbre);
  setSettingValue("setting-ud-pitch", settings.upDown.pitchStyle);
  setSettingValue("setting-pitch-range", settings.pitchRangeScale);
  setSettingValue("setting-row-speed", settings.rowSpeedMs);
  setSettingValue("setting-sweep-speed", settings.sweepSpeedMs);
  setSettingValue("setting-position-volume", settings.positionVolume);
  setSettingValue("setting-points-volume", settings.pointsVolume);
  setSettingValue("setting-system-volume", settings.systemVolume);
  setSettingValue("setting-smooth-lines", settings.smoothLines);
  setSettingValue("setting-colour-theme", settings.colourTheme);
}

function settingsFromForm() {
  const value = (id) => document.querySelector(`#${id}`)?.value;
  const checked = (id) => document.querySelector(`#${id}`)?.checked === true;
  return {
    leftRight: {
      pan: checked("setting-lr-pan"),
      timbre: value("setting-lr-timbre") || "none",
      pitchStyle: value("setting-lr-pitch") || "none",
    },
    upDown: {
      elevation: checked("setting-ud-elevation"),
      timbre: value("setting-ud-timbre") || "none",
      pitchStyle: value("setting-ud-pitch") || "none",
    },
    pitchRangeScale: numberInRange(value("setting-pitch-range"), 1, 0, 1),
    rowSpeedMs: numberInRange(value("setting-row-speed"), 110, 20, 500),
    sweepSpeedMs: numberInRange(value("setting-sweep-speed"), 160, 20, 500),
    positionVolume: numberInRange(value("setting-position-volume"), 1, 0, 1),
    pointsVolume: numberInRange(value("setting-points-volume"), 1, 0, 1),
    systemVolume: numberInRange(value("setting-system-volume"), 1, 0, 1),
    smoothLines: checked("setting-smooth-lines"),
    colourTheme: COLOUR_THEMES[value("setting-colour-theme")]
      ? value("setting-colour-theme")
      : DEFAULT_SETTINGS.colourTheme,
  };
}

function openSettings() {
  if (!settingsDialog || !settingsForm) return;
  settingsBeforeDialog = cloneSettings(settings);
  populateSettingsForm();
  if (typeof settingsDialog.showModal === "function") {
    settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute("open", "");
  }
  document.querySelector("#setting-lr-pan")?.focus();
}

function previewSettings(changedControl) {
  if (
    changedControl?.dataset.exclusive === "pitch" &&
    changedControl.value !== "none"
  ) {
    const otherId =
      changedControl.id === "setting-lr-pitch"
        ? "setting-ud-pitch"
        : "setting-lr-pitch";
    setSettingValue(otherId, "none");
  }
  if (
    changedControl?.dataset.exclusive === "timbre" &&
    changedControl.value !== "none"
  ) {
    const otherId =
      changedControl.id === "setting-lr-timbre"
        ? "setting-ud-timbre"
        : "setting-lr-timbre";
    setSettingValue(otherId, "none");
  }
  settings = settingsFromForm();
  applyTheme();
}

function closeSettings(save) {
  if (!settingsDialog) return;
  if (save) {
    settings = settingsFromForm();
    saveSettings();
    playConfirm(true);
    setStatus("Settings saved.", "Robin will reuse them on this browser.");
  } else if (settingsBeforeDialog) {
    settings = cloneSettings(settingsBeforeDialog);
    applyTheme();
    playConfirm(false);
  }
  settingsBeforeDialog = null;
  if (settingsDialog.open && typeof settingsDialog.close === "function") {
    settingsDialog.close();
  } else {
    settingsDialog.removeAttribute("open");
  }
}

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

function loadInitialGrid() {
  setProject({ points: demoPoints, strokes: [] });
}

function restoreStarterMap() {
  cancelPendingFocusPlayback();
  resetDirectTouchGesture();
  cancelPlayback();
  cursorX = 0;
  cursorY = 0;
  activeShape = "circle";
  syncTouchShapeControls();
  setProject({ points: demoPoints, strokes: [] });
  renderGrid({ focus: !isTouchInterface() });
  announceCurrentCell();
}

function setProject(project) {
  setPoints(project.points);
  strokes = (project.strokes || []).map((stroke) =>
    stroke.map(([x, y, shape]) => [x, y, shape]),
  );
  strokeActive = false;
  undoStack = [];
  allSelected = false;
  csvDownloadName = "robin-data.csv";
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

function projectData() {
  return {
    points: projectPoints(),
    strokes: strokes.map((stroke) => stroke.map((entry) => [...entry])),
  };
}

function endStroke() {
  strokeActive = false;
}

function pushUndo() {
  undoStack.push(projectData());
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function undoLast() {
  const previous = undoStack.pop();
  if (!previous) {
    setStatus(
      "Nothing to undo.",
      "Robin keeps the most recent 20 editing steps.",
    );
    return;
  }
  setPoints(previous.points);
  strokes = previous.strokes;
  endStroke();
  allSelected = false;
  renderGrid({ focus: !isTouchInterface() });
  playCell(cursorX, cursorY);
  setStatus("Last edit undone.", `x ${cursorX}, y ${cursorY}.`);
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
      "ArrowUp ArrowDown ArrowLeft ArrowRight Shift Backspace Tab Shift+Tab 0 S C T D 1 2 3 4 Space Control+A Meta+A Control+Z Meta+Z Control+I Meta+I Control+, Meta+,",
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
  grid.classList.toggle("is-all-selected", allSelected);
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
  const cell = grid.querySelector(`[data-x="${cursorX}"][data-y="${cursorY}"]`);
  cell?.focus({ preventScroll: true });
}

function selectCell(x, y) {
  cancelPlayback();
  endStroke();
  allSelected = false;
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
  endStroke();
  allSelected = false;
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

function handleDirectTouchEnd() {
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

function activateTouchCell(x, y, audioDelayMs = 0, unlockAudio = false) {
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
  allSelected = false;
  const targetX = cursorX + dx;
  const targetY = cursorY + dy;
  const hitEdge =
    targetX < GRID_MIN ||
    targetX > GRID_MAX ||
    targetY < GRID_MIN ||
    targetY > GRID_MAX;
  cursorX = clamp(targetX);
  cursorY = clamp(targetY);

  if (hitEdge && mode !== "move") playEdge(cursorX, cursorY);

  if (mode === "draw") {
    addShapeAtCursor(focus);
  } else if (mode === "erase") {
    eraseAtCursor(focus);
  } else if (hitEdge) {
    endStroke();
    playEdge(cursorX, cursorY);
    renderGrid({ focus });
    setStatus("Edge of the map.", `x ${cursorX}, y ${cursorY}.`);
  } else {
    endStroke();
    const now = performance.now();
    const gapMs = now - lastMoveAt;
    lastMoveAt = now;
    const quickMove = gapMs > 0 && gapMs < MOVE_BLEND_MS;
    playCell(cursorX, cursorY, false, 0, {
      duration: quickMove
        ? Math.max(0.07, Math.min(CELL_TONE_DURATION, gapMs / 1000))
        : CELL_TONE_DURATION,
      volumeScale: quickMove ? Math.max(0.5, gapMs / MOVE_BLEND_MS) : 1,
    });
    renderGrid({ focus });
    announceCurrentCell();
  }
}

function addShapeAtCursor(
  focus = false,
  audioDelayMs = 0,
  unlockAudio = false,
) {
  allSelected = false;
  pushUndo();
  const key = pointKey(cursorX, cursorY);
  const shapes = gridCells.get(key) || [];
  shapes.push(activeShape);
  gridCells.set(key, shapes);
  if (!strokeActive) {
    strokes.push([]);
    strokeActive = true;
  }
  const entry = [cursorX, cursorY, activeShape];
  const previous = strokes.at(-1)?.at(-1);
  if (
    !previous ||
    previous[0] !== entry[0] ||
    previous[1] !== entry[1] ||
    previous[2] !== entry[2]
  ) {
    strokes.at(-1).push(entry);
  }
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
  endStroke();
  allSelected = false;
  const key = pointKey(cursorX, cursorY);
  const shapes = gridCells.get(key);
  if (shapes?.length) pushUndo();
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
  endStroke();
  allSelected = false;
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

function sortedPlottedPoints() {
  return [...gridCells.keys()]
    .map((key) => key.split(",").map(Number))
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

function jumpToPoint(step, focus = true) {
  const points = sortedPlottedPoints();
  if (!points.length) {
    setStatus(
      "There are no plotted points.",
      "Import data or plot a shape first.",
    );
    return;
  }
  cancelPlayback();
  endStroke();
  allSelected = false;
  const currentIndex = points.findIndex(
    ([x, y]) => x === cursorX && y === cursorY,
  );
  const nextIndex =
    currentIndex < 0
      ? step > 0
        ? 0
        : points.length - 1
      : (currentIndex + step + points.length) % points.length;
  [cursorX, cursorY] = points[nextIndex];
  playCell(cursorX, cursorY, false, 0, { bounce: true });
  renderGrid({ focus: focus && !isTouchInterface() });
  announceCurrentCell();
}

function jumpCentre(focus = true) {
  cancelPlayback();
  endStroke();
  allSelected = false;
  cursorX = 0;
  cursorY = 0;
  playCentre();
  renderGrid({ focus: focus && !isTouchInterface() });
  setStatus("Returned to the centre.", "x 0, y 0.");
}

function selectAllPoints() {
  endStroke();
  if (!gridCells.size) {
    setStatus("There are no plotted points to select.", "");
    return;
  }
  allSelected = true;
  grid.classList.add("is-all-selected");
  playSelectAll();
  setStatus(
    `Selected all ${gridCells.size} plotted cells.`,
    "Press Backspace to clear them or an arrow key to cancel the selection.",
  );
}

function clearAllSelected() {
  if (!gridCells.size) {
    allSelected = false;
    return;
  }
  pushUndo();
  gridCells = new Map();
  strokes = [];
  endStroke();
  allSelected = false;
  playBin(cursorX);
  renderGrid({ focus: !isTouchInterface() });
  setStatus(
    "All plotted points cleared.",
    "Press Command+Z or Ctrl+Z to undo.",
  );
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
      "Start a new empty map? You can undo this during the current session.",
    )
  ) {
    playConfirm(false);
    return;
  }
  cancelPlayback();
  if (gridCells.size) pushUndo();
  gridCells = new Map();
  strokes = [];
  endStroke();
  allSelected = false;
  cursorX = 0;
  cursorY = 0;
  csvDownloadName = "robin-data.csv";
  renderGrid({ focus: !isTouchInterface() });
  playConfirm(true);
  setStatus(
    "New empty map created. x 0, y 0.",
    "Press Command+Z or Ctrl+Z to restore the previous map.",
  );
}

async function importProject(event) {
  const input = event.currentTarget;
  const [file] = input.files;
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    setProject(normaliseProject(data));
    cursorX = 0;
    cursorY = 0;
    renderGrid({ focus: !isTouchInterface() });
    playConfirm(true);
    setStatus(
      `Opened ${file.name}.`,
      `The map contains ${projectPoints().length} plotted cells.`,
    );
  } catch (error) {
    playConfirm(false);
    setStatus(
      "Robin could not open that file.",
      error.message || "The JSON project is not valid.",
    );
  } finally {
    input.value = "";
  }
}

async function importCsv(event) {
  const input = event.currentTarget;
  const [file] = input.files;
  if (!file) return;

  try {
    const imported = parseCsv(await file.text());
    pushUndo();
    for (const point of imported.points) {
      const key = pointKey(point.x, point.y);
      const shapes = gridCells.get(key) || [];
      shapes.push(...point.shapes);
      gridCells.set(key, shapes);
    }
    endStroke();
    allSelected = false;
    csvDownloadName = file.name.replace(/\.csv$/i, "") + "-updated.csv";
    renderGrid({ focus: !isTouchInterface() });
    playConfirm(true);
    setStatus(
      `Imported ${file.name}.`,
      `${imported.importedRows} rows were added to ${gridCells.size} plotted cells.`,
    );
  } catch (error) {
    playConfirm(false);
    setStatus(
      "Robin could not import that CSV.",
      error.message || "The CSV data is not valid.",
    );
  } finally {
    input.value = "";
  }
}

function downloadFile(contents, type, filename) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportProject() {
  const data = JSON.stringify(projectData(), null, 2);
  downloadFile(data, "application/json", "robin-project.json");
  setStatus("Saved robin-project.json.", "Your map is ready to keep or share.");
}

function exportCsv() {
  downloadFile(
    projectToCsv(projectPoints()),
    "text/csv;charset=utf-8",
    csvDownloadName,
  );
  setStatus(
    `Saved ${csvDownloadName}.`,
    "The download contains the map's current x, y, and shape rows.",
  );
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
  csvImportInputs.forEach((input) => {
    input.addEventListener("change", importCsv);
  });
  document.querySelectorAll("[data-export-csv]").forEach((button) => {
    button.addEventListener("click", exportCsv);
  });
  document.querySelectorAll("[data-settings-open]").forEach((button) => {
    button.addEventListener("click", openSettings);
  });
  document.querySelectorAll("[data-point-step]").forEach((button) => {
    button.addEventListener("click", () =>
      jumpToPoint(Number(button.dataset.pointStep), false),
    );
  });
  document.querySelectorAll("[data-jump-centre]").forEach((button) => {
    button.addEventListener("click", () => jumpCentre(false));
  });
  document.querySelectorAll("[data-undo]").forEach((button) => {
    button.addEventListener("click", undoLast);
  });
  settingsInputs.forEach((control) => {
    control.addEventListener("change", () => {
      previewSettings(control);
      if (control.type === "checkbox" || control instanceof HTMLSelectElement) {
        playConfirm(control.type === "checkbox" ? control.checked : true);
      }
    });
    if (control instanceof HTMLInputElement && control.type === "number") {
      control.addEventListener("keydown", (event) => {
        if (!event.shiftKey || !["ArrowUp", "ArrowDown"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        control.stepUp(event.key === "ArrowUp" ? 10 : -10);
        previewSettings(control);
      });
    }
  });
  settingsForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    closeSettings(true);
  });
  document
    .querySelector("[data-settings-cancel]")
    ?.addEventListener("click", () => {
      closeSettings(false);
    });
  settingsDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSettings(false);
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
      eraseAtCursor(false, voiceOverAction ? VOICEOVER_CELL_TONE_DELAY_MS : 0);
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
  window.addEventListener("keyup", handleKeyUp);
}

function visibleFileInput(inputs) {
  return (
    inputs.find((input) => {
      const interfaceContainer = input.closest(".touch-only, .desktop-only");
      return (
        !interfaceContainer ||
        getComputedStyle(interfaceContainer).display !== "none"
      );
    }) || inputs[0]
  );
}

function handleKeyDown(event) {
  if (isTouchInterface()) return;

  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target?.isContentEditable
  ) {
    return;
  }

  if (settingsDialog?.open) return;

  if (
    event.key !== "Shift" &&
    event.shiftKey &&
    !event.key.startsWith("Arrow")
  ) {
    shiftPlotPending = false;
  }

  const commandDown = event.metaKey || event.ctrlKey;
  if (commandDown && event.key.toLowerCase() === "n") {
    event.preventDefault();
    clearGrid();
    return;
  }
  if (commandDown && event.key.toLowerCase() === "i") {
    event.preventDefault();
    visibleFileInput(csvImportInputs)?.click();
    return;
  }
  if (commandDown && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLast();
    return;
  }
  if (commandDown && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllPoints();
    return;
  }
  if (commandDown && event.key === ",") {
    event.preventDefault();
    openSettings();
    return;
  }

  const directions = {
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  const inGrid =
    event.target instanceof Element && event.target.closest("#sound-grid");

  if (directions[event.key]) {
    event.preventDefault();
    if (event.shiftKey && shiftPlotPending) {
      addShapeAtCursor(true);
      shiftPlotPending = false;
    }
    const [dx, dy] = directions[event.key];
    moveCursor(
      dx,
      dy,
      event.shiftKey ? "draw" : backspaceHeld ? "erase" : "move",
    );
    return;
  }

  if (event.key === "Shift" && !event.repeat && inGrid) {
    event.preventDefault();
    shiftPlotPending = true;
  } else if (event.key === "Backspace" && !event.repeat && inGrid) {
    event.preventDefault();
    backspaceHeld = true;
    if (allSelected) clearAllSelected();
    else eraseAtCursor(true);
  } else if (event.key === "Tab" && inGrid) {
    event.preventDefault();
    shiftPlotPending = false;
    jumpToPoint(event.shiftKey ? -1 : 1);
  } else if (event.key === "0" && inGrid) {
    event.preventDefault();
    jumpCentre();
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
  } else if (event.key === "Escape" && inGrid) {
    event.preventDefault();
    document.querySelector(".instructions [data-settings-open]")?.focus();
    setStatus(
      "Map focus released.",
      "Use Tab to move through the page controls.",
    );
  }
}

function handleKeyUp(event) {
  if (event.key === "Shift") {
    const focusInGrid = document.activeElement?.closest?.("#sound-grid");
    if (shiftPlotPending && focusInGrid && !settingsDialog?.open) {
      addShapeAtCursor(true);
    }
    shiftPlotPending = false;
    endStroke();
  }
  if (event.key === "Backspace") backspaceHeld = false;
}

function shapeForKey(key) {
  return {
    s: "square",
    c: "circle",
    t: "triangle",
    d: "diamond",
  }[key.toLowerCase()];
}

function axisPitchSemitones(position) {
  return (
    (PENTATONIC_STEPS[position - GRID_MIN] - CENTRE_SEMITONES) *
    settings.pitchRangeScale
  );
}

function combinedSemitones(x, y) {
  let semitones = 0;
  if (settings.leftRight.pitchStyle === "pentatonic") {
    semitones += axisPitchSemitones(x);
  }
  if (settings.upDown.pitchStyle === "pentatonic") {
    semitones += axisPitchSemitones(y);
  }
  return semitones;
}

function positionFrequency(x, y) {
  return (
    ROOT_FREQUENCY * 2 ** ((CENTRE_SEMITONES + combinedSemitones(x, y)) / 12)
  );
}

function positionPitchRatio(x, y) {
  const trim = y === GRID_MAX ? TOP_TRIM : 1;
  return 2 ** (combinedSemitones(x, y) / 12) * trim;
}

function runPitchRatio(y) {
  const trim = y === GRID_MAX ? TOP_TRIM : 1;
  return 2 ** (axisPitchSemitones(y) / 12) * trim;
}

function chordAxisValue(x, y) {
  if (settings.leftRight.pitchStyle === "chord") return x;
  if (settings.upDown.pitchStyle === "chord") return y;
  return null;
}

function chordFrequencies(value) {
  const root =
    ROOT_FREQUENCY * 2 ** ((CENTRE_SEMITONES + axisPitchSemitones(value)) / 12);
  return [0, 7, 14, 19].map((interval) => root * 2 ** (interval / 12));
}

function axisAmount(position, direction) {
  const normalised = (position - GRID_MIN) / (GRID_MAX - GRID_MIN);
  return direction === "reverse" ? 1 - normalised : normalised;
}

function positionTremoloAmount(x, y) {
  if (settings.leftRight.timbre !== "none") {
    return axisAmount(x, settings.leftRight.timbre);
  }
  if (settings.upDown.timbre !== "none") {
    return axisAmount(y, settings.upDown.timbre);
  }
  return 0;
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
    const limiter = createdAudio.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(createdAudio.destination);
    masterOutput = limiter;
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

function createPannedOutput(x, audio, y = 0, gainScale = 1) {
  const output = audio.createGain();
  output.gain.value = 0.72 * gainScale;
  const destination = masterOutput || audio.destination;

  if (settings.upDown.elevation && typeof audio.createPanner === "function") {
    const panner = audio.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 10;
    panner.rolloffFactor = 0;
    const horizontal = settings.leftRight.pan ? columnPan(x) : 0;
    const vertical = y / GRID_MAX;
    if (panner.positionX) {
      panner.positionX.value = horizontal;
      panner.positionY.value = vertical;
      panner.positionZ.value = -1;
    } else {
      panner.setPosition(horizontal, vertical, -1);
    }
    output.connect(panner);
    panner.connect(destination);
  } else if (
    settings.leftRight.pan &&
    typeof audio.createStereoPanner === "function"
  ) {
    const panner = audio.createStereoPanner();
    panner.pan.value = columnPan(x);
    output.connect(panner);
    panner.connect(destination);
  } else {
    output.connect(destination);
  }
  return output;
}

function scheduleTone(
  output,
  frequency,
  start,
  duration,
  volume,
  options = {},
) {
  if (!output) return;
  const audio = output.context;
  const {
    attack = 0.015,
    release = Math.min(duration * 0.45, 0.12),
    tremoloAmount = 0,
  } = options;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const tremoloGain = audio.createGain();
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
  gain.connect(tremoloGain);
  tremoloGain.connect(output);
  tremoloGain.gain.value = 1;
  if (tremoloAmount > 0) {
    const lfo = audio.createOscillator();
    const lfoDepth = audio.createGain();
    const depth = Math.max(0, Math.min(1, tremoloAmount));
    lfo.frequency.value = 3 + depth * 9;
    lfoDepth.gain.value = depth * 0.45;
    tremoloGain.gain.value = 1 - depth * 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(tremoloGain.gain);
    lfo.start(start);
    lfo.stop(end + 0.02);
  }
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function scheduleHarmonicTone(
  output,
  frequency,
  start,
  duration,
  volume,
  options = {},
) {
  scheduleTone(output, frequency, start, duration, volume, options);
  scheduleTone(output, frequency * 2, start, duration, volume * 0.3, options);
  scheduleTone(output, frequency * 3, start, duration, volume * 0.15, options);
}

function scheduleOutputTremolo(output, start, duration, amount) {
  if (!output || amount <= 0) return;
  const audio = output.context;
  const depth = Math.max(0, Math.min(1, amount));
  const baseGain = output.gain.value;
  const lfo = audio.createOscillator();
  const lfoDepth = audio.createGain();
  lfo.frequency.value = 3 + depth * 9;
  lfoDepth.gain.value = baseGain * depth * 0.45;
  output.gain.value = baseGain * (1 - depth * 0.45);
  lfo.connect(lfoDepth);
  lfoDepth.connect(output.gain);
  lfo.start(start);
  lfo.stop(start + duration + 0.02);
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
  gain.gain.value = 0.09 * settings.systemVolume;
  source.connect(gain);
  gain.connect(output);
  source.start(start);
}

function playBin(x, audioDelayMs = 0) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(x, audio, cursorY);
    const start = audio.currentTime + Math.max(0.01, audioDelayMs / 1000);
    scheduleTone(output, 90, start, 0.09, 0.28 * settings.systemVolume, {
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
    gain.gain.value = 0.12 * settings.systemVolume;
    source.connect(gain);
    gain.connect(output);
    source.start(start + 0.1);
  });
}

function playEdge(x, y) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(x, audio, y);
    const start = audio.currentTime + 0.01;
    scheduleTone(output, 220, start, 0.05, 0.3 * settings.systemVolume, {
      attack: 0.005,
      release: 0.03,
    });
    scheduleTone(output, 170, start + 0.07, 0.06, 0.3 * settings.systemVolume, {
      attack: 0.005,
      release: 0.04,
    });
  });
}

function playCentre() {
  withRunningAudio((audio) => {
    const output = createPannedOutput(0, audio, 0);
    const start = audio.currentTime + 0.01;
    scheduleTone(
      output,
      ROOT_FREQUENCY * 2,
      start,
      0.14,
      0.4 * settings.systemVolume,
      {
        attack: 0.008,
        release: 0.09,
      },
    );
    scheduleTone(
      output,
      ROOT_FREQUENCY * 4,
      start,
      0.05,
      0.11 * settings.systemVolume,
      {
        attack: 0.003,
        release: 0.035,
      },
    );
  });
}

function playConfirm(major) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(0, audio, 0);
    const intervals = major ? [0, 4, 7, 12] : [12, 7, 3, 0];
    const start = audio.currentTime + 0.01;
    intervals.forEach((interval, index) => {
      const frequency = ROOT_FREQUENCY * 3 * 2 ** (interval / 12);
      scheduleTone(
        output,
        frequency,
        start + index * 0.062,
        0.05,
        0.15 * settings.systemVolume,
        { attack: 0.003, release: 0.035 },
      );
    });
  });
}

function playSelectAll() {
  withRunningAudio((audio) => {
    const output = createPannedOutput(0, audio, 0);
    const start = audio.currentTime + 0.01;
    [0, 4, 7].forEach((interval, index) => {
      scheduleTone(
        output,
        ROOT_FREQUENCY * 4 * 2 ** (interval / 12),
        start + index * 0.08,
        0.05,
        0.15 * settings.systemVolume,
        { attack: 0.003, release: 0.035 },
      );
    });
    scheduleTone(
      output,
      ROOT_FREQUENCY * 8,
      start + 0.16,
      0.05,
      0.09 * settings.systemVolume,
      { attack: 0.003, release: 0.035 },
    );
  });
}

function scheduleBounce(output, start) {
  const audio = output.context;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const end = start + 0.04;
  oscillator.frequency.setValueAtTime(300, start);
  oscillator.frequency.exponentialRampToValueAtTime(700, end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, 0.18 * settings.systemVolume),
    start + 0.006,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function playToggleSound(turningOff) {
  withRunningAudio((audio) => {
    const output = createPannedOutput(0, audio, 0);
    const start = audio.currentTime + 0.01;
    const first = turningOff ? 500 : 260;
    const second = turningOff ? 260 : 500;
    scheduleTone(output, first, start, 0.07, 0.24 * settings.systemVolume, {
      attack: 0.003,
      release: 0.04,
    });
    scheduleTone(
      output,
      second,
      start + 0.08,
      0.09,
      0.24 * settings.systemVolume,
      {
        attack: 0.003,
        release: 0.055,
      },
    );
  });
}

function toggleBlackout() {
  endStroke();
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

function scheduleShape(output, shape, pitchRatio, start, volumeScale = 1) {
  const volume = settings.pointsVolume * volumeScale;
  if (shape === "square") {
    scheduleHarmonicTone(output, 400 * pitchRatio, start, 0.05, 0.28 * volume);
    scheduleHarmonicTone(
      output,
      400 * pitchRatio,
      start + 0.07,
      0.05,
      0.28 * volume,
    );
  } else if (shape === "circle") {
    scheduleTone(output, 600 * pitchRatio, start, 0.26, 0.25 * volume, {
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
        0.24 * volume,
      );
    });
  } else if (shape === "diamond") {
    [1600, 2200, 1800, 2400].forEach((frequency, index) => {
      scheduleTone(
        output,
        frequency * pitchRatio,
        start + index * 0.065,
        0.05,
        0.16 * volume,
        { attack: 0.003, release: 0.035 },
      );
      scheduleTone(
        output,
        frequency * pitchRatio * 2,
        start + index * 0.065,
        0.05,
        0.035 * volume,
        { attack: 0.003, release: 0.035 },
      );
    });
  }
}

function schedulePosition(output, x, y, start, duration, volumeScale) {
  const baseVolume =
    (isTouchInterface() ? TOUCH_CELL_TONE_VOLUME : DESKTOP_CELL_TONE_VOLUME) *
    settings.positionVolume *
    volumeScale;
  const chordValue = chordAxisValue(x, y);
  if (chordValue !== null) {
    const chordDuration = Math.max(duration, 1.4);
    const weights = [0.45, 0.3, 0.2, 0.15];
    chordFrequencies(chordValue).forEach((frequency, index) => {
      scheduleTone(
        output,
        frequency,
        start,
        chordDuration,
        baseVolume * weights[index],
        { attack: 0.3, release: 0.7 },
      );
    });
    return;
  }
  scheduleHarmonicTone(
    output,
    positionFrequency(x, y),
    start,
    duration,
    baseVolume,
  );
}

function playCell(x, y, drawing = false, audioDelayMs = 0, options = {}) {
  withRunningAudio((audio) => {
    const output = scheduleCellAudio(
      audio,
      x,
      y,
      drawing,
      audioDelayMs,
      options,
    );
    trackDelayedCellOutput(output, audioDelayMs);
  });
}

function scheduleCellAudio(
  audio,
  x,
  y,
  drawing = false,
  audioDelayMs = 0,
  options = {},
) {
  const {
    shapes = gridCells.get(pointKey(x, y)) || [],
    includePosition = true,
    duration = CELL_TONE_DURATION,
    volumeScale = 1,
    bounce = false,
  } = options;
  const layerCount = (includePosition ? 1 : 0) + uniqueShapes(shapes).length;
  const output = createPannedOutput(
    x,
    audio,
    y,
    1 / Math.sqrt(Math.max(1, layerCount * 0.7)),
  );
  const start = audio.currentTime + Math.max(0.01, audioDelayMs / 1000);
  scheduleOutputTremolo(
    output,
    start,
    chordAxisValue(x, y) === null ? Math.max(duration, 0.3) : 1.4,
    positionTremoloAmount(x, y),
  );
  if (includePosition)
    schedulePosition(output, x, y, start, duration, volumeScale);
  for (const shape of uniqueShapes(shapes)) {
    scheduleShape(output, shape, positionPitchRatio(x, y), start, volumeScale);
  }
  if (drawing) scheduleClick(output, start);
  if (bounce) scheduleBounce(output, start);
  return output;
}

function playPlottedCell(x, y, selectedShapes = null, volumeScale = 1) {
  const shapes = selectedShapes || gridCells.get(pointKey(x, y));
  if (!shapes?.length) return;
  withRunningAudio((audio) => {
    const output = createPannedOutput(
      x,
      audio,
      y,
      1 / Math.sqrt(Math.max(1, uniqueShapes(shapes).length * 0.7)),
    );
    const start = audio.currentTime + 0.01;
    scheduleOutputTremolo(output, start, 0.3, positionTremoloAmount(x, y));
    for (const shape of uniqueShapes(shapes)) {
      scheduleShape(
        output,
        shape,
        positionPitchRatio(x, y),
        start,
        volumeScale,
      );
    }
  });
}

function speedVolumeScale(speedMs) {
  return Math.max(0.5, Math.min(1, speedMs / 160));
}

function scheduleSmoothedPath(shape, points, duration, speedMs) {
  if (points.length < 2) return;
  withRunningAudio((audio) => {
    const start = audio.currentTime + 0.01;
    const end = start + duration;
    const input = audio.createGain();
    const envelope = audio.createGain();
    const destination = masterOutput || audio.destination;
    input.gain.value = speedVolumeScale(speedMs);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, 0.22 * settings.pointsVolume),
      Math.min(end, start + 0.05),
    );
    envelope.gain.setValueAtTime(
      Math.max(0.0002, 0.22 * settings.pointsVolume),
      Math.max(start + 0.05, end - 0.12),
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    input.connect(envelope);

    let spatialNode = null;
    if (settings.upDown.elevation && typeof audio.createPanner === "function") {
      spatialNode = audio.createPanner();
      spatialNode.panningModel = "HRTF";
      spatialNode.distanceModel = "inverse";
      spatialNode.rolloffFactor = 0;
      envelope.connect(spatialNode);
      spatialNode.connect(destination);
    } else if (
      settings.leftRight.pan &&
      typeof audio.createStereoPanner === "function"
    ) {
      spatialNode = audio.createStereoPanner();
      envelope.connect(spatialNode);
      spatialNode.connect(destination);
    } else {
      envelope.connect(destination);
    }

    const oscillator = audio.createOscillator();
    const tremoloGain = audio.createGain();
    let tremoloOscillator = null;
    let tremoloDepth = null;
    const pathUsesTremolo =
      settings.leftRight.timbre !== "none" || settings.upDown.timbre !== "none";
    if (pathUsesTremolo) {
      tremoloOscillator = audio.createOscillator();
      tremoloDepth = audio.createGain();
      tremoloOscillator.frequency.value = 9;
      tremoloOscillator.connect(tremoloDepth);
      tremoloDepth.connect(tremoloGain.gain);
      tremoloOscillator.start(start);
      tremoloOscillator.stop(end + 0.02);
    } else {
      tremoloGain.gain.value = 1;
    }
    const baseFrequencies = {
      square: 420,
      circle: 600,
      triangle: 650,
      diamond: 1900,
    };
    oscillator.type = {
      square: "square",
      circle: "sine",
      triangle: "triangle",
      diamond: "sine",
    }[shape];
    points.forEach(([x, y], index) => {
      const time = start + (duration * index) / Math.max(1, points.length - 1);
      const frequency = baseFrequencies[shape] * runPitchRatio(y);
      if (index === 0) oscillator.frequency.setValueAtTime(frequency, time);
      else oscillator.frequency.linearRampToValueAtTime(frequency, time);

      if (pathUsesTremolo) {
        const amount = positionTremoloAmount(x, y);
        const method =
          index === 0 ? "setValueAtTime" : "linearRampToValueAtTime";
        tremoloGain.gain[method](1 - amount * 0.45, time);
        tremoloDepth.gain[method](amount * 0.45, time);
      }

      if (spatialNode?.pan) {
        const pan = settings.leftRight.pan ? columnPan(x) : 0;
        if (index === 0) spatialNode.pan.setValueAtTime(pan, time);
        else spatialNode.pan.linearRampToValueAtTime(pan, time);
      } else if (spatialNode?.positionX) {
        const horizontal = settings.leftRight.pan ? columnPan(x) : 0;
        const vertical = y / GRID_MAX;
        const method =
          index === 0 ? "setValueAtTime" : "linearRampToValueAtTime";
        spatialNode.positionX[method](horizontal, time);
        spatialNode.positionY[method](vertical, time);
        spatialNode.positionZ[method](-1, time);
      } else if (
        index === 0 &&
        typeof spatialNode?.setPosition === "function"
      ) {
        spatialNode.setPosition(
          settings.leftRight.pan ? columnPan(x) : 0,
          y / GRID_MAX,
          -1,
        );
      }
    });
    oscillator.connect(tremoloGain);
    tremoloGain.connect(input);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
    activePlaybackSources.add(oscillator);
    if (tremoloOscillator) activePlaybackSources.add(tremoloOscillator);
    window.setTimeout(
      () => {
        activePlaybackSources.delete(oscillator);
        if (tremoloOscillator) activePlaybackSources.delete(tremoloOscillator);
      },
      (duration + 0.1) * 1000,
    );
  });
}

function cancelPlayback() {
  playbackToken += 1;
  activePlaybackSources.forEach((source) => {
    try {
      source.stop();
    } catch {
      // A source that has already ended needs no further cancellation.
    }
  });
  activePlaybackSources = new Set();
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function playbackGroupMaps(alongX) {
  const pointGroup = new Map();
  const orderedById = new Map();
  const drawnOrder = new Map();
  let order = 0;
  strokes.forEach((stroke) => {
    stroke.forEach(([x, y, shape]) => {
      const key = `${x},${y},${shape}`;
      if (!drawnOrder.has(key)) drawnOrder.set(key, order);
      order += 1;
    });
  });

  if (!settings.smoothLines) return { pointGroup, orderedById };
  lineGroups(gridCells, strokes).forEach((group) => {
    const ordered = [...group.points].sort((left, right) => {
      const sweptDifference = alongX ? left[0] - right[0] : left[1] - right[1];
      if (sweptDifference) return sweptDifference;
      const leftOrder = drawnOrder.get(`${left[0]},${left[1]},${group.shape}`);
      const rightOrder = drawnOrder.get(
        `${right[0]},${right[1]},${group.shape}`,
      );
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (
          (leftOrder ?? Number.MAX_SAFE_INTEGER) -
          (rightOrder ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return alongX ? left[1] - right[1] : left[0] - right[0];
    });
    orderedById.set(group.id, { ...group, points: ordered });
    group.points.forEach(([x, y]) => {
      pointGroup.set(`${x},${y},${group.shape}`, group.id);
    });
  });
  return { pointGroup, orderedById };
}

async function playAxis(alongX, token) {
  const speed = settings.rowSpeedMs;
  const volumeScale = speedVolumeScale(speed);
  const fixed = alongX ? cursorY : cursorX;
  const values = Array.from(
    { length: GRID_COUNT },
    (_, index) => GRID_MIN + index,
  );
  const { pointGroup } = playbackGroupMaps(alongX);
  const resolved = new Set();

  for (
    let index = 0;
    index < values.length && token === playbackToken;
    index += 1
  ) {
    const value = values[index];
    const [x, y] = alongX ? [value, fixed] : [fixed, value];
    if (alongX) cursorX = value;
    else cursorY = value;
    const shapes = uniqueShapes(gridCells.get(pointKey(x, y)) || []);
    const leftovers = [];

    for (const shape of shapes) {
      const shapeKey = `${x},${y},${shape}`;
      if (resolved.has(shapeKey)) continue;
      const groupId = pointGroup.get(shapeKey);
      if (groupId === undefined) {
        leftovers.push(shape);
        continue;
      }

      const run = [[x, y]];
      let look = index + 1;
      while (look < values.length) {
        const nextValue = values[look];
        const [nextX, nextY] = alongX ? [nextValue, fixed] : [fixed, nextValue];
        if (pointGroup.get(`${nextX},${nextY},${shape}`) !== groupId) break;
        run.push([nextX, nextY]);
        look += 1;
      }
      run.forEach(([runX, runY]) => resolved.add(`${runX},${runY},${shape}`));
      if (run.length >= 2) {
        scheduleSmoothedPath(shape, run, (run.length * speed) / 1000, speed);
      } else {
        leftovers.push(shape);
      }
    }

    if (!shapes.length || leftovers.length) {
      playCell(x, y, false, 0, { shapes: leftovers, volumeScale });
    }
    renderPlaybackCursor();
    await delay(speed);
  }
}

function groupCrossesSweep(group, alongX) {
  return (
    new Set(group.points.map((point) => (alongX ? point[0] : point[1]))).size >
    1
  );
}

async function playSweep(alongX, token) {
  const speed = settings.sweepSpeedMs;
  const volumeScale = speedVolumeScale(speed);
  const { pointGroup, orderedById } = playbackGroupMaps(alongX);
  const started = new Set();

  for (
    let outer = GRID_MIN;
    outer <= GRID_MAX && token === playbackToken;
    outer += 1
  ) {
    if (alongX) cursorX = outer;
    else cursorY = outer;
    const clusters = new Map();

    for (let inner = GRID_MIN; inner <= GRID_MAX; inner += 1) {
      const [x, y] = alongX ? [outer, inner] : [inner, outer];
      const shapes = uniqueShapes(gridCells.get(pointKey(x, y)) || []);
      for (const shape of shapes) {
        const groupId = pointGroup.get(`${x},${y},${shape}`);
        if (groupId !== undefined) {
          if (!started.has(groupId)) {
            started.add(groupId);
            const group = orderedById.get(groupId);
            if (groupCrossesSweep(group, alongX)) {
              scheduleSmoothedPath(
                shape,
                group.points,
                (group.points.length * speed) / 1000,
                speed,
              );
            } else {
              group.points.forEach(([pointX, pointY]) => {
                playPlottedCell(pointX, pointY, [shape], volumeScale);
              });
            }
          }
          continue;
        }
        const points = clusters.get(shape) || [];
        points.push([x, y]);
        clusters.set(shape, points);
      }
    }

    clusters.forEach((points, shape) => {
      points.forEach(([x, y]) => playPlottedCell(x, y, [shape], volumeScale));
    });
    renderPlaybackCursor();
    await delay(speed);
  }
}

async function runPlayback(kind, audioDelayMs = 0) {
  cancelPlayback();
  endStroke();
  allSelected = false;
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

  if (kind === "row") await playAxis(true, token);
  else if (kind === "column") await playAxis(false, token);
  else if (kind === "columns") await playSweep(true, token);
  else if (kind === "rows") await playSweep(false, token);

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
