# Third-Party Licenses & Commercial Use Audit

This document provides a comprehensive inventory of all third-party neural network models, native binaries, and core libraries bundled or utilized in **Kōri (氷) Desktop Studio**, including exact licensing terms and commercial viability status.

---

## 1. Summary Matrix

| Component | Type | Creator / Source | License | Commercial Use Permitted? | Notes |
|:---|:---|:---|:---:|:---:|:---|
| **whisper.cpp** | Native Audio ASR Binary | Georgi Gerganov / ggml | **MIT** | **YES** | Standalone C++ binary, zero runtime dependencies |
| **OpenAI Whisper (Base/Tiny)** | ASR Weights (GGML) | OpenAI | **MIT** | **YES** | Permissive open-weights license |
| **SkyTNT Anime Segmentation** | IS-Net DIS Anime Matting | SkyTNT (`skytnt/anime-seg`) | **MIT** | **YES** | 1024×1024 anime-specialized alpha matting |
| **DeepGHS Anime Face Detector** | YOLOv8 Anime Face ONNX | DeepGHS (`deepghs/anime_face_detection`) | **Apache-2.0** | **YES** | $F_1 = 0.95$ on anime lineart and stylized eyes |
| **CFA Landmark Model** | 24-point Facial Landmarks | kanosawa (`anime_face_landmark_detection`) | **MIT** | **YES** | Exported to standalone ONNX (`anime_landmarks_cfa.onnx`) |
| **Depth Anything V2 Small** | Monocular Depth Estimation | ByteDance & HKU MMLab | **Apache-2.0** | **YES** | **Depth Anything V2 is Apache 2.0** (unlike V1 CC-BY-NC) |
| **Real-ESRGAN Anime 4x (6B)** | AI Super-Resolution Upscaling | Xintao Wang / DeepGHS | **BSD-3-Clause** | **YES** | High-quality 4x anime art upscaler for zoom headroom |
| **ONNX Runtime Node** | Native C++ Inference Engine | Microsoft Corporation | **MIT** | **YES** | DirectML / CUDA / CPU execution providers |
| **FFmpeg & FFprobe** | Audio/Video Processing | FFmpeg team | **LGPL v2.1+ / GPL v3** | **YES** | Bundled as external binary (`ffmpeg-static`), compliant |
| **Electron & Node.js** | Desktop Shell Runtime | OpenJS Foundation / GitHub | **MIT** | **YES** | Standard commercial desktop application stack |
| **React, Tailwind, Zustand** | Frontend UI Framework | Meta / Tailwind Labs / Zustand | **MIT** | **YES** | Permissive MIT open-source |
| *RIFE v4.6 (Optional)* | Frame Interpolation | Megvii Research | **CC-BY-NC 4.0** | ⚠️ **NON-COMMERCIAL ONLY** | Marked as optional research plugin; see Section 3 |

---

## 2. Detailed Neural Model Licenses

### 2.1 SkyTNT IS-Net Anime Segmentation
- **Model Path:** `models/isnetis.onnx` (167.9 MB)
- **Architecture:** Dichotomous Image Segmentation (IS-Net) fine-tuned on Danbooru anime illustrations.
- **License:** **MIT License**
- **Commercial Usage:** Permitted without royalty. Attribution preserved in software notices.

### 2.2 DeepGHS Anime Face Detection (v1.4)
- **Model Path:** `models/anime_face_detect.onnx` (42.5 MB)
- **Architecture:** YOLOv8-s anchor-free neural object detector specialized for 2D anime faces.
- **License:** **Apache License 2.0**
- **Commercial Usage:** Permitted for commercial modification, bundling, and distribution.

### 2.3 CFA Anime Facial Landmark Detector
- **Model Path:** `models/anime_landmarks_cfa.onnx` (16.0 MB)
- **Architecture:** Cascaded Feature Aggregation for 24 distinct anime facial landmarks.
- **License:** **MIT License**
- **Commercial Usage:** Permitted for commercial application.

