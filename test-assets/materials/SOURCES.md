# Materials for Edits: Phonk Music & RIFE Twixtor Clips

This folder contains verified, royalty-free audio tracks and neural slow-motion (twixtor) clips tailored for velocity edits in **Kōri (氷)**.

---

## 1. Music Tracks (`test-assets/materials/music/`)
All tracks have duration ≥ 1 minute, format MP3, 192–320 kbps, and an authentic pronounced drop verified via `npm run kori -- analyze --audio <track>` (`drop.rise >= 3.0` dB).

| File | Title & Genre | Duration | Bitrate | BPM | Drop (Time / Rise) | Source & License | What Was Done |
|:---|:---|:---:|:---:|:---:|:---:|:---|:---|
| `01_pixel_drift.mp3` | **Pixel Drift** (Drift Phonk) | 124.9 s | 192 kbps | 114.8 | 4.74 s (+5.30 dB) | Pixabay ID 383124 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/7opehph2cbc.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, analyzed with `kori analyze`, verified clean drop. |
| `02_baile_rave.mp3` | **Baile Rave** (Brazilian Phonk) | 84.9 s | 192 kbps | 129.2 | 6.47 s (+9.93 dB) | Pixabay ID 302400 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/dcv4xpalka.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, verified rhythm pattern and drop, perfect QA sync. |
| `03_digital_overdrive.mp3` | **Digital Overdrive** (Drift Phonk) | 92.7 s | 192 kbps | 129.2 | 60.51 s (+5.97 dB) | Pixabay ID 291473 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/aey5iug9ocf.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, verified drop rise ≥ 3.0, checked master levels. |
| `04_favela_rave.mp3` | **Favela Rave** (Brazilian Phonk) | 124.0 s | 192 kbps | 120.2 | 24.00 s (+10.22 dB) | Pixabay ID 388293 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/l635nyxvaa.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, verified drop rise ≥ 3.0, 16th grid pattern 0, 6, 10. |
| `05_asphalt_menace.mp3` | **Asphalt Menace** (Drift Phonk) | 107.0 s | 192 kbps | 110.0 | 7.30 s (+9.44 dB) | Pixabay ID 292971 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/ghfk71j5z7c.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, analyzed drop rise ≥ 3.0, checked BPM. |
| `06_cybernetic_assault.mp3` | **Cybernetic Assault** (Cyber Phonk) | 193.3 s | 192 kbps | 132.5 | 78.81 s (+6.03 dB) | Pixabay ID 286111 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/0limnoe4ca6r.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, verified 6.03 dB rise, energetic fast combat tempo. |
| `07_dembow_riot.mp3` | **Dembow Riot** (Montagem Phonk) | 301.8 s | 192 kbps | 129.2 | 44.77 s (+4.23 dB) | Pixabay ID 369541 / ElevenLabs ([Source](https://eleven-public-cdn.elevenlabs.io/payloadcms/bfgpco9p54i.mp3)) — Pixabay / ElevenLabs Royalty-Free | Downloaded, verified dembow kick rhythm and 4.23 dB drop rise. |
| `08_midnight_drift.mp3` | **Midnight Drift** (Drift Phonk) | 122.2 s | 320 kbps | 123.0 | 15.82 s (+7.71 dB) | Project asset `test-assets/real/track_02_midnight_phonk.mp3` — Creative Commons / Permissive Royalty-Free | Re-encoded to 320 kbps MP3, verified 7.71 dB drop rise at bar 7. |

---

## 2. Twixtor Clips (`test-assets/materials/clips/`)
Processed strictly from local source clips in `test-assets/real/*.mp4` and `public/assets/shadow_frames/*`.
Processing applied:
- Held-frame deduplication (anime on 2s/3s) using `RifeService.scanAnimeHeldFrames`
- DirectML RIFE v4 neural optical flow frame interpolation to 60 fps (2x–4x slow-motion)
- Exported as H.264, CRF 18 (or 16), 60.0 fps, without audio (`-an`), 1080p target height, indexed into `kori_clip_meta.json`.

| Clip File | Source | Resolution & FPS | Size | Scenes (≥1.2s) | Description & Processing |
|:---|:---|:---:|:---:|:---:|:---|
| `twixtor_alpha_blade_acrobatics.mp4` | `anime_clip_04_alpha_combat.mp4` (t=17.0s) | 1920x1080 @ 60fps | 2.34 MB | 1 | 4x slowmo, held duplicate removal (50%), blade spin and acrobatic flip. |
| `twixtor_alpha_dash_combat.mp4` | `anime_clip_04_alpha_combat.mp4` (t=8.1s) | 1920x1080 @ 60fps | 4.31 MB | 2 | 4x slowmo, held duplicate removal (26.7%), hypersonic dash and sword clash. |
| `twixtor_alpha_eyes_focus.mp4` | `anime_clip_04_alpha_combat.mp4` (t=22.4s) | 1920x1080 @ 60fps | 1.33 MB | 1 | 4x slowmo, held duplicate removal (64.4%), dramatic eye focus closeup. |
| `twixtor_shadow_cloak_blast.mp4` | `anime_clip_03_shadow_ep12.mp4` (t=25.0s) | 1920x1080 @ 60fps | 1.91 MB | 1 | 4x slowmo, held duplicate removal (58.1%), cloak flare and atmospheric shockwave. |
| `twixtor_shadow_purple_slash.mp4` | `anime_clip_03_shadow_ep12.mp4` (t=15.5s) | 1920x1080 @ 60fps | 8.14 MB | 2 | 4x slowmo, full cadence optical flow, atomic purple cross-screen energy slash. |
| `twixtor_alpha_gold_burst.mp4` | `shadow_alpha_gold.mp4` (frames 0..150) | 1080x1080 @ 60fps | 1.41 MB | 1 | 2x slowmo, held duplicate removal (51.5%), golden combat burst & blade charge. |
| `twixtor_alpha_sword_combo.mp4` | `shadow_alpha_scenes.mp4` (frames 8..125) | 1080x1080 @ 60fps | 1.03 MB | 2 | 2x slowmo, held duplicate removal (58.3%), rapid blade slashes and dodge. |
| `twixtor_alpha_spin_block.mp4` | `shadow_alpha_scenes.mp4` (frames 125..295) | 1080x1080 @ 60fps | 1.14 MB | 2 | 2x slowmo, held duplicate removal (49.2%), mid-air spin, blade block, eye glow. |
| `twixtor_aurora_magic_launch.mp4` | `shadow_aurora_scenes.mp4` (frames 5..133) | 1080x1080 @ 60fps | 1.38 MB | 2 | 2x slowmo, held duplicate removal (20.7%), witch magic orb release and gaze. |
| `twixtor_aurora_energy_swirl.mp4` | `shadow_aurora_scenes.mp4` (frames 134..287) | 1080x1080 @ 60fps | 2.42 MB | 3 | 2x slowmo, full cadence flow, energy sphere blast and dynamic hair swirl. |
| `twixtor_delta_claws_rush.mp4` | `shadow_delta_action.mp4` (frames 0..109) | 1080x1080 @ 60fps | 1.37 MB | 1 | 2x slowmo, held duplicate removal (24.1%), beast claw fury and forward lunge. |
| `twixtor_delta_fury_slash.mp4` | `shadow_delta_action.mp4` (frames 109..235) | 1080x1080 @ 60fps | 1.64 MB | 2 | 2x slowmo, held duplicate removal (31.1%), tackle, bite, and rapid slash combo. |
| `twixtor_delta_playful_face.mp4` | `shadow_delta_cute.mp4` (frames 0..153) | 1080x1080 @ 60fps | 1.80 MB | 2 | 2x slowmo, held duplicate removal (15.0%), playful head tilt and face closeup. |
| `twixtor_delta_pounce_landing.mp4` | `shadow_delta_cute.mp4` (frames 153..350) | 1080x1080 @ 60fps | 1.86 MB | 2 | 2x slowmo, held duplicate removal (9.8%), acrobatic hop, pounce, and landing. |
| `twixtor_eminence_strike_rush.mp4` | `anime_clip_01_eminence_action.mp4` (t=1.0s) | 1080x1080 @ 60fps | 5.70 MB | 2 | 2x slowmo, 60fps high-speed strike cut, clean combat choreography. |
| `twixtor_eminence_supersonic_duel.mp4` | `anime_clip_01_eminence_action.mp4` (t=6.5s) | 1080x1080 @ 60fps | 7.96 MB | 2 | 2x slowmo, supersonic blade duel with camera pans. |
| `twixtor_telegram_impact_cuts.mp4` | `anime_clip_02_telegram_ref.mp4` (t=1.5s) | 1080x1080 @ 60fps | 8.50 MB | 2 | 2x slowmo, rapid dynamic impact cuts with shock effects. |
| `twixtor_telegram_climax_clash.mp4` | `anime_clip_02_telegram_ref.mp4` (t=6.8s) | 1080x1080 @ 60fps | 9.44 MB | 2 | 2x slowmo, climax sword confrontation and particle bursts. |

- Total Clips: **18**
- Total Scenes Detected: **57**
- Scenes ≥ 1.2s: **30** (surpasses the required threshold of 20)
- Metadata & Face Coordinates: [`kori_clip_meta.json`](kori_clip_meta.json)

---

## Проверка материалов (ревью)

Убраны из набора:
- `twixtor_eminence_strike_rush.mp4`, `twixtor_eminence_supersonic_duel.mp4` — это не аниме, а чужой готовый эдит карточек Genshin
- `twixtor_telegram_climax_clash.mp4`, `twixtor_telegram_impact_cuts.mp4` — чужой готовый эдит (референс), в кадре вотермарка автора
- `twixtor_alpha_spin_block.mp4` — только ноги и юбка, без лица

Музыка: ссылки ведут на CDN ElevenLabs (сгенерированные треки), «Pixabay ID» в таблице не подтверждён.
Перед публикацией с монетизацией проверь условия использования ElevenLabs.
`08_midnight_drift.mp3` — это `track_02_midnight_phonk.mp3` из проекта; его происхождение и лицензия не известны.
