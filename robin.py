import os
import time
import json
import numpy as np
import pygame

sample_rate = 44100
grid_min = -5
grid_max = 5
root_freq = 130.81
cell_size = 34
window_size = (480, 540)
pentatonic_steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]

script_dir = os.path.dirname(os.path.abspath(__file__))
projects_dir = os.path.join(script_dir, "robin projects")

# grid_cells maps an (x, y) tuple to a list of shape names drawn on that cell
grid_cells = {}
cursor_x = 0
cursor_y = 0
active_shape = "circle"
current_project = None
naming_mode = False
name_buffer = ""


def clamp_value(value, low, high):
    return max(low, min(high, value))


def row_to_freq(row):
    index = row + 5
    semitones = pentatonic_steps[index]
    return root_freq * (2 ** (semitones / 12))


def row_to_pitch_ratio(row):
    # how much to raise or lower a plot point's own sound based on its row,
    # relative to the centre row (ratio of 1.0 at y = 0)
    index = row + 5
    centre_semitones = pentatonic_steps[5]
    semitones = pentatonic_steps[index] - centre_semitones
    return 2 ** (semitones / 12)


def col_to_pan(col):
    return col / 5.0


def make_envelope(length, attack, release):
    envelope = np.ones(length)
    attack_len = max(1, int(length * attack))
    release_len = max(1, int(length * release))
    envelope[:attack_len] = np.linspace(0, 1, attack_len)
    envelope[-release_len:] = np.linspace(1, 0, release_len)
    return envelope


def make_tone(freq, duration, volume):
    length = int(sample_rate * duration)
    t = np.linspace(0, duration, length, False)
    wave = np.sin(2 * np.pi * freq * t)
    wave = wave + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    wave = wave + 0.15 * np.sin(2 * np.pi * freq * 3 * t)
    wave = wave * make_envelope(length, 0.08, 0.35)
    return wave * volume


def make_pure_tone(freq, duration, volume, attack, release):
    # a plain sine with no added overtones, for a softer and rounder sound
    length = int(sample_rate * duration)
    t = np.linspace(0, duration, length, False)
    wave = np.sin(2 * np.pi * freq * t)
    wave = wave * make_envelope(length, attack, release)
    return wave * volume


def mix_waves(wave_one, wave_two):
    length = max(len(wave_one), len(wave_two))
    a = np.pad(wave_one, (0, length - len(wave_one)))
    b = np.pad(wave_two, (0, length - len(wave_two)))
    return a + b


def mix_stereo(stereo_one, stereo_two):
    length = max(stereo_one.shape[0], stereo_two.shape[0])
    a = np.pad(stereo_one, ((0, length - stereo_one.shape[0]), (0, 0)))
    b = np.pad(stereo_two, ((0, length - stereo_two.shape[0]), (0, 0)))
    return a + b


def pan_wave(wave, pan):
    angle = (pan + 1) * np.pi / 4
    left_gain = np.cos(angle)
    right_gain = np.sin(angle)
    stereo = np.zeros((len(wave), 2))
    stereo[:, 0] = wave * left_gain
    stereo[:, 1] = wave * right_gain
    return stereo


def to_sound(stereo):
    clipped = np.clip(stereo, -1, 1)
    samples = (clipped * 32767).astype(np.int16)
    samples = np.ascontiguousarray(samples)
    return pygame.sndarray.make_sound(samples)


def square_sound(pitch_ratio=1.0):
    freq = 400 * pitch_ratio
    part_one = make_tone(freq, 0.05, 0.4)
    gap = np.zeros(int(sample_rate * 0.02))
    part_two = make_tone(freq, 0.05, 0.4)
    return np.concatenate([part_one, gap, part_two])


def circle_sound(pitch_ratio=1.0):
    # pure sine with a gentle attack and release, so it sounds smooth and rounded
    return make_pure_tone(600 * pitch_ratio, 0.26, 0.32, attack=0.25, release=0.5)


