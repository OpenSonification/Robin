# Robin

Robin is a sonification and visualisation tool for scatter-plot data and bar
charts, built for blind, visually impaired, and sighted users as part of the
195th European Study Group with Industry's Sonification project.

Sound points are plotted on an 11 × 11 grid running from −5 to 5 on both axes,
with zero at the centre. Users can place points individually using one of four
shapes—circle, square, triangle, or diamond—or draw them continuously as sound
while moving. Everything is also shown on screen: the cursor is a small circle,
and each plotted shape is drawn as an outline. Audio and visual settings can be
modified to suit the user's requirements.

Robin was developed using the VoiceOver screen reader on a MacBook Pro. It has
been built and tested on macOS but should also work on Windows, and feedback
from anyone using it with a Windows screen reader such as NVDA or JAWS would be
welcome. The Sonification team's work at the European Study Group with Industry
was carried out in memory of Dr Robin Williams, with a report on the research
currently in development.

Website: <https://opensonification.github.io/Robin/>

- Moving from left to right pans the audio from the left channel to the right.
- Moving from bottom to top raises the pitch on a pentatonic scale.
- Plotted shapes add their own sound to the cell's position tone.

Robin has two versions:

1. A browser version in `index.html`, ready for GitHub Pages.
2. The original desktop version in `robin.py`, built with Pygame.

## Try the website locally

No JavaScript packages or build step are required. From the project folder,
start Python's small local web server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser. Stop the server with
`Ctrl+C`.

The browser version uses the Web Audio API. With ordinary touch, the first cell
tap starts audio and plays that cell. VoiceOver users turn on the dedicated
VoiceOver controls once before exploring the map; that explicit activation is
required by iOS to start web audio. Headphones make the left-to-right panning
easiest to hear.

Every page load starts from Robin's two-point example; the website does not
restore or autosave map data. Use **Save JSON** or **Save CSV** before leaving,
**Open JSON** to replace the map, **Import CSV** to add data, or **New map** to
start again. JSON files preserve drawn strokes for Robin 0.2's connected-line
playback. Browser settings are saved separately and restored on the next visit.
Older Robin map storage is removed before the application script runs, and an
iOS page restored from WebKit's back-forward cache also returns to the example.

### Browser accessibility

The same website automatically selects one of two separate interfaces. Desktop
browsers receive the keyboard interface, with shortcut instructions beside the
map. Touchscreen phones and tablets receive the touch interface, with the map
first and a dedicated VoiceOver actions panel immediately above it. The
inactive interface is removed from the layout and accessibility tree, rather
than merely having its instructions reworded.

Because mobile screen-reader support for the custom grid and rotor actions is
not yet consistent, touchscreen visitors see an accessibility notice
recommending the desktop browser or standalone desktop version. The notice
links to the current standalone Robin 0.2 folder. Both the desktop and touch
interfaces begin with an obvious **Download README** link. It is the first
focusable element in the document, appears directly below the **Robin** title,
and receives focus when the page opens. **Skip to the sound grid** and
**Settings** follow it as ordinary, labelled controls so they are available in
normal VoiceOver navigation before the map.

The map uses semantic HTML controls rather than a drawing-only canvas:

- The page opens with focus on **Download README**, followed by **Skip to the
  sound grid** and **Settings**. The skip link moves directly to the map; the
  **About Robin** explanation and **How to use it** instructions follow it in
  the document's reading order.
- Arrow keys also return focus to the grid after any on-screen control is
  selected.
- Only the current cell is in the normal tab order, so all 121 cells do not
  create a long tab sequence.
- While the desktop grid has focus, Tab and Shift+Tab jump between plotted
  points. Escape releases the grid and moves screen-reader focus to the About
  Robin explanation.
- On desktop, the map is one labelled group of native cell buttons rather than
  an ARIA table. A screen reader announces each cell's x and y coordinates
  followed by any plotted shapes, while VoiceOver's Control-Option navigation
  no longer adds repeated "row N of 11" announcements. Empty cells announce
  only their coordinates.
- On iOS, VoiceOver controls are an explicit mode, separate from Robin's
  ordinary direct-touch gestures. Activating **Turn on VoiceOver controls**
  once unlocks web audio and exposes a minimal **Cell** name on every native
  cell button. Moving VoiceOver focus to a cell then plays its position tone,
  including when the cell is empty; plotted-shape sounds are layered on top.
  Double-tapping plots the selected shape exactly once. Robin waits 1.8 seconds
  for VoiceOver's **Cell, button** announcement to finish before playing cell,
  plot, and delete audio.
