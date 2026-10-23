# Twixtor Clips Sources & Processing

All clips were generated directly in Kōri using native DirectML ONNX RIFE v4 neural optical flow (`electron/rifeService.ts`, `scripts/build_clips_rife.ts`), with held-frame deduplication to eliminate anime 2s/3s cadence stutter before interpolation.

## Raw Source Cuts
Source clips located in `test-assets/real/clips_raw/`:
- `anime_clip_03_shadow_ep12.mp4` (1080p, 30fps) - Shadow combat sequences
- `anime_clip_04_alpha_combat.mp4` (1080p, 30fps) - Alpha combat sequences

## Processed Twixtor Clips (1080p @ 60fps)
Located in `test-assets/real/clips/`:

1. **`twixtor_alpha_blade_acrobatics.mp4`**
   - Source: `anime_clip_04_alpha_combat.mp4` @ t=17.0s, dur=3.4s
   - Motion: High (blade arc, airborne flip, sword deflect)
   - Original frames: 102 | Held duplicates: 51 (50.0%) | Drawings: 51
   - Interpolated to 201 frames (60.0 fps), length: 3.35s

2. **`twixtor_alpha_dash_combat.mp4`**
   - Source: `anime_clip_04_alpha_combat.mp4` @ t=8.1s, dur=3.5s
   - Motion: Extreme (hypersonic dash, impact sparks)
   - Original frames: 105 | Held duplicates: 28 (26.7%) | Drawings: 77
   - Interpolated to 305 frames (60.0 fps), length: 5.08s

3. **`twixtor_alpha_eyes_focus.mp4`**
   - Source: `anime_clip_04_alpha_combat.mp4` @ t=22.4s, dur=3.0s
   - Motion: Medium/Face (close-up eye focus, pupil contraction, hair drift)
   - Original frames: 90 | Held duplicates: 58 (64.4%) | Drawings: 32
   - Interpolated to 125 frames (60.0 fps), length: 2.08s

4. **`twixtor_shadow_cloak_blast.mp4`**
   - Source: `anime_clip_03_shadow_ep12.mp4` @ t=25.0s, dur=3.5s
   - Motion: High (cloak flare, atmospheric purple energy shockwave)
   - Original frames: 105 | Held duplicates: 61 (58.1%) | Drawings: 44
   - Interpolated to 173 frames (60.0 fps), length: 2.88s

5. **`twixtor_shadow_purple_slash.mp4`**
   - Source: `anime_clip_03_shadow_ep12.mp4` @ t=15.5s, dur=3.2s
   - Motion: High (cross-screen energy slash, chromatic glow)
   - Original frames: 96 | Held duplicates: 0 (0.0%, 1s animation) | Drawings: 96
   - Interpolated to 381 frames (60.0 fps), length: 6.35s

Metadata and face coordinates indexed into `test-assets/real/clips/kori_clip_meta.json`.