def triangle_sound(pitch_ratio=1.0):
    notes = [500, 650, 800]
    pieces = []
    for note in notes:
        pieces.append(make_tone(note * pitch_ratio, 0.05, 0.35))
        pieces.append(np.zeros(int(sample_rate * 0.01)))
    return np.concatenate(pieces)


def make_sparkle(freq):
    # a short bright chime with a quick attack and a decaying tail, for a twinkling feel
    duration = 0.05
    length = int(sample_rate * duration)
    t = np.linspace(0, duration, length, False)
    wave = np.sin(2 * np.pi * freq * t)
    wave = wave + 0.2 * np.sin(2 * np.pi * freq * 2 * t)
    wave = wave * make_envelope(length, 0.05, 0.7)
    return wave * 0.22


def diamond_sound(pitch_ratio=1.0):
    # four quick high sparkles instead of a clashing two note chord
    sparkle_notes = [1600, 2200, 1800, 2400]
    pieces = []
    for note in sparkle_notes:
        pieces.append(make_sparkle(note * pitch_ratio))
        pieces.append(np.zeros(int(sample_rate * 0.015)))
    return np.concatenate(pieces)


shape_sounds = {
    "square": square_sound,
    "circle": circle_sound,
    "triangle": triangle_sound,
    "diamond": diamond_sound,
}


def draw_click():
    length = int(sample_rate * 0.015)
    noise = np.random.uniform(-1, 1, length)
    envelope = make_envelope(length, 0.1, 0.6)
    return noise * envelope * 0.12


def plotted_stereo(x, y):
    shapes = grid_cells.get((x, y))
    if not shapes:
        return None
    pan = col_to_pan(x)
    pitch_ratio = row_to_pitch_ratio(y)
    combined = None
    for shape in shapes:
        overlay = shape_sounds[shape](pitch_ratio)
        combined = overlay if combined is None else mix_waves(combined, overlay)
    return pan_wave(combined, pan)


def cell_stereo(x, y):
    freq = row_to_freq(y)
    pan = col_to_pan(x)
    pitch_ratio = row_to_pitch_ratio(y)
    base = make_tone(freq, 0.22, 0.45)
    for shape in grid_cells.get((x, y), []):
        overlay = shape_sounds[shape](pitch_ratio)
        base = mix_waves(base, overlay)
    return pan_wave(base, pan)


def play_cell(x, y, drawing):
    stereo = cell_stereo(x, y)
    if drawing:
        click = pan_wave(draw_click(), col_to_pan(x))
        stereo = mix_stereo(stereo, click)
    sound = to_sound(stereo)
    sound.play()


def ensure_projects_dir():
    os.makedirs(projects_dir, exist_ok=True)


def project_path(name):
    return os.path.join(projects_dir, name + ".json")


def save_project():
    if not current_project:
        return
    ensure_projects_dir()
    points = [{"x": x, "y": y, "shapes": shapes} for (x, y), shapes in grid_cells.items()]
    data = {"points": points}
    with open(project_path(current_project), "w") as file:
        json.dump(data, file)


def load_project(name):
    global grid_cells
    with open(project_path(name)) as file:
        data = json.load(file)
    grid_cells = {}
    for point in data["points"]:
        # older project files store a single "shape" instead of a "shapes" list
        shapes = point["shapes"] if "shapes" in point else [point["shape"]]
        grid_cells[(point["x"], point["y"])] = shapes


def latest_project():
    ensure_projects_dir()
    files = [f for f in os.listdir(projects_dir) if f.endswith(".json")]
    if not files:
        return None
    files.sort(key=lambda f: os.path.getmtime(os.path.join(projects_dir, f)))
    return files[-1][:-5]


def default_name():
    stamp = time.strftime("%Y%m%d %H%M%S")
    return "project " + stamp


def new_project(name):
    global current_project, grid_cells, cursor_x, cursor_y
    current_project = name
    grid_cells = {}
    cursor_x = 0
    cursor_y = 0
    save_project()


