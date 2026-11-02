# Master Video & Visual Production Blueprint (`mastervideoprompts.md`)

This document captures the complete **Y3K Liquid-Chrome / Apple-Keynote** visual, motion, 3D extrusion, and procedural sound-design pipeline used to produce the **Mitrixo ECHO** reveal videos, executive pitch decks, and extruded product visuals. You can reuse this exact blueprint for any future product by swapping out the product screenshots, chapter copy, and brand name.

---

## 1. Visual Direction & Aesthetic System

### A. Core Look ("Y3K Liquid-Chrome + Apple Pro Display XDR")
- **Canvas**: Pure obsidian void (`#000000` / linear `0.0`) with subtle radial vignette (`G["vign"]`) and 6-frame cycling organic film grain (`0.0035` linear amplitude).
- **Liquid Chrome Material (Heightfield + Studio Environment Map)**:
  - **Metaball Field (`metaball_g`)**: Computes an implicit surface from moving 2D/3D spheres:
    $$F(x,y) = \sum_i \frac{r_i^2}{(x - x_i)^2 + (y - y_i)^2 + 1}$$
  - **Inflation Glyph Field (`init_worker`)**: Renders bold brand typography (`ECHO`, or any product name) into a binary mask, applies an L2 Euclidean Distance Transform (`cv2.distanceTransform`), blurs by $0.36 \times R_{\max}$, and shapes the bevel profile with `g ** 0.75 * edge` so the letters look like inflated liquid mercury with razor-sharp boundaries.
  - **Thin-Film Iridescence (`slick` & `film`)**: Mixes a 4-stop pearlescent palette (magenta `[1.0, 0.35, 0.85]`, cyan `[0.35, 0.85, 1.0]`, warm gold `[1.0, 0.82, 0.45]`, electric indigo `[0.40, 0.45, 1.0]`) driven by surface normal grazing angle $1 / (n_z + 0.35)$ and time phase.
  - **Studio Lighting (`studio_env`)**: Rotating overhead softbox (`top`), crisp right rim light (`rim`), and warm key reflection (`left`) evaluated via surface reflection vectors $(r_x, r_y) = (2 n_z n_x, 2 n_z n_y)$.

### B. 3D Floating Glass UI Slabs (`draw_panel` & `quad`)
- **Perspective Projection (`quad`)**: Projects a flat UI screenshot of width $p_w$ and height $p_h$ through 3D rotation matrices $R_y(\text{yaw}) \cdot R_x(\text{pitch})$ with focal length $f = 2000\text{ px}$.
- **Liquid Radial Reveal**: Instead of a flat opacity fade, screenshots materialize via arippling radial wave (`edge = reveal * 1.15 + 0.05 * sin(5*ang + 3*t)`) bordered by a glowing iridescent rim (`cv2.polylines` with thin-film phase).
- **Live Callout Magnifier (`callout_box`)**: Crops a target ROI $(x_0, y_0, x_1, y_1)$ from the live screenshot, scales it up $1.18\times$, pops it forward on an elevated glass card, draws an iridescent frame around both the source region and popped card, and attaches a monospace HUD pill (`LIVE FIRM PULSE`, `CPI / SPI LIVE`, etc.).

### C. HUD & Typography Hierarchy
- **Corner Telemetry (`hud_frame`)**: Minimalist 26px corner hairlines with top-left section code (`ECHO / 01 — COMMAND CENTER`) and top-right live index (`01 / 07`) in `CascadiaMono` (`tracking=4`).
- **Editorial Headlines**: `Segoe UI Light` (`64px` for scene headlines, `120px` with `tracking=26` for rapid montage words).
- **Subtitles**: `Segoe UI Semilight` (`30px`, soft silver-blue `(0.78, 0.82, 0.90)`).
- **Glow & Scrim (`put_text`)**: Every text layer automatically generates a dilated Gaussian scrim (`sigma=14`) to darken busy backgrounds underneath text, plus an additive bloom halo (`sigma=6`) so typography stays 100% legible over any UI screenshot.

---

## 2. Master Video Storyboard Structure (Adaptable Template)

Use this 8-act structure (~90–105 seconds at `1920x1080`, `30 fps`) for any B2B SaaS / enterprise product reveal:

