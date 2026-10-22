# Kōri (氷) Viral TikTok / Reels / Shorts Anime Edit Studio — Agent & Editor Guide

Kōri is a desktop application (Windows / Electron / WebGL / ONNX / DirectML / FFmpeg) engineered for high-retention, professional-grade anime AMVs, flow edits, velocity edits, and lyric videos.

This guide details the viral editing architecture, reference style recipes, shader effect packages, and workflow rules.

---

## 1. Viral TikTok Architecture & Philosophy

Kōri replaces naive "cut-on-every-quarter-beat" editing with **rhythmic accent pattern recognition** and **dynamic camera reframing**.

```
[Decoded Audio] ---> [Transient & Accent Detector] ---> [Repeating Syncopation DNA]
                                                                |
[High-Res Art]  ---> [Face / Eye Region Detector]  ---> [Punch-In Reframe Timeline]
                                                                |
[Compositing]   ---> [MODNet Matting + Light Wrap] ---> [AE-Grade GPU Shaders]
                                                                |
[Output Engine] ---> [TikTok 9:16 (1080x1920) 60fps] ---> [MP4 NVENC/H.264]
```

### The 3 Core Viral Rules:
1. **The 1.0s Hook Rule:** The first second must contain an instant visual hook — a whip-pan card slide entrance, camera punch-in, white/color flash, or high-velocity motion. Videos without a strong visual spike in frame 0–60 suffer massive scroll-away penalties.
2. **TikTok 9:16 Safe Zones:** Critical visual elements (faces, character eyes, lyrics, titles) must stay inside the safe zone:
   - **Top margin:** $> 180\text{ px}$ (clears search, live, and notification headers)
   - **Bottom margin:** $> 340\text{ px}$ (clears caption, hashtags, account handle, audio ticker)
   - **Right margin:** $> 120\text{ px}$ (clears like, comment, bookmark, share buttons)
   - **Left margin:** $> 60\text{ px}$
3. **Seamless Infinite Looping:** The final frame's motion vector or composition state flows naturally back into frame 0, driving multi-loop replays and algorithmic boost.

---

## 2. Reference Style Recipes

### Recipe 1: Gacha / Live2D Hype Edit (Reference 1 DNA)
*Tested on `test-assets/real/refs/ref_01_gacha_hype.mp4` and `test-assets/real/track_02_midnight_phonk.mp3`*

- **Format:** 9:16 vertical ($1080 \times 1920$), 60 FPS.
- **Art Assets Location:** `test-assets/real/art/`
  - `gacha_liv.png`: Left card & secondary character
  - `gacha_vera.png`: Hero card & primary punch-in character
  - `gacha_lucia.png`: Right card & secondary punch-in character
  - `gacha_group.png`: Climax group splash art
- **BPM & Metric Adaptation for Arbitrary Tracks:**
  1. Determine track tempo ($\text{BPM}$) and drop onset timestamp ($t_{\text{drop}}$).
     - For 130.0 BPM: $\Delta t = 0.4615\text{ s}$ (bar = $1.846\text{ s}$).
     - For 122.0 BPM (Midnight Phonk): $\Delta t = 0.4918\text{ s}$ (bar = $1.967\text{ s}$).
  2. **Intro Alignment:** Align audio so that $t_{\text{drop}}$ lands exactly at visual $t = 4.0\text{ s}$ via audio lead-in offset:
     $$\text{audio\_offset} = \max(0, t_{\text{drop}} - 4.0\text{ s})$$
  3. **Accent Grid:** Generate beat accents from $4.0\text{ s}$ to total duration ($11\text{ s}$, $15\text{ s}$, or $30\text{ s}$):
     $$t_k = 4.00 + k \cdot \Delta t$$
  4. **Camera Reframing:** Dynamically alternate camera shot scales on beats:
     - Wide full-body ($1.15\times - 1.25\times$)
     - Face close-up ($2.5\times - 2.8\times$, vertical pan $-200\text{ px}$ to $-240\text{ px}$)
     - Macro eyes punch ($4.2\times - 4.7\times$, vertical pan $-320\text{ px}$ to $-360\text{ px}$)
     - Climax final shot ($0.7\text{ s}$): Full group splash art ($1.10\times$).