- The map overview is available from the **Explain the map** disclosure on
  touch devices instead of being repeated whenever a cell is selected.
- Shape selection, plotting, deleting, and the four map sweeps are exposed as
  native labelled controls in the always-expanded **VoiceOver cell actions**
  panel above the grid while VoiceOver mode is on. Moving focus to an action
  turns that button blue and updates the visible **Selected action** text;
  double-tapping runs it.
- Each touch grid cell also uses the experimental `aria-actions` relationship
  to expose Delete, Play row, Play column, Sweep left to right, and Sweep bottom
  to top as custom actions. Supporting WebKit versions map those existing
  buttons into VoiceOver's Actions rotor. Older browsers ignore the attribute,
  so the complete visible action panel remains the reliable fallback.
- Changes are reported through a polite live status region.
- Desktop actions are keyboard-accessible. The touch interface provides shape,
  plotting, erasing, point navigation, undo, playback, file, and settings
  controls, but no directional pad or keyboard shortcut documentation.
- Visible focus indicators are provided.
- Increased-contrast and reduced-motion browser preferences are respected.

## Run the Python desktop version

Requirements:

- Python 3
- `pygame`
- `numpy`

Create a virtual environment and install the dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 robin.py
```

On Windows PowerShell, activate the environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

Desktop projects save automatically as JSON files in the `robin projects`
folder next to `robin.py`. The most recently edited project opens when Robin
starts.

## Browser keyboard controls

| Key                      | Action                                            |
| ------------------------ | ------------------------------------------------- |
| Arrow keys               | Move one cell and hear its position               |
| `Shift`                  | Plot the active shape on the current cell         |
| `Shift` + arrow keys     | Plot while moving                                 |
| `Backspace`              | Erase the most recently plotted point in the cell |
| `Backspace` + arrow keys | Erase while moving                                |
| `Tab` / `Shift+Tab`      | Jump to the next / previous plotted point         |
| `0`                      | Return to the centre                              |
| `Command+A` / `Ctrl+A`   | Select every point; Backspace clears them         |
| `S` / `C` / `T` / `D`    | Select square / circle / triangle / diamond       |
| `1`                      | Play the current row from left to right           |
| `2`                      | Play the current column from bottom to top        |
| `3`                      | Sweep plotted shapes by column                    |
| `4`                      | Sweep plotted shapes by row                       |
| `Space`                  | Turn the display black or restore the graphics    |
| `Command+N` / `Ctrl+N`   | Start a new empty map                             |
| `Command+I` / `Ctrl+I`   | Import CSV data                                   |
| `Command+Z` / `Ctrl+Z`   | Undo one of the last 20 edits                     |
| `Control+,`              | Open Robin settings                               |
| `Escape`                 | Move from the grid to the About Robin explanation |

The on-screen Previous point, Next point, Centre, Undo, Settings, and file
buttons provide alternatives to the shortcuts.

## Touchscreen website

On iOS and other touch devices:

- Every page load starts with a square at x -2, y -2 and a circle at x 2, y 2,
  giving users two visible and audible example points to explore. Website
  changes last for the current session only unless the user chooses **Save
  JSON** or **Save CSV**.
- With VoiceOver off, the first tap starts Robin audio and plays that cell when
  the finger lifts, without changing it. Keeping one finger down and dragging
  then plays each crossed cell; double-tapping a cell plots the selected shape.
- With VoiceOver on, first activate **Turn on VoiceOver controls** once. This
  starts audio without changing the map. Then move focus by touching or swiping
  to a map cell to hear its position tone without a double-tap. Robin waits 1.8
  seconds so the tone follows VoiceOver's short **Cell, button** announcement.
  A VoiceOver double-tap is used only to plot the always-active shape. An empty
  cell plays the position tone by itself, while plotted cells layer their shape
  sounds over it. VoiceOver's standard three-finger swipe scrolls the page;
  Robin's direct-touch gesture interception is disabled in this mode.
- On Safari versions supporting `aria-actions`, leave VoiceOver focus on the
  target grid cell. Rotate two fingers until VoiceOver announces **Actions**,
  then swipe up or down with one finger to choose one of these commands:
  **Delete**, **Play row**, **Play column**, **Sweep left to right**, or **Sweep
  bottom to top**. Double-tap to perform the announced command. The focused
  cell stays selected while the referenced visible button runs the same action.
- Plotting remains the cell's normal VoiceOver double-tap rather than a rotor
  action. Drawing a line is not exposed because Robin does not yet have a line
  drawing operation.
- The four directional buttons are intentionally omitted; movement happens
  directly on the grid.
- Circle is selected by default and one shape is always active. Choose another
  shape from the native shape menu whenever needed.
- Use **Plot shape** as an alternative plotting control or **Delete focused
  point** to erase the most recently plotted shape at the focused coordinates.
- Use **Play focused row**, **Play focused column**, **Sweep left to right**, or
  **Sweep bottom to top** for the four playback modes.
- Previous/next point, centre, undo, settings, CSV, and JSON controls are
  available below the grid.
- Use **Turn screen off** for presentation mode, then tap the black screen to
  restore it.

## Shape sounds

| Shape    | Sound                    |
| -------- | ------------------------ |
| Square   | Two short taps           |
| Circle   | One smooth, rounded tone |
| Triangle | Three quick rising notes |
| Diamond  | Four bright sparkles     |

The sound for a plotted shape changes pitch with its row and pans with its
column. Multiple shapes can be layered on the same cell. Repeated instances of
the same shape are stored and drawn separately but sound once, preventing an
accidental volume increase. The highest plotted row is slightly pitch-trimmed
to keep its shape sounds comfortable.

The browser renders these sounds from a direct JavaScript port of the waveform
formulas in the standalone Robin 0.2 `audio.py` master. It retains the original
frequencies, note sequences, envelopes, harmonics, circle chorus, chord layers
and echoes, gaps, tremolo, panning, levels, system cues, and connected-line
sounds. The rendered samples use the same 16-bit PCM quantisation before being
passed to Web Audio for playback without an extra dynamics compressor; Robin
0.2's original peak normalisation is used instead. If optional vertical
elevation is enabled, the browser applies its native HRTF to those master
waveforms because the desktop version's Slab KEMAR engine is not available in
a web page.

When **Smooth connected points** is enabled in Settings, adjoining points of
the same shape play as one sustained sound during row, column, and sweep
playback. Shift-drawn strokes retain their order, so sweeps can follow wiggly
lines; connected imported CSV points are detected automatically.

Erasing removes only the most recently plotted point in a cell and plays a
short bin sound. Presentation mode plays a falling chime when the display turns
black and a rising chime when it returns.

## CSV files

CSV import expects `x` and `y` columns and accepts an optional `shape` column.
Valid shapes are `square`, `circle`, `triangle`, and `diamond`; missing or
unrecognised values become circles. Coordinates are rounded to whole cells and
clamped to the grid's −5 to 5 range. Import adds rows to the current map and can
be undone in one step.

Web browsers do not allow a page to silently overwrite an imported local file.
**Save CSV** therefore downloads an updated copy containing every later edit.

## Browser settings

Settings cover stereo pan, HRTF vertical space where the browser supports it,
axis tremolo direction, pentatonic or chord pitch, pitch range, row/column and
sweep speed, position/point/system volume, connected-line smoothing, and five
colour themes. Pitch and tremolo modes are exclusive across the two axes, as in
Robin 0.2. Settings persist in local browser storage; map data does not.

## Publish with GitHub Pages

The site is fully static and is already arranged to publish from the repository
root:

1. Push this folder to a GitHub repository.
2. On GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/(root)` folder, then select **Save**.
5. When deployment finishes, open
   <https://opensonification.github.io/Robin/>.

GitHub Pages uses `index.html` as the entry point. The included `.nojekyll` file
keeps deployment simple and prevents Jekyll processing.

## Project file format

Each project is a JSON object containing a `points` list and an optional
`strokes` list. Every point has an `x`, `y`, and `shapes` value. Each stroke
entry stores x, y, and shape in drawing order:

```json
{
  "points": [
    {
      "x": 0,
      "y": 1,
      "shapes": ["circle", "diamond"]
    }
  ],
  "strokes": [
    [
      [0, 1, "circle"],
      [1, 1, "circle"]
    ]
  ]
}
```

Both versions can also read older project files that use a single `shape`
property instead of the `shapes` list.

## Tests

The data-format and line-grouping tests use Node's built-in test runner:

```bash
node --test tests/robin-core.test.js
```