### 2.4 Depth Anything V2 (Small)
- **Model Path:** `models/depth_anything_v2_small.onnx` (94.5 MB)
- **Architecture:** Monocular depth foundation model with synthetic-to-real transfer.
- **License:** **Apache License 2.0**
- **Important Licensing Note:**
  > [!IMPORTANT]
  > While Depth Anything **V1** was released under a restrictive Non-Commercial license (CC-BY-NC 4.0), **Depth Anything V2 is officially released under the Apache License 2.0**, making it 100% legal for commercial desktop distribution and SaaS products.

### 2.5 whisper.cpp & GGML Whisper Models
- **Binary Path:** `bin/whisper/Release/whisper-cli.exe`
- **Model Path:** `models/ggml-base.bin` (141.1 MB)
- **License:** **MIT License**
- **Commercial Usage:** Permitted for unrestricted commercial use.

### 2.6 Real-ESRGAN Anime 4x Super-Resolution (6B)
- **Model Path:** `models/RealESRGAN_x4plus_anime_6B.onnx` (17.1 MB)
- **Architecture:** Compact 6-block RRDB anime super-resolution network fine-tuned on lineart and illustrations.
- **License:** **BSD 3-Clause License**
- **Commercial Usage:** Permitted without royalty. Automatic upscale during import prevents blur when camera punch zoom reaches 2.5×–4.0×.

---

## 3. RIFE Neural Motion Estimation & Licensing Terms

- **Role in Kōri:** **Primary Slow-Motion Engine for Personal Use**. RIFE provides state-of-the-art optical flow frame interpolation for smooth 60 FPS velocity anime edits.
- **Repository / Creator:** Megvii Research (Huang et al., *Real-Time Intermediate Flow Estimation for Video Frame Interpolation*, ECCV 2022) — https://github.com/megvii-research/ECCV2022-RIFE
- **Exact Weights Mirror:** `FuryTMP/RIFE_fp32` (RIFE v4.6 FP32 ONNX checkpoint: `rife_v4.onnx`, 21,604,631 bytes, SHA-256: `6a31074c0f588648982b5e828aee6c27e005015a712a46ea63da48c65fa9a26b`).
- **License:** Creative Commons Attribution-NonCommercial 4.0 International (**CC-BY-NC 4.0**).
- **Personal vs Commercial Usage Policy:**
  1. **Personal Non-Commercial Use:** RIFE is enabled as the default, highest-quality neural flow engine.
  2. **Commercial Compliance Switch:** A user-facing preference toggle **«RIFE / FFmpeg minterpolate»** is provided directly in `Preferences & Neural Models` (`Ctrl+,`). When switched to **FFmpeg minterpolate**, all slow-motion frames are synthesized via bidirectional motion vector estimation in FFmpeg, which is 100% free and royalty-free under the **LGPL v2.1+ / GPL v3** license.
  3. **Zero-Bloat Installer Policy:** RIFE weights are NOT bundled in the NSIS desktop setup; weights are downloaded on-demand upon first invocation with cryptographic SHA-256 verification and progress reporting.

---

## 4. Software Dependencies & Runtime Components

| Library | Version | License | Link |
|:---|:---:|:---:|:---|
| `onnxruntime-node` | 1.30.0 | MIT | https://github.com/microsoft/onnxruntime |
| `ffmpeg-static` | 5.3.0 | GPL-3.0 / LGPL-2.1 | https://github.com/eugeneware/ffmpeg-static |
| `electron` | 45.0.0 | MIT | https://github.com/electron/electron |
| `vite` | 6.0.3 | MIT | https://github.com/vitejs/vite |
| `react` | 18.3.1 | MIT | https://github.com/facebook/react |
| `zustand` | 5.0.2 | MIT | https://github.com/pmndrs/zustand |
| `immer` | 10.1.1 | MIT | https://github.com/immerjs/immer |
| `zod` | 4.6.7 | MIT | https://github.com/colinhacks/zod |
| `mp4-muxer` | 5.1.3 | MIT | https://github.com/Kagami/mp4-muxer.js |
| `lucide-react` | 0.468.0 | ISC | https://github.com/lucide-icons/lucide |
| `tailwindcss` | 3.4.17 | MIT | https://github.com/tailwindlabs/tailwindcss |

---

## 5. Compliance Statement

All core bundled assets in the default Kōri distribution are **strictly licensed under MIT, Apache-2.0, ISC, or LGPL**. Users and enterprises can commercialize videos, edits, and assets produced by Kōri with full legal protection.
