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

## 5. Kōri CLI: как на самом деле собирается эдит

> Разделы 1–4 — творческие рецепты. В конвейере CLI сейчас реализованы стили **`gacha-hype`** (арты персонажей)
> и **`velocity`** (твикстор-клипы).
> Стиль `aesthetic-lyric` через CLI пока не собирается — не выдавай его за готовый.

Эдит собирается **только** через `npm run kori -- …` (или `node bin/kori.js …`). Отдельные Python/OpenCV-скрипты
рендера эдитов запрещены: всё, что нужно эдиту, добавляется в `pipeline/`.

```bash
# 0. Один раз для новой папки с артами: лица, контур персонажа, основной цвет
npm run kori -- faces test-assets/real/art          # пишет test-assets/real/art/kori_art_meta.json

# 1. Всё сразу: анализ трека → план → линтер → рендер → независимая проверка edit_qa.py
npm run kori -- render --audio test-assets/real/track_02_midnight_phonk.mp3 \
  --art test-assets/real/art/gacha_liv.png test-assets/real/art/gacha_lucia.png test-assets/real/art/gacha_vera.png \
  --out out/gacha.mp4 [--duration 15] [--signature "edit by ник"]

# Velocity (твикстор-эдит) из видеоклипов:
npm run kori -- clips public/assets                 # разметка клипов: сцены, движение, лица → kori_clip_meta.json
#   + лист сцен kori_scenes.jpg и метки kori_scene_tags.json — ОТКРОЙ лист и проставь крупность каждой сцены (см. правило 8)
npm run kori -- render --style velocity --audio test-assets/real/track_02_midnight_phonk.mp3 \
  --clips public/assets/makima_twixtor.mp4 --out out/velocity.mp4 [--sfx test-assets/materials/sfx]

# Или по шагам:
npm run kori -- analyze --audio <трек>                       # темп, биты, дроп, ритмический рисунок
npm run kori -- plan --audio <трек> --art <арты> --out out/plan.json
npm run kori -- lint --plan out/plan.json
npm run kori -- stills --plan out/plan.json --times 0.5,4,6.5 --out out/stills   # быстро посмотреть кадры
npm run kori -- export --plan out/plan.json --out out/gacha.mp4
npm run kori -- qa out/gacha.mp4
```

### Как устроен конвейер (`pipeline/`)

| Файл | Что делает |
| :--- | :--- |
| `audio.mjs` | Огибающая атак (весь спектр + бочка), темп, биты (DP по Эллису), сильные доли, дроп, рисунок акцентов; время удара уточняется по огибающей низа с точностью 1 мс (момент 50% атаки) |
| `art.mjs` | Читает разметку артов `kori_art_meta.json` (её делает `tools/detect_faces.py`) |
| `framing.mjs` | Кадрирование: `full` / `mid` / `close` / `wide`, кадр внутри карточки; общая функция для линтера и рендера |
| `rhythm.mjs` | Общая ритмика стилей: фрагмент вокруг дропа, акценты по рисунку (шестнадцатые), привязка к атаке удара |
| `styles/gachaHype.mjs` | Строит план: 2 такта интро с карточками → дроп → 3 акцента на такт по рисунку трека; вспышка только на сильную долю |
| `styles/velocity.mjs` | Твикстор: склейка на каждом акценте, соседние отрезки из разных клипов; момент выбирается по пику движения, резкости всплеска и тому, виден ли персонаж (лицо, размер); на сильной доле 0.25×, на остальных ударах 0.45×, к следующему удару разгон до 2.6–3.2× со смешиванием кадров; окно 9:16 едет за персонажем по траектории из разметки клипа; склейки «по движению»: если рывок в конце кадра идёт в ту же сторону, что в начале следующего (оптический поток из разметки), такой кадр выбирается охотнее; сцены с меткой `wide`/`skip` не берутся, `close` — в приоритете; эффекты чередуются: вспышка, кадр-удар (инверсия ч/б), «карточка» (кадр в белой рамке на размытом фоне), цветная засветка в цвет кадра, размытие с наводкой резкости, наклон камеры, «заикание» (stutter), шлейф (echo), ч/б, RGB-сдвиг, тряска; переходы «зум-проход», «вжух» и «наложение» (следующий кадр проступает поверх текущего) |
| `clips.mjs` | Читает разметку клипов `kori_clip_meta.json` (её делает `tools/analyze_clips.py`) |
| `tools/analyze_clips.py` | Разметка клипов (`kori clips <папка>`): сцены, кривая движения, яркость/контраст, доля дублей, траектория персонажа 4 раза в секунду (лицо или самая детальная/подвижная колонка кадра), направление движения (оптический поток); лист сцен `kori_scenes.jpg` и шаблон меток `kori_scene_tags.json` |
| `sfx.mjs` | Звуковые эффекты: сам размечает каждый файл (атака, пик, уровень) и ставит удар атакой на удар в музыке, «вжух» пиком на склейку, нарастание пиком на дроп (`--sfx <папка>` с подпапками impact/ subdrop/ whoosh/ riser/) |
| `lint.mjs` | Проверяет план: лицо в кадре на крупных планах, плотность вспышек, длина кадров, привязка акцентов, найден ли дроп |
| `render.mjs` | Рисует план (Skia-canvas): карточки, фоны в цвет персонажа, видео-сцены с кривыми скорости, панч, тряска с motion blur, RGB-сдвиг, радиальный смаз, зум-проход, свечение (glow), вспышки; события выровнены по кадрам; звук −14 LUFS |

