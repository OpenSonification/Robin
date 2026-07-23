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

The browser version uses the Web Audio API. Your first interaction with the
grid enables audio. Headphones make the left-to-right panning easiest to hear.

The map saves automatically in that browser's local storage. Use **Save JSON**
to download a portable project file, **Open JSON** to load one, or **Clear map**
to start again. The JSON format is compatible with the desktop version.

### Browser accessibility

The website is intentionally a simple two-column page: instructions and
controls on the left, with the sound grid on the right. In a narrow or portrait
layout, the grid appears first and the instructions follow beneath it.

The map is a semantic HTML grid rather than a drawing-only canvas:

- The current grid cell receives focus when the page opens, so the arrow keys
  work immediately.
- Arrow keys also return focus to the grid after any on-screen control is
  selected.
- Only the current cell is in the normal tab order, so all 121 cells do not
  create a long tab sequence.
- A screen reader announces each cell's x and y coordinates, whether it is
  empty, and the shapes it contains.
- Changes are reported through a polite live status region.
- Every action is keyboard-accessible and visible focus indicators are
  provided.
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

## Shared controls

| Key | Action |
| --- | --- |
| Arrow keys | Move one cell and hear its position |
| `Shift` | Draw the active shape on the current cell |
| `Shift` + arrow keys | Draw while moving |
| `Backspace` | Erase the current cell |
| `S` / `C` / `T` / `D` | Select square / circle / triangle / diamond |
| `1` | Play the current row from left to right |
| `2` | Play the current column from bottom to top |
| `3` | Sweep plotted shapes by column |
| `4` | Sweep plotted shapes by row |

The website also provides on-screen controls for drawing, erasing, and shape
selection. The desktop version additionally supports `Backspace` + arrow keys
to erase while moving and `Command+N` or `Ctrl+N` to create a named project.

## Shape sounds

| Shape | Sound |
| --- | --- |
| Square | Two short taps |
| Circle | One smooth, rounded tone |
| Triangle | Three quick rising notes |
| Diamond | Four bright sparkles |

The sound for a plotted shape changes pitch with its row and pans with its
column. Multiple shapes can be layered on the same cell.

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