| Act | Time Window | Visual Action | Audio / SFX Cue |
| :--- | :--- | :--- | :--- |
| **1. Genesis Drop** | `0.0s – 7.0s` | Single liquid-chrome droplet falls from top, hits center at `t=2.0s`, sends shockwave rings, splits into 6 orbiting mercury satellites. Copy: *"Before the first milestone is logged… Everything is one."* | Glass harmonic drone (`1318 Hz`), mercury drip (`t=1.97s`), deep sub-drop (`95→38 Hz`), stereo water droplets. |
| **2. Brand Morph** | `7.0s – 14.0s` | 20 liquid-metal droplets converge toward center and morph (`sstep`) into the inflated 3D chrome product logo (`ECHO`). Subtitle: *"THE OPERATING SYSTEM FOR [INDUSTRY]"*. | Dual stereo liquid pour, cloth swell, deep Tibetan bowl strike (`146.8 Hz`) + sub-drop at lock (`t=10.5s`), HUD lock ping. |
| **3. Market Context ("Why Now")** | `14.0s – 28.0s` | **2.8s statement** (*"[Market] is scaling fast. Too many teams still run it on WhatsApp and Excel."*) followed by **3 data-driven problem cards** (`3.7s` each):<br>1. **Macro/Financial Shock**: Animated spline chart with glowing area fill.<br>2. **Compliance/Deadline Risk**: Animated 28-unit radial countdown ring.<br>3. **Fragmented Workflow**: Popping chat bubbles that dim over a red warning stamp (`NO RECORD · NO TIMESTAMP · NO CLAIM`). | Low bowl (`220 Hz`), rapid UI telemetry ticks on chart rise, mechanical clock ticks (`clock_tick`) + deadline chime on countdown ring, 4 chat notification pops (`chat_pop`) + warning sub-impact. |
| **4. The Pivot** | `28.0s – 34.0s` | Three sequential center-stage lines:<br>1. *"Spreadsheets go stale."*<br>2. *"Group chats get buried."*<br>3. *"Meet the replacement."* | High-to-mid bowls (`587 Hz` → `440 Hz`), water drip, glass shimmer + sub-drop on *"Meet the replacement."* |
| **5. Core Features (`01`–`07`)** | `34.0s – 87.9s` | `7.7s` per feature. Alternate left/right layout (`side = -1` or `+1`). 3D tilted UI slab (`yaw = ±0.19`) with liquid reveal, editorial headline + wrapped subcopy on opposite side, and animated callout magnifier locking onto the hero metric at `lt=1.6s`. | Stereo whoosh-in (`whoosh_sfx`), pentatonic bowl strike, 5 rapid HUD text ticks, liquid drip + harmonic lock-on ping (`hud_lock_ping`) when callout zooms in. |
| **6. Rapid Signal Montage** | `87.9s – 92.85s` | `0.55s` cuts across 9 all-caps keywords (`PROJECTS`, `ENGINEERS`, `DRAWINGS`, …, `ONE SYSTEM`) over blurred zooming UI crops with exponential white flash (`exp(-14 * lt)`). | Hard metallic cut impact (`impact_cut`) + bright octave bowl strike on every 0.55s cut. |
| **7. Closer Thesis** | `92.85s – 96.0s` | Two-line thesis over subtle caustics:<br>*"Built for [target customers] / that refuse to guess."* | Deep sub-drop + warm breath pad + high glass harmonic. |
| **8. Finale Lockup & CTA** | `96.0s – 104.0s` | Droplets reconverge into final 3D chrome logo lockup (`t=99.0s`), with full CTA stack:<br>• `[BRAND] [PRODUCT]`<br>• *"See it running on your own projects."*<br>• `BOOK A LIVE DEMO — [URL]`<br>• `[SUITE TIERS: BRAVO · DELTA · ECHO]` | Dual liquid pour, wide riser whoosh, massive `32 Hz` sub-bass drop + `98 Hz` / `146.8 Hz` / `293.6 Hz` harmonic chord at `t=99.0s`, final mercury drip at `DUR - 1.4s`. |

---

## 3. Reusable Prompt Templates for Other Products

When spinning up a new product video with an AI agent, paste this prompt:

