# Robin

Robin is a sonification tool for scatter-plot data. It provides an 11 × 11
grid, from −5 to 5 on each axis, that can be explored and drawn on using sound.

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

The browser version uses the Web Audio API. On touch devices, the first cell
tap starts audio and plays that cell; there is no separate audio-start control.
Headphones make the left-to-right panning easiest to hear.

Every page load starts from Robin's two-point example; the website does not
restore or autosave browser state. Use **Save JSON** before leaving to download
a portable project file, **Open JSON** to load one during a session, or **Clear
map** to start again. The JSON format is compatible with the desktop version.
Older Robin storage is removed before the application script runs, and an iOS
page restored from WebKit's back-forward cache also returns to the example.

### Browser accessibility

The same website automatically selects one of two separate interfaces. Desktop
browsers receive the keyboard interface, with shortcut instructions beside the
map. Touchscreen phones and tablets receive the touch interface, with the map
first and dedicated VoiceOver controls below it. The inactive interface is
removed from the layout and accessibility tree, rather than merely having its
instructions reworded.

The map is a semantic HTML grid rather than a drawing-only canvas:

- On desktop, the focused grid cell receives focus when the page opens, so the
  arrow keys work immediately.
- Arrow keys also return focus to the grid after any on-screen control is
  selected.
- Only the current cell is in the normal tab order, so all 121 cells do not
  create a long tab sequence.
- On desktop, a screen reader announces each cell's x and y coordinates
  followed by any plotted shapes. Empty cells announce only their coordinates.
- On iOS, every map cell is exposed as a native button so VoiceOver users can
  find cells by touching the map or swiping through it. Moving VoiceOver focus
  to a cell always plays its position tone, including when the cell is empty;
  plotted-shape sounds are layered on top. Double-tapping plots the selected
  shape. Every touch cell has the same minimal **Sound** label, so VoiceOver
  does not speak coordinates or shape descriptions over Robin's audio.
- The map overview is available from the **Explain the map** disclosure on
  touch devices instead of being repeated whenever a cell is selected.
- Deleting and the four map sweeps are provided as labelled focused-cell
  controls. Web content cannot create UIKit `UIAccessibilityCustomAction`
  entries in VoiceOver's Actions rotor, so these native HTML controls provide
  the interoperable browser equivalent.
- Changes are reported through a polite live status region.
- Desktop actions are keyboard-accessible. The touch interface provides shape,
  plotting, erasing, and playback controls, but no directional pad or keyboard
  shortcut documentation.
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

## Desktop keyboard controls

| Key | Action |
| --- | --- |
| Arrow keys | Move one cell and hear its position |
| `Shift` | Plot the active shape on the current cell |
| `Shift` + arrow keys | Plot while moving |
| `Backspace` | Erase the most recently plotted point in the cell |
| `S` / `C` / `T` / `D` | Select square / circle / triangle / diamond |
| `1` | Play the current row from left to right |
| `2` | Play the current column from bottom to top |
| `3` | Sweep plotted shapes by column |
| `4` | Sweep plotted shapes by row |
| `Space` | Turn the display black or restore the graphics |

The desktop website uses the keyboard controls above for drawing, erasing,
shape selection, and playback. The Python version additionally supports
`Backspace` + arrow keys to erase while moving and `Command+N` or `Ctrl+N` to
create a named project.

## Touchscreen website

On iOS and other touch devices:

- Every page load starts with a square at x -2, y -2 and a circle at x 2, y 2,
  giving users two visible and audible example points to explore. Website
  changes last for the current session only unless the user chooses **Save
  JSON**.
- With VoiceOver off, the first tap starts Robin audio and plays that cell when
  the finger lifts, without changing it. Keeping one finger down and dragging
  then plays each crossed cell; double-tapping a cell plots the selected shape.
- With VoiceOver on, move focus by touching or swiping to a map cell to hear
  its position tone. If iOS has not started web audio yet, the first cell
  activation starts it; later focus changes play immediately. Use VoiceOver's
  double-tap to plot the selected shape. An empty cell plays the position tone
  by itself, while plotted cells layer their shape sounds over it.
- The four directional buttons are intentionally omitted; movement happens
  directly on the grid.
- Choose a shape from the native shape menu.
- Use **Plot shape** as an alternative plotting control or **Delete focused
  point** to erase the most recently plotted shape at the focused coordinates.
- Use **Play focused row**, **Play focused column**, **Sweep left to right**, or
  **Sweep bottom to top** for the four playback modes.
- Use **Turn screen off** for presentation mode, then tap the black screen to
  restore it.

## Shape sounds

| Shape | Sound |
| --- | --- |
| Square | Two short taps |
| Circle | One smooth, rounded tone |
| Triangle | Three quick rising notes |
| Diamond | Four bright sparkles |

The sound for a plotted shape changes pitch with its row and pans with its
column. Multiple shapes can be layered on the same cell. Repeated instances of
the same shape are stored and drawn separately but sound once, preventing an
accidental volume increase. The highest plotted row is slightly pitch-trimmed
to keep its shape sounds comfortable.

Erasing removes only the most recently plotted point in a cell and plays a
short bin sound. Presentation mode plays a falling chime when the display turns
black and a rising chime when it returns.

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

Each project is a JSON object containing a `points` list. Every point has an
`x`, `y`, and `shapes` value:

```json
{
  "points": [
    {
      "x": 0,
      "y": 1,
      "shapes": ["circle", "diamond"]
    }
  ]
}
```

Both versions can also read older project files that use a single `shape`
property instead of the `shapes` list.
