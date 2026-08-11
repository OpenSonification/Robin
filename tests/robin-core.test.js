"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  lineGroups,
  normaliseProject,
  parseCsv,
  pointKey,
  projectToCsv,
  roundHalfEven,
} = require("../robin-core.js");

test("coordinate rounding matches Robin's Python half-even behavior", () => {
  assert.equal(roundHalfEven(2.5), 2);
  assert.equal(roundHalfEven(3.5), 4);
  assert.equal(roundHalfEven(-2.5), -2);
  assert.equal(roundHalfEven(-3.5), -4);
});

test("CSV import rounds, clamps, groups cells, and normalises shapes", () => {
  const result = parseCsv(
    "x,y,shape\r\n-5,-5,square\r\n2.6,1.4,TRIANGLE\r\n10,-8,star\r\n0,0,\r\n0,0,diamond\r\n",
  );

  assert.equal(result.importedRows, 5);
  assert.deepEqual(result.points, [
    { x: -5, y: -5, shapes: ["square"] },
    { x: 3, y: 1, shapes: ["triangle"] },
    { x: 5, y: -5, shapes: ["circle"] },
    { x: 0, y: 0, shapes: ["circle", "diamond"] },
  ]);
});

test("CSV import reports missing headers and invalid coordinates", () => {
  assert.throws(() => parseCsv("a,b\n1,2\n"), /columns named "x" and "y"/);
  assert.throws(() => parseCsv("x,y\nleft,2\n"), /row 2/);
});

test("project normalisation reads old points and validates stroke shapes", () => {
  const project = normaliseProject({
    points: [
      { x: 0, y: 0, shape: "circle" },
      { x: 1, y: 0, shapes: ["square"] },
    ],
    strokes: [
      [
        [0, 0, "circle"],
        [1, 0, "square"],
        [4, 4, "diamond"],
      ],
    ],
  });

  assert.deepEqual(project.points[0].shapes, ["circle"]);
  assert.deepEqual(project.strokes, [
    [
      [0, 0, "circle"],
      [1, 0, "square"],
    ],
  ]);
});

test("CSV export emits one sorted row for every stored shape", () => {
  const csv = projectToCsv([
    { x: 1, y: 2, shapes: ["diamond", "circle"] },
    { x: -1, y: 0, shapes: ["square"] },
  ]);

  assert.equal(
    csv,
    "x,y,shape\r\n-1,0,square\r\n1,2,diamond\r\n1,2,circle\r\n",
  );
});

test("line grouping recognises imported neighbours and recorded wiggles", () => {
  const cells = new Map([
    [pointKey(-2, 0), ["square"]],
    [pointKey(-1, 0), ["square"]],
    [pointKey(0, 0), ["square", "diamond"]],
    [pointKey(0, 1), ["diamond"]],
    [pointKey(1, 1), ["diamond"]],
  ]);
  const strokes = [
    [
      [0, 0, "diamond"],
      [0, 1, "diamond"],
      [1, 1, "diamond"],
    ],
  ];

  const groups = lineGroups(cells, strokes);
  assert.deepEqual(
    groups.map((group) => [group.shape, group.points.length]).sort(),
    [
      ["diamond", 3],
      ["square", 3],
    ],
  );
});
