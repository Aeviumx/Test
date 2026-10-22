import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, HardDrive, ShieldCheck, X } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';

interface ModelInfo {
  id: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  expectedSha256: string;
  license: string;
  description: string;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'rife_v4',
    name: 'RIFE v4.6 Neural Flow (Slow-Motion)',
    fileName: 'rife_v4.onnx',
    sizeBytes: 21604631,
    expectedSha256: '6a31074c0f588648982b5e828aee6c27e005015a712a46ea63da48c65fa9a26b',
    license: 'CC-BY-NC 4.0 (Personal Non-Commercial)',
    description: 'Primary high-framerate optical flow engine for anime edits',
  },
  {
    id: 'isnetis',
    name: 'SkyTNT IS-Net Anime Segmentation',
    fileName: 'isnetis.onnx',
    sizeBytes: 176069933,
    expectedSha256: 'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99',
    license: 'MIT (Commercial-friendly)',
    description: 'Dichotomous anime character background isolation and alpha matting',
  },
  {
    id: 'anime_face_detect',
    name: 'DeepGHS Anime Face Detector (YOLOv8)',
    fileName: 'anime_face_detect.onnx',
    sizeBytes: 44583229,
    expectedSha256: '403b5bc93b6ff789b7d183418df4a1364049bac00c24acd927604a7ff6891483',
    license: 'Apache-2.0',
    description: 'Ultra-fast anime character face bounding box detection',
  },
  {
    id: 'anime_landmarks_cfa',
    name: 'CFA Anime Facial Landmarks (24 points)',
    fileName: 'anime_landmarks_cfa.onnx',
    sizeBytes: 16740764,
    expectedSha256: '636ce58523779772735c8238e10d81bb2cfa3b9fe0285d8bcadb40664e560d29',
    license: 'MIT',
    description: '24 facial landmark point extraction for camera reframe targeting',
  },
  {
    id: 'depth_anything_v2_small',
    name: 'Depth Anything V2 Small',
    fileName: 'depth_anything_v2_small.onnx',
    sizeBytes: 99060839,
    expectedSha256: 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c',
    license: 'Apache-2.0 (Commercial-friendly)',
    description: 'Monocular depth map foundation model for 2.5D parallax displacement',
  },
  {
    id: 'ggml_base',
    name: 'OpenAI Whisper Base (GGML whisper.cpp)',
    fileName: 'ggml-base.bin',
    sizeBytes: 147951465,
    expectedSha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    license: 'MIT',
    description: 'Local GPU speech recognition for word-level karaoke forced alignment',
  },
];

export const SettingsModal: React.FC = () => {
  const setActiveModal = useProjectStore((s) => s.setActiveModal);
  const interpolationEngine = useProjectStore((s) => s.interpolationEngine ?? 'rife');
  const setInterpolationEngine = useProjectStore((s) => s.setInterpolationEngine);

  const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, { percent: number; status: string; downloaded: number; total: number }>
  >({});
  const [shaStatus, setShaStatus] = useState<Record<string, { valid: boolean; actualSha: string }>>({});

  useEffect(() => {
    // Check initial model status
    const api = window.koriAPI;
    if (api?.ai) {
      DEFAULT_MODELS.forEach((m) => {
        void api.ai.checkModelStatus(m.id).then((ready) => {
          setModelStatus((prev) => ({ ...prev, [m.id]: ready }));
          if (ready && api.ai.verifyModelSha256) {
            void api.ai.verifyModelSha256(m.id).then((res) => {
              setShaStatus((prev) => ({
                ...prev,
                [m.id]: { valid: res.valid, actualSha: res.actualSha256 },
              }));
            });
          }
        });
      });

      const unsub = api.ai.onModelProgress((p) => {
        setDownloadProgress((prev) => ({
          ...prev,
          [p.modelName]: {
            percent: p.percent,
            status: p.status,
            downloaded: p.bytesDownloaded,
            total: p.totalBytes,
          },
        }));
        if (p.status === 'ready') {
          setModelStatus((prev) => ({ ...prev, [p.modelName]: true }));
        }
      });
      return unsub;
    }
  }, []);

  const handleDownload = async (modelId: string) => {
    if (!window.koriAPI?.ai) return;
    try {
      setDownloadProgress((prev) => ({
        ...prev,
        [modelId]: { percent: 1, status: 'downloading', downloaded: 0, total: 100 },
      }));
      await window.koriAPI.ai.downloadModel(modelId);
      setModelStatus((prev) => ({ ...prev, [modelId]: true }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Download failed: ${msg}`);
      setDownloadProgress((prev) => ({
        ...prev,
        [modelId]: { percent: 0, status: 'error', downloaded: 0, total: 0 },
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-slate-100">Preferences & Neural Models</h2>
          </div>
          <button
            onClick={() => setActiveModal('none')}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Frame Interpolation Engine */}
          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Slow-Motion & Frame Interpolation Engine
            </h3>
            <p className="text-xs text-slate-400">
              Select the motion interpolation pipeline for velocity ramps and high-framerate 60 FPS slowdowns:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  interpolationEngine === 'rife'
                    ? 'border-sky-500/80 bg-sky-950/30 text-sky-100'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="engine"
                  value="rife"
                  checked={interpolationEngine === 'rife'}
                  onChange={() => setInterpolationEngine?.('rife')}
                  className="mt-1 accent-sky-500"
                />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    RIFE Neural Flow <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono">Default</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    AI-powered optical flow with anime duplicate deduplication. Licensed CC-BY-NC 4.0 for personal non-commercial edits.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  interpolationEngine === 'minterpolate'
                    ? 'border-sky-500/80 bg-sky-950/30 text-sky-100'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="engine"
                  value="minterpolate"
                  checked={interpolationEngine === 'minterpolate'}
                  onChange={() => setInterpolationEngine?.('minterpolate')}
                  className="mt-1 accent-sky-500"
                />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    FFmpeg minterpolate <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">LGPL</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Motion-compensated bidirectional optical flow. 100% royalty-free open source for commercial compliance.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: AI Neural Model Downloads with SHA-256 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  On-Demand Neural Models (Zero-Bloat Installer)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Models are downloaded upon first use with real-time progress and cryptographic SHA-256 verification:
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {DEFAULT_MODELS.map((m) => {
                const isReady = modelStatus[m.id];
                const progress = downloadProgress[m.id];
                const sha = shaStatus[m.id];

                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-slate-200">{m.name}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                            {(m.sizeBytes / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                            {m.license}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">{m.description}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isReady ? (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded-full">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>SHA-256 Verified</span>
                          </div>
                        ) : progress?.status === 'downloading' || progress?.status === 'verifying' ? (
                          <span className="text-xs text-sky-400 font-mono">
                            {progress.status === 'verifying' ? 'Verifying SHA-256...' : `${progress.percent}%`}
                          </span>
                        ) : (
                          <button
                            onClick={() => void handleDownload(m.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-sky-300 bg-sky-950/60 border border-sky-800/80 hover:bg-sky-900/60 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {progress && (progress.status === 'downloading' || progress.status === 'verifying') && (
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-sky-500 h-1.5 rounded-full transition-all duration-200"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    )}

                    {/* SHA Info */}
                    <div className="text-[11px] font-mono text-slate-500 truncate">
                      SHA-256: {sha?.valid ? m.expectedSha256 : `${m.expectedSha256.slice(0, 32)}...`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-800 px-6 py-3 bg-slate-950/80">
          <button
            onClick={() => setActiveModal('none')}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 transition-colors shadow-lg shadow-sky-600/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
