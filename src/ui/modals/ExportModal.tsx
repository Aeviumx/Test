import React, { useRef, useState } from 'react';
import { Download, Film, Loader2, XCircle } from 'lucide-react';
import { exportComposition, ExportFormat } from '../../export/VideoExporter';
import { useProjectStore } from '../../store/useProjectStore';
import { Modal } from '../components/Modal';
import { ScrubbyInput } from '../components/ScrubbyInput';

export const ExportModal: React.FC = () => {
  const project = useProjectStore((s) => s.project);
  const comp = useProjectStore((s) => s.getActiveComp());
  const setActiveModal = useProjectStore((s) => s.setActiveModal);

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [scale, setScale] = useState<1 | 0.5 | 0.25>(1);
  const [fps, setFps] = useState<number>(comp.fps);
  const [bitrateMbps, setBitrateMbps] = useState<number>(12);
  const [range, setRange] = useState<'workArea' | 'full'>('workArea');

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const outWidth = Math.round(comp.width * scale);
  const outHeight = Math.round(comp.height * scale);

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setErrorMsg(null);
    setStatusText('Initializing deterministic WebGL2 render pipeline...');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const result = await exportComposition(comp, project, {
        format,
        scale,
        fps,
        bitrateMbps,
        range,
        signal: ctrl.signal,
        onProgress: (info) => {
          setProgress(info.progress);
          setStatusText(info.statusText);
          if (info.previewDataUrl) {
            setPreviewUrl(info.previewDataUrl);
          }
        },
      });

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusText(`Export complete: ${result.filename}`);
      setIsExporting(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setIsExporting(false);
    }
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsExporting(false);
  };

  return (
    <Modal
      title="Render & Export Composition"
      subtitle={`${comp.name} • Deterministic GPU Frame-by-Frame Encoder`}
      onClose={() => {
        if (!isExporting) setActiveModal('none');
      }}
      widthClass="max-w-xl"
    >
      <div className="space-y-4">
        {/* Format Selector */}
        <div>
          <label className="block text-[11px] text-[#9b9ba6] mb-1.5">Output Format</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'mp4', title: 'MP4 (H.264)', sub: 'WebCodecs + Muxer' },
              { id: 'webm', title: 'WebM (VP9)', sub: 'MediaRecorder' },
              { id: 'png-seq', title: 'PNG Sequence', sub: 'Lossless ZIP' },
              { id: 'gif', title: 'Animated GIF', sub: 'LZW 256-Color' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={isExporting}
                onClick={() => setFormat(item.id as ExportFormat)}
                className={`p-2 rounded border text-left transition-colors ${
                  format === item.id
                    ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-white'
                    : 'bg-[#1a1a1d] border-[#2e2e33] text-[#9b9ba6] hover:text-white'
                }`}
              >
                <div className="text-[12px] font-semibold">{item.title}</div>
                <div className="text-[10px] opacity-70">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1a1a1d] p-2.5 rounded border border-[#2e2e33]">
            <label className="block text-[10px] text-[#9b9ba6] mb-1">
              Resolution ({outWidth} × {outHeight} px)
            </label>
            <div className="flex gap-1.5">
              {[
                { val: 1, label: 'Full (100%)' },
                { val: 0.5, label: 'Half (50%)' },
                { val: 0.25, label: 'Quarter (25%)' },
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setScale(s.val as 1 | 0.5 | 0.25)}
                  className={`flex-1 py-1 rounded text-[11px] font-mono ${
                    scale === s.val
                      ? 'bg-[#6c5ce7] text-white'
                      : 'bg-[#25252b] text-[#9b9ba6] hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#1a1a1d] p-2.5 rounded border border-[#2e2e33]">
            <label className="block text-[10px] text-[#9b9ba6] mb-1">Time Span</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setRange('workArea')}
                className={`flex-1 py-1 rounded text-[11px] ${
                  range === 'workArea'
                    ? 'bg-[#6c5ce7] text-white'
                    : 'bg-[#25252b] text-[#9b9ba6] hover:text-white'
                }`}
              >
                Work Area ({(comp.workAreaEnd - comp.workAreaStart).toFixed(1)}s)
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setRange('full')}
                className={`flex-1 py-1 rounded text-[11px] ${
                  range === 'full'
                    ? 'bg-[#6c5ce7] text-white'
                    : 'bg-[#25252b] text-[#9b9ba6] hover:text-white'
                }`}
              >
                Entire Comp ({comp.duration.toFixed(1)}s)
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33]">
            <span className="text-[11px] text-[#9b9ba6]">Frame Rate</span>
            <ScrubbyInput
              value={fps}
              onChange={setFps}
              min={10}
              max={60}
              step={1}
              unit=" fps"
              disabled={isExporting}
              className="w-24"
            />
          </div>
          <div className="flex items-center justify-between bg-[#1a1a1d] px-3 py-2 rounded border border-[#2e2e33]">
            <span className="text-[11px] text-[#9b9ba6]">Target Bitrate</span>
            <ScrubbyInput
              value={bitrateMbps}
              onChange={setBitrateMbps}
              min={1}
              max={80}
              step={1}
              unit=" Mbps"
              disabled={isExporting || format === 'png-seq' || format === 'gif'}
              className="w-24"
            />
          </div>
        </div>

        {/* Live Progress & Thumbnail Preview */}
        {(isExporting || progress > 0 || errorMsg) && (
          <div className="bg-[#161619] border border-[#2e2e33] rounded-md p-3 space-y-2.5">
            {previewUrl && (
              <div className="flex justify-center bg-black/60 rounded overflow-hidden border border-[#2e2e33] h-32">
                <img src={previewUrl} alt="Render Frame Preview" className="h-full object-contain" />
              </div>
            )}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#d4d4dc] truncate">{statusText}</span>
              <span className="font-mono text-[#00d1b2] font-semibold">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-2 bg-[#232327] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#00d1b2] transition-all duration-150"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            {errorMsg && (
              <div className="text-[11px] text-[#f87171] flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-[#2e2e33]">
          <div className="flex items-center gap-1.5 text-[11px] text-[#9b9ba6]">
            <Film className="w-3.5 h-3.5 text-[#6c5ce7]" />
            <span>
              {Math.round(
                ((range === 'workArea' ? comp.workAreaEnd - comp.workAreaStart : comp.duration) || 1) * fps
              )}{' '}
              frames total
            </span>
          </div>
          <div className="flex gap-2">
            {isExporting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#ef4444]/20 hover:bg-[#ef4444]/30 border border-[#ef4444] text-[#f87171] text-[12px]"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel Render
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  className="px-3.5 py-1.5 rounded bg-[#2a2a30] hover:bg-[#34343c] text-[12px] text-[#d4d4dc]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#6c5ce7] hover:bg-[#5b4bc4] text-[12px] font-medium text-white shadow-lg shadow-[#6c5ce7]/20"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Start Render
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