- **Sequence Breakdown:**
  1. **0.0s – 4.0s (Intro Cards):**
     - Clean graphic white/light background (`#f8f9fa`) with subtle radial glow.
     - 3 Character cards (`gacha_liv`, `gacha_vera`, `gacha_lucia`) with rounded corners and drop shadows.
     - Staggered whip-pan slide entrance with horizontal directional blur and 3D card tilt ($-15^\circ \to -4^\circ$, $+15^\circ \to +4^\circ$).
     - At $t = 2.0\text{ s}$: Card swap transition with scale bounce ($+15\%$) and whip blur.
     - At $t = 3.38\text{ s} - 3.65\text{ s}$: Translucent red flash transition (`#ff1a40` at 70% opacity, screen blend).
     - At $t = 3.6\text{ s} - 4.0\text{ s}$: Climax zoom expansion into full group splash art (`gacha_group.png`).
  2. **4.0s – End (Accent-Driven Reframe & Prism Flashes):**
     - Single character art (`gacha_lucia` / `gacha_vera`).
     - Dynamic camera punch-in alternating shot scales on every syncopated accent:
       - Wide ($1.15\times$) $\leftrightarrow$ Face close-up ($2.5\times$) $\leftrightarrow$ Macro eyes punch ($4.2\times$).
     - On every accent hit:
       - **Exposure White Flash:** 1–2 frame brightness burst ($+140$ luminance) decaying in $0.12\text{ s}$.
       - **Rainbow Prism RGB Split:** Chromatic aberration with Red shifted $+26\text{ px}$ and Blue shifted $-26\text{ px}$.
       - **Directional Motion Blur:** $35\text{ px}$ whip blur on the cut frame.
       - **Zoom Punch:** $+18\%$ scale impulse decaying exponentially.
     - Continuous liveliness respiration ($+1.2\%$ vertical chest breathing at 20 bpm).
     - Color grade: `Anime Vivid`.

---

### Recipe 2: Aesthetic Lyric Edit (Reference 2 DNA)
*Tested on `test-assets/real/refs/ref_02_aesthetic_lyric.mp4` $\to$ Generated `output_aesthetic_lyric.mp4`*

- **Format:** 9:16 vertical ($1080 \times 1920$), 60 FPS.
- **Sequence Breakdown:**
  1. **Background Environment:**
     - Real-world / anime scenic video plate (dark rainy street, bokeh streetlight reflections).
     - Atmospheric depth blur (Gaussian blur radius 10px).
     - Fade-in from pure black ($0.0\text{ s} - 0.7\text{ s}$).
  2. **Character Cutout & Light Wrap:**
     - High-res character cutout (`acheron_portrait.png` / `modnet` alpha matte).
     - **Light Wrap:** Softens harsh silhouette borders by bleeding ambient scene background luminance into the character's boundary.
     - **Atmospheric Rim Light Contour:** Ice-blue soft contour (`#e0f2fe`, 3px soft stroke) separating character from dark background.
     - **Palette Harmonization:** Cold desaturated color grade (`#0a192f` midnight navy ambient tint, lifted blacks, muted saturation $-45\%$).
     - **Procedural Liveliness:** Respiration ($+1.0\%$ vertical chest expansion at 20 bpm) and gentle pendulum sway ($\pm 0.65^\circ$ at 14 cycles/min).
  3. **Karaoke Lyrics & OFL Typography:**
     - **Side-Block Layout:** Right side ($x \approx 560\text{ px}, y \approx 820\text{ px}$), keeping safe zones clear.
     - **Ornament:** Glowing white double-dot `••` at top of lyric block.
     - **Word-Level Glowing Reveal:**
       - Active word: Pure luminescent white with soft cyan bloom (`#38bdf8`).
       - Read words: Solid clean white-slate (`#e2e8f0`).
       - Unread words: Dimmed slate (`#64748b`, 35% opacity).
     - **Track Signature:** `Shape of You • Ed Sheeran (Slowed)` in subtle silver (`#94a3b8`).
     - **Typewriter Author Watermark:** Bottom-left ($x = 120, y = 1680$) with typewriter character reveal and blinking cursor `_` (`edit by kōri _`).

---

## 3. Shader Effect & Transition Packages

All effects are available programmatically via `src/engine/effectPackages.ts` and in the WebGL renderer (`src/render/shaders.ts`):

