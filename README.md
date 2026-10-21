# Motionforge — WebGL2 Motion Design & Compositing Studio

**Motionforge** is a browser-based motion design, animation, and GPU compositing application inspired by Adobe After Effects. It runs 100% client-side with zero backend dependencies.

## Quick Start

```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
```

## Key Features

### 1. Compositions & Project Management
- **Composition Presets**: 1080p HD (`1920×1080`), 4K UHD (`3840×2160`), Reels/Shorts (`1080×1920`), Square (`1080×1080`), 720p, and custom dimensions.
- **Frame Rates**: `24`, `25`, `30`, and `60` FPS.
- **Multi-Composition & Pre-composing**: Create multiple compositions and nest compositions (`Ctrl+Shift+C` to Pre-compose selected layers).
- **Persistence**: Save/open `.mfproj` JSON project files + automatic background saving to `IndexedDB` every 30 seconds.
- **Built-in Demo Showcase**: `File → Open Demo Showcase Project` loads a multi-layered animated bumper featuring Trim Paths, per-character Text Animator, Spatial Bezier paths, `wiggle()` expressions, feathered Masks, and Adjustment Layer GPU shaders.

### 2. Layers, Parenting, Masks & Track Mattes
- **Layer Types**: `Solid`, `Shape` (Rectangle, Ellipse, Polygon, Star, Bezier Path), `Text` (Google Fonts + per-character Text Animator), `Image`, `Video`, `Audio` (with waveform), `Null Object`, `Adjustment Layer`, `Camera (2.5D)`, and `Pre-comp`.
- **Transform**: `Anchor Point`, `Position` (with spatial bezier viewport trajectories), `Scale` (with Constrain Proportions), `Rotation`, `Opacity`, `Skew`, and `Skew Axis`.
- **Blend Modes** (GPU): `Normal`, `Multiply`, `Screen`, `Overlay`, `Add`, `Darken`, `Lighten`, `Difference`, `Color Dodge`.
- **Parenting**: Pick-whip (`@`) drag-and-drop or dropdown hierarchy with recursive matrix concatenation.
- **Track Mattes**: `Alpha Matte`, `Alpha Inverted`, `Luma Matte`, `Luma Inverted`.
- **Masks**: Rectangular & Elliptical masks with `Add`, `Subtract`, `Intersect` modes and animatable `Feather`, `Opacity`, and `Expansion`.

### 3. Timeline & Graph Editor
- **SMPTE Timecode (`HH:MM:SS:FF`) & Frame Ruler**: Zoom with mouse wheel or slider, snap-enabled Playhead, Work Area bar (`B` / `N`), and Composition Markers.
- **RAM Frame Cache Bar**: Green bar above the time ruler indicating cached frames.
- **Keyframe Editing**: Linear (Diamond), Easy Ease/Bezier (Hourglass), and Hold (Square) keyframes; box marquee selection; drag in time; copy/paste (`Ctrl+C` / `Ctrl+V`).
- **Interactive Graph Editor**: Switch between **Value Graph** and **Speed Graph**, drag cubic-bezier tangent handles directly, and apply `Easy Ease (F9)`, `Ease In (Shift+F9)`, or `Ease Out (Ctrl+Shift+F9)`.

### 4. Animation Engine & Expressions
- **Sandboxed JS Expressions**: Supports `time`, `frame`, `fps`, `duration`, `value`, `index`, `wiggle(freq, amp)`, `loopOut("cycle" | "pingpong" | "offset")`, `loopIn()`, `linear()`, `ease()`, `easeIn()`, `easeOut()`, `thisComp.layer()`, and `thisLayer`.
- **Deterministic Evaluation**: Seeded Perlin/FBM noise guarantees frame `N` renders identically during preview and export.

### 5. 16 WebGL2 GPU Shader Effects
1. `Gaussian Blur`
2. `Directional Blur`
3. `Glow`
4. `Drop Shadow`
5. `Brightness & Contrast`
6. `Hue/Saturation`
7. `Curves`
8. `Fill`
9. `Tint`
10. `Gradient Ramp`
11. `Noise`
12. `Fractal Noise`
13. `Chromatic Aberration`
14. `Wave Warp`
15. `Turbulent Displace`
16. `Vignette`

### 6. Video, GIF & Sequence Export
- **MP4 (H.264)**: Hardware/software encoding via `WebCodecs API` (`VideoEncoder`) + `mp4-muxer`.
- **WebM (VP9/VP8)**: Browser-native `MediaRecorder` stream capture fallback.
- **PNG Sequence (ZIP)**: Lossless frame-by-frame PNG sequence bundled into a `.zip` archive.
- **Animated GIF**: Built-in 256-color palette quantizer & LZW GIF89a encoder.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `V` / `H` / `Z` / `W` / `Y` | Selection / Hand / Zoom / Rotate / Anchor Point Tool |
| `Q` / `G` / `Shift+T` | Shape Tool (cycle) / Pen Tool / Text Tool |
| `P` / `S` / `R` / `T` / `A` | Reveal Position / Scale / Rotation / Opacity / Anchor |
| `U` | Toggle solo animated/keyframed properties |
| `Space` | Play / Pause real-time preview |
| `PageUp` / `PageDown` | Previous / Next frame |
| `Home` / `End` | Jump to Work Area start / end |
| `J` / `K` | Jump to previous / next visible keyframe |
| `B` / `N` | Set Work Area start / end at playhead |
| `[` / `]` | Align selected layer In / Out point to playhead |
| `Alt+[` / `Alt+]` | Trim selected layer In / Out point to playhead |
| `F9` / `Shift+F9` / `Ctrl+Shift+F9` | Easy Ease / Ease In / Ease Out selected keyframes |
| `Ctrl+D` | Duplicate selected layer(s) |
| `Ctrl+Shift+D` | Split selected layer(s) at playhead |
| `Ctrl+Shift+C` | Pre-compose selected layer(s) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo (Immer patches) |
| `Ctrl+M` | Open Render & Export Queue |
| `?` | Open Keyboard Shortcuts Reference Modal |