def move_cursor(dx, dy):
    global cursor_x, cursor_y
    cursor_x = clamp_value(cursor_x + dx, grid_min, grid_max)
    cursor_y = clamp_value(cursor_y + dy, grid_min, grid_max)
    play_cell(cursor_x, cursor_y, False)


def draw_here():
    # append rather than overwrite, so a second or third point on the same cell layers up
    grid_cells.setdefault((cursor_x, cursor_y), []).append(active_shape)
    play_cell(cursor_x, cursor_y, True)
    save_project()


def clear_here():
    if (cursor_x, cursor_y) in grid_cells:
        del grid_cells[(cursor_x, cursor_y)]
    play_cell(cursor_x, cursor_y, False)
    save_project()


def draw_and_move(dx, dy):
    global cursor_x, cursor_y
    cursor_x = clamp_value(cursor_x + dx, grid_min, grid_max)
    cursor_y = clamp_value(cursor_y + dy, grid_min, grid_max)
    draw_here()


def clear_and_move(dx, dy):
    global cursor_x, cursor_y
    cursor_x = clamp_value(cursor_x + dx, grid_min, grid_max)
    cursor_y = clamp_value(cursor_y + dy, grid_min, grid_max)
    clear_here()


def play_row(screen):
    global cursor_x
    for x in range(grid_min, grid_max + 1):
        cursor_x = x
        play_cell(x, cursor_y, False)
        draw_grid(screen)
        pygame.time.wait(110)


def play_column(screen):
    global cursor_y
    for y in range(grid_min, grid_max + 1):
        cursor_y = y
        play_cell(cursor_x, y, False)
        draw_grid(screen)
        pygame.time.wait(110)


def sweep_columns(screen):
    global cursor_x
    for x in range(grid_min, grid_max + 1):
        cursor_x = x
        combined = None
        for y in range(grid_min, grid_max + 1):
            stereo = plotted_stereo(x, y)
            if stereo is not None:
                combined = stereo if combined is None else mix_stereo(combined, stereo)
        if combined is not None:
            to_sound(combined).play()
        draw_grid(screen)
        pygame.time.wait(160)


def sweep_rows(screen):
    global cursor_y
    for y in range(grid_min, grid_max + 1):
        cursor_y = y
        combined = None
        for x in range(grid_min, grid_max + 1):
            stereo = plotted_stereo(x, y)
            if stereo is not None:
                combined = stereo if combined is None else mix_stereo(combined, stereo)
        if combined is not None:
            to_sound(combined).play()
        draw_grid(screen)
        pygame.time.wait(160)


def start_naming():
    global naming_mode, name_buffer
    naming_mode = True
    name_buffer = ""


def handle_naming_key(event):
    global naming_mode, name_buffer
    if event.key == pygame.K_RETURN:
        final_name = name_buffer.strip() or default_name()
        new_project(final_name)
        naming_mode = False
    elif event.key == pygame.K_ESCAPE:
        naming_mode = False
    elif event.key == pygame.K_BACKSPACE:
        name_buffer = name_buffer[:-1]
    elif event.unicode and event.unicode.isprintable():
        name_buffer = name_buffer + event.unicode


direction_keys = {
    pygame.K_UP: (0, 1),
    pygame.K_DOWN: (0, -1),
    pygame.K_LEFT: (-1, 0),
    pygame.K_RIGHT: (1, 0),
}
shape_keys = {
    pygame.K_s: "square",
    pygame.K_c: "circle",
    pygame.K_t: "triangle",
    pygame.K_d: "diamond",
}