```markdown
Build a 104-second 1080p30 Y3K Liquid-Chrome reveal video and synchronized procedural soundtrack for **[PRODUCT_NAME]** (`[TAGLINE]`) using the architecture in `build_echo_v3.py` and `build_sfx_soundtrack.py`:

1. **Brand Glyph**: Replace `"ECHO"` in `init_worker()` with `"[PRODUCT_SHORT_NAME]"` (inflated distance-transform bevel + thin-film chrome shader).
2. **Act 3 — Market Context (`scene_egypt` equivalent, `14.0s–28.0s`)**:
   - Opening thesis: `"[MARKET_OPENING_LINE_1]"` / `"[MARKET_OPENING_LINE_2]"`
   - Card 01 (Chart): `("[TAG_1]", "[TITLE_1]", "[SUB_1]", "[STAT_1]", "[UNIT_1]")`
   - Card 02 (Countdown/Gauge): `("[TAG_2]", "[TITLE_2]", "[SUB_2]", "[STAT_2]", "[UNIT_2]")`
   - Card 03 (Chat/Chaos vs System): `("[TAG_3]", "[TITLE_3]", "[SUB_3]", "[STAT_3]", "[UNIT_3]")`
3. **Act 5 — Feature Showcase (`FEATURES` list, `34.0s–87.9s`)**:
   Map 5–7 live product screenshots `(idx, tag, headline, subcopy, png_filename, (roi_x0, roi_y0, roi_x1, roi_y1), callout_label)`.
4. **Act 6 — Rapid Montage (`MONTAGE_WORDS`)**:
   Use 9 core domain nouns ending with `"ONE SYSTEM"`.
5. **Act 8 — Finale CTA**:
   - Line 1: `"[COMPANY]  [PRODUCT]"`
   - Line 2: `"See it running on your own workflow."`
   - Line 3: `"BOOK A LIVE DEMO  —  [DOMAIN]"`
   - Line 4: `"[PRODUCT_SUITE_LINE]"`
6. **Audio & SFX (`build_sfx_soundtrack.py`)**:
   Generate a 48kHz 16-bit stereo WAV/MP3/M4A with physically modelled Tibetan bowls, glass harmonics, liquid mercury pours, sub-bass drops, UI telemetry ticks, clock ticks, chat pops, and montage cut impacts, then mux into the final H.264 MP4 (`-crf 17 -movflags +faststart`).
```

---

## 4. Reference Scripts & Assets From Today's Session

- **Video Renderer (Y3K Liquid Chrome + 3D Glass Panels + Egypt Context + 7 Features)**:
  - [build_echo_v3.py](file:///C:/Users/Mi5a/.gemini/antigravity/brain/70fbba97-6710-4ffa-9fac-b37f26299c73/scratch/build_echo_v3.py)
- **Standalone Procedural Soundtrack + Cinematic SFX Generator**:
  - [build_sfx_soundtrack.py](file:///C:/Users/Mi5a/.gemini/antigravity/brain/70fbba97-6710-4ffa-9fac-b37f26299c73/scratch/build_sfx_soundtrack.py)
- **Captured Live Platform Screenshots (`1920x1080` + Mobile)**:
  - `C:\Users\Mi5a\.gemini\antigravity\brain\70fbba97-6710-4ffa-9fac-b37f26299c73\scratch\teaser_screens\`
- **Rendered Deliverables**:
  - Video (with audio muxed): [Mitrixo-Echo-V3.mp4](file:///C:/Users/Mi5a/DEC-MILESTONE-TRACKER-1/public/Mitrixo-Echo-V3.mp4) & [Mitrixo-Echo-V3-HQ.mp4](file:///C:/Users/Mi5a/DEC-MILESTONE-TRACKER-1/public/Mitrixo-Echo-V3-HQ.mp4)
  - Standalone Audio + SFX (for NLE / Premiere / DaVinci / CapCut):
    - [Mitrixo-Echo-V3-Soundtrack.wav](file:///C:/Users/Mi5a/DEC-MILESTONE-TRACKER-1/public/Mitrixo-Echo-V3-Soundtrack.wav)
    - [Mitrixo-Echo-V3-Soundtrack.mp3](file:///C:/Users/Mi5a/DEC-MILESTONE-TRACKER-1/public/Mitrixo-Echo-V3-Soundtrack.mp3)
    - [Mitrixo-Echo-V3-Soundtrack.m4a](file:///C:/Users/Mi5a/DEC-MILESTONE-TRACKER-1/public/Mitrixo-Echo-V3-Soundtrack.m4a)

---

## 5. Critical Technical Guardrails (Lessons Learned)
1. **Use `ThreadPoolExecutor` Instead of `multiprocessing.Pool` on Windows**: Passing multi-megabyte raw video frames across Windows named pipes (`multiprocessing.connection`) triggers `AssertionError: assert left > 0` in Python 3.12. Since `numpy` and `cv2` release the GIL, `ThreadPoolExecutor(max_workers=14)` shares memory zero-copy and never crashes.
2. **Thread-Safe PIL Font Rendering**: Wrap `ImageFont.truetype` text-measurement and mask caching (`text_mask`, `wrap`) in a `threading.Lock()` so concurrent worker threads never race on FreeType glyph handles.
3. **Prevent `NaN` Poisoning in Audio Convolution**: Always clamp `np.sin(...)` with `np.maximum(0.0, ...)` before raising to fractional powers (`** 1.5`) in envelope generators (`breath`), because a single `NaN` sample (`(-1e-7) ** 1.5`) will propagate across the entire audio buffer during `scipy.signal.fftconvolve` reverb!
4. **Integer Coordinates in `put_text`**: Coerce `x = int(x)` and `y = int(y + dy)` for all anchor modes (`"l"`, `"c"`, `"r"`) so computed chart coordinates never pass floats into NumPy array slices.