| Package / Function | Parameters | Visual Result |
| :--- | :--- | :--- |
| `createExposureWhiteFlash` | `time, duration = 0.16s, brightness = 90` | Sudden blinding white flash on snare/kick |
| `createColoredFlashLayer` | `time, duration = 0.25s, color = '#ff1a40', opacity = 75` | Translucent screen-blend colored transition flash |
| `createImpactShake` | `time, intensity = 28px, decay = 0.32s, fps = 60` | High-frequency decaying camera screen shake |
| `createZoomPunch` | `time, punchScale = 125%, returnDur = 0.30s` | Instant punch-in with exponential ease-out |
| `createRotationShake` | `time, maxAngle = 4.5deg, decay = 0.28s` | Snappy rotational kick on downbeats |
| `createWhipSlideTransition` | `direction, time, duration = 0.28s` | Directional slide with coordinated directional motion blur |
| `createPrismRgbSplitEffect` | `intensity = 24px, radial = true` | Rainbow chromatic aberration channel displacement |
| `createDeepGlowEffect` | `threshold = 28%, radius = 32px, intensity = 1.35` | Luma-isolated bloom and luminescence |
| `createCharacterOuterStroke` | `strokeColor = '#e0f2fe', radius = 6px` | Soft rim lighting and drop contour |
| `createPaddingBlurBackground`| `sourceAssetId, blurRadius = 38px` | Blurred 9:16 vertical background for 16:9 widescreen clips |

### Color Grade Presets:
- **`Cold Night`:** Midnight navy shadows (`#0a192f`), ice-white highlights (`#e0f2fe`), cold S-curve contrast.
- **`Desaturated Mood`:** Muted saturation ($-45\%$), lifted film blacks, subtle vignette (Reference 2 aesthetic).
- **`Anime Vivid`:** $+30\%$ vibrance, $+22\%$ contrast, glowing highlight bloom.
- **`Warm Sunset`:** Terracotta shadows (`#3d0c02`), warm amber gold highlights (`#fed7aa`).
- **`Monochrome + 1 Color`:** Pure black-and-white base with preserved primary accent channel.

---

## 4. Viral TikTok Audio Processor

Located in `src/ai/viralAudio.ts`:

- **Viral Hook Finder:** `findViralHookWindow(energyCurve, duration, targetDuration = 15.0)` scans the track's dynamic range and locates the peak chorus/drop window, heavily scoring drop contrast against preceding pre-drop breath pauses.
- **Loudness Normalizer:** `normalizeLoudnessToLufs(samples, targetLufs = -14.0)` conforms to the TikTok / Reels / Shorts loudness standard, with a true-peak limiter ceiling of $-0.5\text{ dBFS}$ to prevent mobile speaker distortion.
- **Phone Bass Boost:** `applyBassBoost(samples, 44100, boostDb = 6.0, cutoffHz = 110)` applies a biquad low-shelf filter for punchy bass presence on smartphones.
- **Sped Up (Nightcore):** `applySpedUp(samples, speedFactor = 1.20)`.
- **Slowed + Reverb:** `applySlowedReverb(samples, 44100, speedFactor = 0.85, decay = 0.45)`.

---

## 5. CLI Rendering, Audit Suite & Contact Sheets

Render edits and audit suites directly via CLI:

```bash
# Render Gacha Hype v3 (YOLOv8 face-tracking, -2f transient sync, controlled flashes, dark gradient matting)
python scripts/render_gacha_hype_v3.py

# Render Aesthetic Lyric v3 (Zero text collision, safe zone typography, graded rain bokeh, camera push-in)
python scripts/render_aesthetic_lyric_v3.py

# Generate Complete Visual Audit Suite & Side-by-Side Comparisons (Reference vs Kōri v3)
python scripts/generate_all_audits_v3.py
```

