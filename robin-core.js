/* global module */

(function exposeRobinCore(globalScope) {
  "use strict";

  const GRID_MIN = -5;
  const GRID_MAX = 5;
  const VALID_SHAPES = ["square", "circle", "triangle", "diamond"];

  function pointKey(x, y) {
    return `${x},${y}`;
  }

  function shapePointKey(x, y, shape) {
    return `${x},${y},${shape}`;
  }

  function roundHalfEven(value) {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.abs(value) * 2) {
      return lower % 2 === 0 ? lower : lower + 1;
    }
    return Math.round(value);
  }

  function clampCoordinate(value) {
    return Math.max(GRID_MIN, Math.min(GRID_MAX, roundHalfEven(value)));
  }

  function normaliseShape(shape) {
    const candidate = String(shape || "circle")
      .trim()
      .toLowerCase();
    return VALID_SHAPES.includes(candidate) ? candidate : "circle";
  }

  function normaliseProject(data) {
    if (!data || !Array.isArray(data.points)) {
      throw new Error("This file does not contain a Robin points list.");
    }

    const points = data.points.map((point) => {
      if (!point || typeof point !== "object") {
        throw new Error("The project contains a point Robin cannot read.");
      }
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
      return { x: point.x, y: point.y, shapes: [...shapes] };
    });

    const pointShapes = new Map(
      points.map((point) => [
        pointKey(point.x, point.y),
        new Set(point.shapes),
      ]),
    );
    const strokes = [];
    const savedStrokes = Array.isArray(data.strokes) ? data.strokes : [];
    for (const savedStroke of savedStrokes) {
      if (!Array.isArray(savedStroke)) continue;
      const stroke = [];
      for (const entry of savedStroke) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [x, y] = entry;
        if (
          !Number.isInteger(x) ||
          !Number.isInteger(y) ||
          x < GRID_MIN ||
          x > GRID_MAX ||
          y < GRID_MIN ||
          y > GRID_MAX
        ) {
          continue;
        }
        const existingShapes = pointShapes.get(pointKey(x, y));
        const shape =
          entry.length >= 3 ? entry[2] : existingShapes?.values().next().value;
        if (VALID_SHAPES.includes(shape) && existingShapes?.has(shape)) {
          stroke.push([x, y, shape]);
        }
      }
      if (stroke.length) strokes.push(stroke);
    }

    return { points, strokes };
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          field += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (quoted) throw new Error("The CSV contains an unfinished quoted value.");
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function parseCsv(text) {
    const rows = parseCsvRows(String(text).replace(/^\uFEFF/, ""));
    if (!rows.length) throw new Error("The CSV file is empty.");

    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const xIndex = headers.indexOf("x");
    const yIndex = headers.indexOf("y");
    const shapeIndex = headers.indexOf("shape");
    if (xIndex < 0 || yIndex < 0) {
      throw new Error('The CSV needs columns named "x" and "y".');
    }

    const cells = new Map();
    let importedRows = 0;
    rows.slice(1).forEach((row, rowOffset) => {
      if (row.every((value) => !value.trim())) return;
      const xValue = Number(row[xIndex]);
      const yValue = Number(row[yIndex]);
      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
        throw new Error(
          `CSV row ${rowOffset + 2} has a non-numeric x or y value.`,
        );
      }
      const x = clampCoordinate(xValue);
      const y = clampCoordinate(yValue);
      const shape = normaliseShape(
        shapeIndex >= 0 ? row[shapeIndex] : "circle",
      );
      const key = pointKey(x, y);
      const point = cells.get(key) || { x, y, shapes: [] };
      point.shapes.push(shape);
      cells.set(key, point);
      importedRows += 1;
    });

    if (!importedRows)
      throw new Error("The CSV does not contain any data rows.");
    return { points: [...cells.values()], importedRows };
  }

  function csvEscape(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function projectToCsv(points) {
    const rows = [["x", "y", "shape"]];
    [...points]
      .sort((left, right) => left.x - right.x || left.y - right.y)
      .forEach((point) => {
        point.shapes.forEach((shape) => rows.push([point.x, point.y, shape]));
      });
    return `${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;
  }

  function strokeGroups(gridCells, strokes) {
    const groups = [];
    const covered = new Set();

    for (const stroke of strokes) {
      let current = [];
      let currentShape = null;
      for (const [x, y, savedShape] of stroke) {
        const shapes = gridCells.get(pointKey(x, y)) || [];
        const shape = shapes.includes(savedShape) ? savedShape : null;
        if (shape !== currentShape) {
          if (current.length >= 2)
            groups.push({ shape: currentShape, points: current });
          current = [];
          currentShape = shape;
        }
        if (shape !== null) {
          covered.add(shapePointKey(x, y, shape));
          const previous = current.at(-1);
          if (!previous || previous[0] !== x || previous[1] !== y)
            current.push([x, y]);
        }
      }
      if (current.length >= 2)
        groups.push({ shape: currentShape, points: current });
    }
    return { groups, covered };
  }

  function lineGroups(gridCells, strokes) {
    const { groups, covered } = strokeGroups(gridCells, strokes);
    const visited = new Set(covered);

    for (const [key, shapes] of gridCells.entries()) {
      const [startX, startY] = key.split(",").map(Number);
      for (const shape of new Set(shapes)) {
        const startKey = shapePointKey(startX, startY, shape);
        if (visited.has(startKey)) continue;
        const stack = [[startX, startY]];
        const found = [];
        visited.add(startKey);

        while (stack.length) {
          const [x, y] = stack.pop();
          found.push([x, y]);
          for (const [nextX, nextY] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ]) {
            const nextKey = shapePointKey(nextX, nextY, shape);
            if (visited.has(nextKey)) continue;
            if ((gridCells.get(pointKey(nextX, nextY)) || []).includes(shape)) {
              visited.add(nextKey);
              stack.push([nextX, nextY]);
            }
          }
        }
        if (found.length >= 2) groups.push({ shape, points: found });
      }
    }

    return groups.map((group, index) => ({ ...group, id: index }));
  }

  const api = {
    GRID_MIN,
    GRID_MAX,
    VALID_SHAPES,
    clampCoordinate,
    lineGroups,
    normaliseProject,
    normaliseShape,
    parseCsv,
    pointKey,
    projectToCsv,
    roundHalfEven,
    shapePointKey,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalScope.RobinCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
