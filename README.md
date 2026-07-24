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

On desktop, the website is a simple two-column page with keyboard instructions
on the left and the sound grid on the right. On iOS and other touch devices,
the grid appears first, followed by dedicated mobile controls and concise
touch instructions. Desktop-only shortcut documentation is hidden there.

The map is a semantic HTML grid rather than a drawing-only canvas:

- On desktop, the focused grid cell receives focus when the page opens, so the
  arrow keys work immediately.
- Arrow keys also return focus to the grid after any on-screen control is
  selected.
- Only the current cell is in the normal tab order, so all 121 cells do not
  create a long tab sequence.
- A screen reader announces each cell's x and y coordinates followed by any
  plotted shapes. Empty cells announce only their coordinates.
- Changes are reported through a polite live status region.
- Desktop actions are keyboard-accessible; touch devices provide labelled
  movement, shape, plotting, erasing, and playback controls.
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

## Mobile controls

On iOS and other touch devices:

- Tap a map cell directly or use the four movement buttons.
- Choose a shape from the native shape menu.
- Use **Plot shape** or **Erase last point** at the selected coordinates.
- Use the four playback buttons to hear a row, column, plotted columns, or
  plotted rows.
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