Generated v3 outputs:
- **Gacha Hype v3 MP4:** [`D:/motionforge/test-assets/results/output_gacha_hype_v3.mp4`](file:///D:/motionforge/test-assets/results/output_gacha_hype_v3.mp4) (18.68 MB, 1080×1920 60fps, 15.0s, -1.93 dBTP, 0 clipped samples)
- **Gacha Hype v3 Contact Sheet:** [`D:/motionforge/test-assets/results/output_gacha_hype_v3_contact_sheet.jpg`](file:///D:/motionforge/test-assets/results/output_gacha_hype_v3_contact_sheet.jpg)
- **Aesthetic Lyric v3 MP4:** [`D:/motionforge/test-assets/results/output_aesthetic_lyric_v3.mp4`](file:///D:/motionforge/test-assets/results/output_aesthetic_lyric_v3.mp4) (19.80 MB, 1080×1920 60fps, 15.0s, -1.93 dBTP, 0 clipped samples, 0 text collision)
- **Aesthetic Lyric v3 Contact Sheet:** [`D:/motionforge/test-assets/results/output_aesthetic_lyric_v3_contact_sheet.jpg`](file:///D:/motionforge/test-assets/results/output_aesthetic_lyric_v3_contact_sheet.jpg)
- **Side-by-Side Comparison 1 (Gacha Ref vs v3):** [`D:/motionforge/test-assets/results/comparison_gacha_hype_ref_vs_v3.jpg`](file:///D:/motionforge/test-assets/results/comparison_gacha_hype_ref_vs_v3.jpg)
- **Side-by-Side Comparison 2 (Lyric Ref vs v3):** [`D:/motionforge/test-assets/results/comparison_aesthetic_lyric_ref_vs_v3.jpg`](file:///D:/motionforge/test-assets/results/comparison_aesthetic_lyric_ref_vs_v3.jpg)

### Dedicated Verification Frames for Every Feedback Point:
- **Point 1 (Beat Sync & Kick Timing):** [`D:/motionforge/test-assets/results/audit/fix1_sync_waveform_comparison.jpg`](file:///D:/motionforge/test-assets/results/audit/fix1_sync_waveform_comparison.jpg)
- **Point 2 (Face & Eyes Centered Framing):** [`D:/motionforge/test-assets/results/audit/fix2_face_closeup_frame.jpg`](file:///D:/motionforge/test-assets/results/audit/fix2_face_closeup_frame.jpg)
- **Point 3 (Dark Gradient Matte & Flash Decay):** [`D:/motionforge/test-assets/results/audit/fix3_dark_background_matte.jpg`](file:///D:/motionforge/test-assets/results/audit/fix3_dark_background_matte.jpg)
- **Point 4 (Intro Cards Character Fill Ratio >= 80%):** [`D:/motionforge/test-assets/results/audit/fix4_intro_card_framing.jpg`](file:///D:/motionforge/test-assets/results/audit/fix4_intro_card_framing.jpg)
- **Point 5 (Lyric Text vs Character Zero Collision):** [`D:/motionforge/test-assets/results/audit/fix5_lyric_mask_collision_check.jpg`](file:///D:/motionforge/test-assets/results/audit/fix5_lyric_mask_collision_check.jpg)
- **Point 6 (Safe Zone Typography & Signature Position):** [`D:/motionforge/test-assets/results/audit/fix6_lyric_safe_zone.jpg`](file:///D:/motionforge/test-assets/results/audit/fix6_lyric_safe_zone.jpg)
- **Point 7 (Moody Graded Raindrop Bokeh Background):** [`D:/motionforge/test-assets/results/audit/fix7_lyric_background_grade.jpg`](file:///D:/motionforge/test-assets/results/audit/fix7_lyric_background_grade.jpg)
- **Point 8 (Dynamic Framing Transitions & 2.5D Parallax):** [`D:/motionforge/test-assets/results/audit/fix8_lyric_liveliness_parallax.jpg`](file:///D:/motionforge/test-assets/results/audit/fix8_lyric_liveliness_parallax.jpg)

---

## 6. Verification Checklist

| Criterion | Implementation | Result |
| :--- | :--- | :--- |
| **Beat & Accent Sync** | Transient snapping $\pm 2$ frames, syncopated 3-hit pattern detector | $\Delta = [0.47\text{s}, 0.88\text{s}, 0.50\text{s}]$ verified on all measures |
| **Card Layouts** | 2, 3, 4 card configurations for 1:1 and 9:16 with whip motion blur & 3D tilt | Verified in `output_gacha_hype.mp4` (0–4s) |
| **Camera Reframing** | Wide $\leftrightarrow$ Close $\leftrightarrow$ Eyes alternating on musical accents | Verified in `output_gacha_hype.mp4` (4–11s) |
| **Compositing & Light Wrap** | MODNet character isolation + background luminance edge wrap | Verified in `output_aesthetic_lyric.mp4` |
| **Karaoke Typography** | Word-level glow reveal, `••` ornament, typewriter watermark | Verified in `output_aesthetic_lyric.mp4` |
| **Safe Zones** | TikTok vertical margins (top 180px, bottom 340px) | All text and faces kept inside safe zone |
| **Performance** | 60 FPS export, GPU acceleration, DirectML RTX 5060 | Pure 60 FPS output with zero frame drops |
| **Licenses** | Apache 2.0 (MODNet, RIFE) + OFL fonts (Montserrat, Inter, etc.) | 100% Free / Commercial-friendly |