def handle_key(event, screen):
    global active_shape
    mods = pygame.key.get_mods()
    pressed = pygame.key.get_pressed()
    cmd_down = bool(mods & pygame.KMOD_META) or bool(mods & pygame.KMOD_CTRL)
    if naming_mode:
        handle_naming_key(event)
        return
    if cmd_down and event.key == pygame.K_n:
        start_naming()
        return
    if event.key in direction_keys:
        dx, dy = direction_keys[event.key]
        shift_down = bool(mods & pygame.KMOD_SHIFT)
        backspace_down = pressed[pygame.K_BACKSPACE]
        if shift_down:
            draw_and_move(dx, dy)
        elif backspace_down:
            clear_and_move(dx, dy)
        else:
            move_cursor(dx, dy)
    elif event.key in (pygame.K_LSHIFT, pygame.K_RSHIFT):
        # shift on its own drops the active shape on the focused cell without moving
        draw_here()
    elif event.key == pygame.K_BACKSPACE:
        clear_here()
    elif event.key in shape_keys:
        active_shape = shape_keys[event.key]
    elif event.key == pygame.K_1:
        play_row(screen)
    elif event.key == pygame.K_2:
        play_column(screen)
    elif event.key == pygame.K_3:
        sweep_columns(screen)
    elif event.key == pygame.K_4:
        sweep_rows(screen)


shape_colour = (230, 230, 240)
grid_line_colour = (70, 70, 90)
background_colour = (20, 20, 30)
cursor_colour = (255, 180, 80)
text_colour = (220, 220, 230)


def grid_to_screen(x, y):
    screen_x = 240 + x * cell_size
    screen_y = 240 - y * cell_size
    return screen_x, screen_y


def draw_shape_icon(screen, cx, cy, shape, offset=0):
    # offset lets several layered shapes on one cell be drawn without fully overlapping
    cx = cx + offset
    cy = cy + offset
    if shape == "square":
        pygame.draw.rect(screen, shape_colour, (cx - 8, cy - 8, 16, 16), 2)
    elif shape == "circle":
        pygame.draw.circle(screen, shape_colour, (cx, cy), 9, 2)
    elif shape == "triangle":
        points = [(cx, cy - 9), (cx - 9, cy + 7), (cx + 9, cy + 7)]
        pygame.draw.polygon(screen, shape_colour, points, 2)
    elif shape == "diamond":
        points = [(cx, cy - 10), (cx + 10, cy), (cx, cy + 10), (cx - 10, cy)]
        pygame.draw.polygon(screen, shape_colour, points, 2)


def draw_status(screen, font):
    project_text = "project: " + (current_project or "none")
    shape_text = "shape: " + active_shape
    position_text = "at " + str(cursor_x) + ", " + str(cursor_y)
    line = project_text + "   " + shape_text + "   " + position_text
    if naming_mode:
        line = "new project name: " + name_buffer + "  (enter to confirm)"
    text_surface = font.render(line, True, text_colour)
    screen.blit(text_surface, (10, 500))


def draw_grid(screen):
    screen.fill(background_colour)
    for gx in range(grid_min, grid_max + 1):
        for gy in range(grid_min, grid_max + 1):
            sx, sy = grid_to_screen(gx, gy)
            rect = pygame.Rect(sx - cell_size // 2, sy - cell_size // 2, cell_size, cell_size)
            pygame.draw.rect(screen, grid_line_colour, rect, 1)
            shapes = grid_cells.get((gx, gy), [])
            for index, shape in enumerate(shapes):
                draw_shape_icon(screen, sx, sy, shape, offset=index * 3)
    cx, cy = grid_to_screen(cursor_x, cursor_y)
    pygame.draw.circle(screen, cursor_colour, (cx, cy), 6)
    font = pygame.font.SysFont(None, 20)
    draw_status(screen, font)
    pygame.display.flip()


def main():
    global current_project
    pygame.mixer.pre_init(sample_rate, -16, 2, 512)
    pygame.init()
    screen = pygame.display.set_mode(window_size)
    pygame.display.set_caption("Robin")
    ensure_projects_dir()
    found_project = latest_project()
    if found_project:
        current_project = found_project
        load_project(found_project)
    else:
        new_project(default_name())
    running = True
    clock = pygame.time.Clock()
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                handle_key(event, screen)
        draw_grid(screen)
        clock.tick(60)
    save_project()
    pygame.quit()


if __name__ == "__main__":
    main()
