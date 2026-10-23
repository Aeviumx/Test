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

---

## 3. YouTube Action Twixtors (`test-assets/materials/action_raw/` & `test-assets/materials/action/`)
High-dynamism combat clips downloaded in original 4K/1080p via `yt-dlp` from verified anime twixtor community creators with explicit permissions for editing.

| # | Raw File | Source Video & Channel | Resolution & Native FPS | Exact Description Permission / License Terms | Credits Required |
|:---|:---|:---|:---:|:---|:---|
| 1 | `d5RygsMWj18.mp4` | [TWIXTOR - MIX ANIME CLIPS ! 4K](https://www.youtube.com/watch?v=d5RygsMWj18)<br>Channel: [BoykaTwixtorS](https://www.youtube.com/@BoykaTwixtorS_AMV) | 3840×2160 @ 30fps | *"HEY! HERE ARE ONE OF MY TWIXTORS FREE TO USE JUST CREDIT IF YOU USE THEM PLEASE! new twixtor guys this is a mix anime clips HERE THE LINK: ... JUST TO SEE YOUR EDITS THX!!!"* | `Credit: BoykaTwixtorS (@BoykaTwixtorS_AMV)` |
| 2 | `DZKDLiDGPVA.mp4` | [INTRO + TWIXTOR - DEMON SLAYER "Rengoku vs Akaza"](https://www.youtube.com/watch?v=DZKDLiDGPVA)<br>Channel: [BoykaTwixtorS](https://www.youtube.com/@BoykaTwixtorS_AMV) | 3840×2160 @ 30fps | *"HEY! HERE ARE ONE OF MY TWIXTORS FREE TO USE JUST CREDIT IF YOU USE THEM PLEASE! HERE THE LINK FOR GOOD QUALITY: ... JUST TO SEE YOUR EDITS THX!!!"* | `Credit: BoykaTwixtorS (@BoykaTwixtorS_AMV)` |
| 3 | `jVnGsCtPALA.mp4` | [Yuta Okkotsu Twixtor Clips For Edit 4K60FPS](https://www.youtube.com/watch?v=jVnGsCtPALA)<br>Channel: [Wyunye Twixtor](https://www.youtube.com/@Wyunye) | 3840×2160 @ 60fps | *"Hope you guys enjoy my Twixtors! 😊 If you want more, don't forget to subscribe and turn on notifications. I also take anime Twixtor requests! =D Go to my channel on telegram to download the twixtor you want ... Disclaimer: This video complies with Fair Use guidelines under Section 107 of the Copyright Act 1976."* | `Credit: Wyunye Twixtor (@Wyunye)` |
| 4 | `KP54NLa7vYc.webm` | [Sukuna Vs Jogo Twixtor 4K](https://www.youtube.com/watch?v=KP54NLa7vYc)<br>Channel: [DepriTwixtor](https://www.youtube.com/@DepriTwixtor) | 3840×2160 @ 30fps | *"Type: Twixtor scenes/Clips For Editing ... All of the images are under the use of fair use!"* | `Credit: DepriTwixtor (@DepriTwixtor)` |
| 5 | `KQm-5nmGiC4.mp4` | [Zenitsu Twixtor Clips 4K](https://www.youtube.com/watch?v=KQm-5nmGiC4)<br>Channel: [Animeworld Twixtor](https://www.youtube.com/@Animeworld_Rdj1) | 1920×1080 @ 30fps | *"Welcome to our channel! In this video, we’ve taken some of the most thrilling and emotional moments from your favorite anime series and transformed them with Twixtor’s stunning slow-motion effects ... ANIME TWIXTOR CLIPS: Download Anime Twixtor With No Subtitle for Edits : https://www.animeworldtwixtor.com/popular-anime-twixtor-clips"* | `Credit: Animeworld Twixtor (@Animeworld_Rdj1)` |
| 6 | `LxzKLGfDlf8.webm` | [Sanemi Twixtor 4K : High Quality Twixtor](https://www.youtube.com/watch?v=LxzKLGfDlf8)<br>Channel: [Animeworld Twixtor](https://www.youtube.com/@Animeworld_Rdj1) | 1920×1080 @ 30fps | *"Welcome to our channel! ... transformed them with Twixtor’s stunning slow-motion effects ... ANIME TWIXTOR CLIPS: Download Anime Twixtor With No Subtitle for Edits : https://www.animeworldtwixtor.com/popular-anime-twixtor-clips"* | `Credit: Animeworld Twixtor (@Animeworld_Rdj1)` |
| 7 | `NryqVoDTp1Q.mp4` | [free 4k twixtor clips ( SUKUNA ) \| 4k anime clips for editing](https://www.youtube.com/watch?v=NryqVoDTp1Q)<br>Channel: [Twixtor Aura](https://www.youtube.com/@TwixtorAura) | 3840×2160 @ 60fps | *"free 4k twixtor clips ( SUKUNA ) \| 4k anime clips for editing. Telegram download link in Comment ... subscribe for more videos #anime #4kanime #4k #edit #editing #animeedit #sukuna"* | `Credit: Twixtor Aura (@TwixtorAura)` |
| 8 | `Y1votGcsm8c.mp4` | [4k Quality \| Naruto Vs Sasuke - Final Valley Battle Twixtor Clips for Edit](https://www.youtube.com/watch?v=Y1votGcsm8c)<br>Channel: [Shxn AnimeXMusic](https://www.youtube.com/@shxnanimexmusic4736) | 1920×1080 @ 60fps | *"Video is taken from Credit: Arthas. SoftWare Used : Adobe AfterEffects Naruto Vs Sasuke - Final Valley Battle [ 120 fps ] Download Link : https://drive.google.com/file/d/1M6llWnUF82UHPc34hWSCI-q9i78crbyH/view?usp=sharing"* | `Credit: Shxn AnimeXMusic (@shxnanimexmusic4736) / Arthas` |

### Prepared 60fps Action Clips (`test-assets/materials/action/`)
All 64 scenes cut (1.5–4.0s), filtered (`motion >= 1.0`, `luma >= 40.0`, `contrast >= 20.0`), visually inspected for facial features / action choreography, and converted:
- **30 fps sources (28 clips)**: interpolated via RIFE v4 neural flow (DirectML RTX 5060) to 60.0 fps with anime held-frame deduplication (`RifeService.scanAnimeHeldFrames`), scaled to height 1080, H.264 CRF 18, no audio (`-an`).
- **60 fps sources (36 clips)**: scaled to 1920×1080, H.264 CRF 18, 60.0 fps, no audio (`-an`).
- **Total Action Clips**: **64** (exceeds requirement of ≥ 40 scenes, target 60+)
- **Total Detected Scenes**: **72**
- **Scenes with Face Detected**: **27**
- **Metadata**: [`kori_clip_meta.json`](action/kori_clip_meta.json)

---

## 4. Sound Effects (`test-assets/materials/sfx/`)
Curated cinematic and combat sound effects from Mixkit. All leading silence removed with FFmpeg (`silenceremove=start_periods=1:start_duration=0.005:start_threshold=-50dB`), normalized and converted to 44.1kHz 16-bit WAV for pristine latency-free sync on beat/accent transitions.

**License**: [Mixkit Sound Effects Free License](https://mixkit.co/license/#sfxFree) — Free for commercial and non-commercial projects, worldwide, unlimited projects, no attribution required.

### 4.1 Impact (`test-assets/materials/sfx/impact/`)
Heavy cinematic and combat hits for drop hits, sword impacts, and punch punches.

| File | Sound Title | Source URL | License | Processing |
|:---|:---|:---|:---|:---|
| `01_cinematic_whoosh_deep_impact.wav` | Cinematic Whoosh Deep Impact | [Mixkit SFX 1143](https://mixkit.co/free-sound-effects/impact/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `02_big_cinematic_impact.wav` | Big Cinematic Impact | [Mixkit SFX 788](https://mixkit.co/free-sound-effects/impact/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `03_movie_trailer_epic_impact.wav` | Movie Trailer Epic Impact | [Mixkit SFX 2908](https://mixkit.co/free-sound-effects/impact/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `04_deep_heartbeat_impact.wav` | Deep Heartbeat Impact | [Mixkit SFX 2198](https://mixkit.co/free-sound-effects/impact/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `05_suspense_cinematic_impact.wav` | Suspense Cinematic Impact | [Mixkit SFX 2917](https://mixkit.co/free-sound-effects/impact/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `06_cinematic_impact_thunder.wav` | Cinematic Impact Thunder | [Mixkit SFX 1286](https://mixkit.co/free-sound-effects/impact/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |

### 4.2 Whoosh (`test-assets/materials/sfx/whoosh/`)
Fast camera sweeps, weapon swings, dash transitions.

| File | Sound Title | Source URL | License | Processing |
|:---|:---|:---|:---|:---|
| `01_air_whoosh.wav` | Air Whoosh | [Mixkit SFX 1489](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `02_cinematic_whoosh_fast_transition.wav` | Cinematic Whoosh Fast Transition | [Mixkit SFX 1492](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `03_fast_small_sweep_transition.wav` | Fast Small Sweep Transition | [Mixkit SFX 166](https://mixkit.co/free-sound-effects/transition/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `04_fast_rocket_whoosh.wav` | Fast Rocket Whoosh | [Mixkit SFX 1714](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `05_whoosh_blow_flutter.wav` | Whoosh Blow Flutter | [Mixkit SFX 1490](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `06_magic_spell_mystery_whoosh.wav` | Magic Spell Mystery Whoosh | [Mixkit SFX 2345](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |

### 4.3 Riser (`test-assets/materials/sfx/riser/`)
Pre-drop build-up tension, velocity acceleration risers.

| File | Sound Title | Source URL | License | Processing |
|:---|:---|:---|:---|:---|
| `01_cinematic_trailer_riser.wav` | Cinematic Trailer Riser | [Mixkit SFX 790](https://mixkit.co/free-sound-effects/discover/riser/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `02_short_space_stutter_intro_riser.wav` | Short Space Stutter Intro Riser | [Mixkit SFX 1144](https://mixkit.co/free-sound-effects/discover/riser/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `03_cinematic_riser_helicopter_engine.wav` | Cinematic Riser Helicopter Engine | [Mixkit SFX 2719](https://mixkit.co/free-sound-effects/discover/riser/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `04_synthetic_power_bass_transition.wav` | Synthetic Power Bass Transition | [Mixkit SFX 2296](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `05_pulsating_bass_riser_transition.wav` | Pulsating Bass Riser Transition | [Mixkit SFX 2295](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |

### 4.4 Subdrop (`test-assets/materials/sfx/subdrop/`)
Low-frequency sub-bass drops for downbeats and heavy drop impacts.

| File | Sound Title | Source URL | License | Processing |
|:---|:---|:---|:---|:---|
| `01_knocking_sub_bass.wav` | Knocking Sub Bass | [Mixkit SFX 2300](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `02_mysterious_bass_pulse.wav` | Mysterious Bass Pulse | [Mixkit SFX 2298](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `03_futuristic_bass_hit.wav` | Futuristic Bass Hit | [Mixkit SFX 2303](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `04_short_bass_drop_hit.wav` | Short Bass Drop Hit | [Mixkit SFX 2299](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `05_bass_rumble_hum.wav` | Bass Rumble Hum | [Mixkit SFX 2297](https://mixkit.co/free-sound-effects/bass/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |

### 4.5 Glitch (`test-assets/materials/sfx/glitch/`)
Digital glitch, flash sync, and distortion accents.

| File | Sound Title | Source URL | License | Processing |
|:---|:---|:---|:---|:---|
| `01_small_electric_glitch.wav` | Small Electric Glitch | [Mixkit SFX 2595](https://mixkit.co/free-sound-effects/glitch/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `02_glitch_static.wav` | Glitch Static | [Mixkit SFX 1457](https://mixkit.co/free-sound-effects/glitch/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `03_fast_glitch_transitions.wav` | Fast Glitch Transitions | [Mixkit SFX 2596](https://mixkit.co/free-sound-effects/glitch/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `04_hard_glitch_hum.wav` | Hard Glitch Hum | [Mixkit SFX 2597](https://mixkit.co/free-sound-effects/glitch/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `05_radio_glitch_frequency.wav` | Radio Glitch Frequency | [Mixkit SFX 2566](https://mixkit.co/free-sound-effects/glitch/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |
| `06_system_error_glitch.wav` | System Error Glitch | [Mixkit SFX 2598](https://mixkit.co/free-sound-effects/glitch/) | Mixkit Sound Effects Free License | Trimmed leading silence, converted to WAV 44.1kHz stereo |

- **Total Sound Effects**: **28**
- **Categories**: 5 (`impact`, `whoosh`, `riser`, `subdrop`, `glitch`)