### Правила для агента

1. Время в эдите **никогда** не вписывается руками: только из `analyze`/`plan`.
2. Перед экспортом смотри кадры через `stills`: все крупные планы и момент дропа.
3. Готовность = `edit_qa.py` PASS **и** визуальный чек-лист ниже. `tools/edit_qa.py` и его пороги не менять.
4. В отчёт пользователю — сырой вывод `edit_qa.py`, без пересказа.
5. Если арт не размечен или лицо найдено неверно — поправь `face` в `kori_art_meta.json` и поставь `"locked": true`.
6. Широкие арты (16:9) в вертикальном кадре превращаются в полоску — для финала стиль берёт только квадратные/вертикальные.
7. Синхрон: склейки и вспышки по умолчанию стоят на 2 кадра раньше атаки удара (`--lead-frames 2`, как у профи —
   у референса ~2.5 кадра). Главное — постоянство: `edit_qa.py` проверяет медианное смещение (−60…+17 мс)
   и разброс (≤ 25 мс, предупреждение > 12 мс). Разброс > 12 мс на слух ощущается как «удары плавают».
8. **Крупность сцен размечаешь ты, глазами.** Автоматически отличить общий план с крошечными фигурками от крупного
   надёжно нельзя (проверено: контуры, заметность, детектор людей COCO на аниме не работают). После `kori clips`
   открой `kori_scenes.jpg` (и `_2`, `_3`…) и впиши в `kori_scene_tags.json` для каждой «клип#сцена»:
   `"close"` — лицо / по пояс; `"medium"` — фигура целиком и крупно; `"wide"` — общий план, фигурки мелкие
   (в вертикальном 9:16 не читается — эдит не возьмёт); `"skip"` — нет персонажа вообще (только огонь, смаз, вспышка).
   Сомневаешься между medium и wide — смотри, будет ли персонаж больше ~1/4 высоты кадра: нет → `wide`.
   Повторный `kori clips` твои метки не стирает.
9. **Смысл действия — тоже твоя разметка.** Вместо строки ставь объект:
   `{"scale": "medium", "action": "attack", "who": "naruto", "focus": 0.3}`.
   `action`: `attack` — наносит удар / выпускает технику; `hit` — получает удар, отлетает, взрыв на нём;
   `charge` — замах, концентрация, обнажает меч; `move` — рывок, полёт; `react` — крик, эмоция; `pose` — стоит, смотрит.
   `who` — кто в кадре (одно имя латиницей). Эдит ставит после `attack` кадр `hit` **другого** персонажа
   **из того же боя** (клипы одного источника: `name_01`, `name_02`…), после `charge` — `attack` того же персонажа.
   Чтобы такие пары были, скачивай бои целиком по обмену ударами: и кадр удара, и кадр, где по противнику попали.
   Чтобы понять действие, одного кадра из листа мало — смотри 3–5 кадров сцены (stills или ffmpeg `tile`).
   `focus` (0…1 по горизонтали) — только если окно кадра уезжает с персонажа на эффект (дым, огонь, вспышку).
10. **Разнообразие.** Готовый эдит записывает свои сцены в `kori_usage.json` рядом с клипами; следующий эдит из той
    же папки берёт в первую очередь другие сцены (`--no-history` — не учитывать). `--seed N` — другой вариант
    из тех же клипов. Если повторы всё равно заметны — материала мало: на 15-секундный эдит уходит ~22 сцены,
    на три разных эдита нужно 70+ годных сцен (без wide/skip и без «дёрганых» клипов с дублями кадров > 20%).

## 6. Визуальный чек-лист (глазами, по раскадровке `*_qa_sheet.png` и `stills`)

- [ ] Цвета персонажей совпадают с исходными артами
- [ ] В каждом крупном плане лицо целиком в кадре
- [ ] Нет кропов, где в центре кадра торс без лица
- [ ] Нет каймы и рваных краёв у персонажей, персонаж нигде не обрезан
- [ ] Пустой белый экран не дольше 4 кадров
- [ ] Первая секунда в движении (хук)
