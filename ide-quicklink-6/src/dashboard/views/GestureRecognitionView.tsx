import { useEffect, useRef, useState } from 'react';
import {
  Hand,
  Plus,
  Check,
  LoaderCircle,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { GestureItem } from '../types';
import { initialGestures } from '../mockData';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';
import type { HandVideoInferenceResponse } from '../../lib/handInferenceClient';
import {
  predictHandGestureVideo,
} from '../../lib/handInferenceClient';

export function GestureRecognitionView() {
  const [gestures, setGestures] = useState<GestureItem[]>(initialGestures);
  const [isTrainingModalOpen, setIsTrainingModalOpen] = useState(false);
  const [newGestureName, setNewGestureName] = useState('');
  const [newMappedMessage, setNewMappedMessage] = useState('');
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [inferenceResult, setInferenceResult] = useState<HandVideoInferenceResponse | null>(null);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const [isInferring, setIsInferring] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!uploadedVideo) {
      setUploadedVideoUrl('');
      return;
    }
    const url = URL.createObjectURL(uploadedVideo);
    setUploadedVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedVideo]);

  const toggleGesture = (id: string) => {
    setGestures((prev) =>
      prev.map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g))
    );
  };

  const handleSaveCustomGesture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGestureName.trim() || !newMappedMessage.trim()) return;

    const newGesture: GestureItem = {
      id: 'gesture-custom-' + Date.now(),
      name: newGestureName.trim(),
      mappedMessage: newMappedMessage.trim(),
      category: 'custom',
      confidence: 0.93,
      enabled: true,
      handIcon: 'hand',
      samplesCount: 0,
      lastTrained: 'Just now',
      description: uploadedVideo
        ? `Reference video attached: ${uploadedVideo.name}.`
        : 'Custom gesture mapping. Add a reference video to keep it with this gesture.',
      referenceVideo: uploadedVideo ?? undefined,
    };

    setGestures((prev) => [...prev, newGesture]);
    setIsTrainingModalOpen(false);
    setNewGestureName('');
    setNewMappedMessage('');
  };

  const testGesture = () => {
    if (isInferring) return;
    setInferenceResult(null);
    setInferenceError(null);
    if (!uploadedVideo) {
      setInferenceError('Upload a video before testing a gesture.');
      return;
    }

    void (async () => {
      setIsInferring(true);
      try {
        setInferenceResult(await predictHandGestureVideo(uploadedVideo));
      } catch (error) {
        setInferenceError(error instanceof Error ? error.message : 'Hand inference could not be completed.');
      } finally {
        setIsInferring(false);
      }
    })();
  };

  const handleVideoSelection = (file: File | null) => {
    setUploadedVideo(file);
    setInferenceResult(null);
    setInferenceError(null);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
            Personalised Gesture Recognition
          </h1>
          <p className="text-sm sm:text-base text-[#D1D1D6] mt-2 max-w-2xl leading-relaxed">
            Train and calibrate hand gesture shortcuts using MediaPipe 21-point tracking. These mappings are calibrated for your individual motor comfort.
          </p>
        </div>

        <MagneticButton
          onClick={() => setIsTrainingModalOpen(true)}
          soundPitch={740}
          className="px-6 py-3.5 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm hover:bg-[#F0F0F2] transition-all flex items-center gap-2.5 cursor-pointer shadow-[0_0_25px_rgba(255,255,255,0.35)] shrink-0"
        >
          <Plus className="w-4 h-4 text-[#0D0D0E]" />
          <span>Add Custom Gesture</span>
        </MagneticButton>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => handleVideoSelection(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => videoInputRef.current?.click()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.04] px-4 py-2.5 text-sm text-white transition-colors hover:border-emerald-300/40 hover:bg-white/[0.08]"
        >
          <Upload className="h-4 w-4 text-emerald-300" />
          <span>{uploadedVideo ? uploadedVideo.name : 'Upload a video'}</span>
        </button>
        {uploadedVideo && (
          <button
            type="button"
            onClick={() => { handleVideoSelection(null); if (videoInputRef.current) videoInputRef.current.value = ''; }}
            className="text-left text-xs text-[#8E8E93] transition-colors hover:text-white"
          >
            Remove video
          </button>
        )}
      </div>

      {uploadedVideo && uploadedVideoUrl && (
        <div className="max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-black/50">
          <video src={uploadedVideoUrl} controls className="max-h-[420px] w-full bg-black" />
        </div>
      )}

      {/* Assistive Scope Clarification Banner */}
      <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] text-xs text-[#8E8E93] leading-relaxed flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p>
          <strong className="text-white font-medium">Important assistive distinction:</strong> Project Echo does not claim to recognise universal sign language. These are personal gesture-to-phrase mappings calibrated specifically to your individual movement patterns.
        </p>
      </div>

      {(isInferring || inferenceError || inferenceResult) && (
        <section
          aria-live="polite"
          className={`p-5 rounded-2xl border text-sm animate-in fade-in duration-200 ${
            inferenceError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              : 'bg-emerald-500/10 border-emerald-500/25 text-[#D1D1D6]'
          }`}
        >
          {isInferring && (
            <div className="flex items-center gap-2 text-emerald-200">
              <LoaderCircle className="w-4 h-4 animate-spin" />
              <span>Processing video and detecting hand landmarks…</span>
            </div>
          )}
          {inferenceError && <p role="alert">{inferenceError}</p>}
          {inferenceResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-200">
                <Check className="w-4 h-4" />
                <h2 className="font-semibold">Predicted gesture: {inferenceResult.predicted_label}</h2>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div><dt className="text-[#8E8E93]">Frames processed</dt><dd className="mt-1 text-white font-mono">{inferenceResult.frames_processed}</dd></div>
                <div><dt className="text-[#8E8E93]">Frames with detected hands</dt><dd className="mt-1 text-white font-mono">{inferenceResult.frames_with_detected_hands}</dd></div>
                <div><dt className="text-[#8E8E93]">Frames with valid slot 0</dt><dd className="mt-1 text-white font-mono">{inferenceResult.frames_with_valid_slot0_observations}</dd></div>
              </dl>
              <div>
                <h3 className="text-xs font-semibold text-white">Uncalibrated model scores</h3>
                <p className="mt-1 text-[11px] text-[#8E8E93]">These scores are not calibrated and must not be interpreted as reliable confidence estimates.</p>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
                  {Object.entries(inferenceResult.uncalibrated_scores).map(([label, score]) => (
                    <li key={label}>{label}: {score.toFixed(4)}</li>
                  ))}
                </ul>
              </div>
              {inferenceResult.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-amber-200">Warnings</h3>
                  <ul className="mt-1 list-disc pl-5 text-xs text-amber-100/90">
                    {inferenceResult.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Gesture Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gestures.map((gesture) => (
          <GlassCard
            key={gesture.id}
            interactive
            elevated
            className={`p-7 flex flex-col justify-between gap-6 transition-all ${
              gesture.enabled ? 'border-white/20' : 'border-white/10 opacity-60'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 igloo-glow-silver">
                    <Hand className="h-7 w-7 text-emerald-300" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-white font-display leading-tight">{gesture.name}</h2>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#8E8E93] block mt-0.5">
                      {gesture.category === 'core' ? 'Core Calibrated' : 'Custom Trained'}
                    </span>
                  </div>
                </div>

                {/* Enable / Disable Toggle Switch */}
                <button
                  type="button"
                  onClick={() => toggleGesture(gesture.id)}
                  aria-pressed={gesture.enabled}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    gesture.enabled ? 'bg-emerald-500 shadow-[0_0_10px_#34D399]' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform transform mt-1 ${
                      gesture.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Mapped Message Box */}
              <div className="mt-6 p-4 rounded-2xl bg-black/50 border border-white/10">
                <span className="text-[10px] font-mono text-[#8E8E93] uppercase tracking-wider block mb-1">
                  Spoken Output on Confirmation:
                </span>
                <p className="text-sm font-semibold text-white leading-relaxed">"{gesture.mappedMessage}"</p>
              </div>

              <p className="text-xs text-[#8E8E93] mt-3.5 leading-relaxed">{gesture.description}</p>
            </div>

            {/* Bottom Meta & Test Controls */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
              <div>
                <p className="text-emerald-400 font-bold">Gesture mapping</p>
                <p className="text-[#555558] text-[10px]">{gesture.samplesCount} saved samples</p>
              </div>

              <button
                onClick={testGesture}
                disabled={isInferring}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/25 border border-white/20 text-white flex items-center gap-1.5 cursor-pointer transition-all hover:border-white/40 disabled:opacity-50 disabled:cursor-wait"
                title="Run hand inference on the selected video"
              >
                {isInferring ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Hand className="w-3.5 h-3.5" />}
                <span>{isInferring ? 'Processing' : 'Test'}</span>
              </button>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Train Custom Gesture Modal */}
      {isTrainingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl igloo-glass-elevated border border-white/25 p-8 sm:p-10 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold text-white font-display mb-1">Train a Personalised Gesture</h2>
            <p className="text-xs text-[#8E8E93] mb-6">
              Add a name, spoken message, and an optional video reference for your gesture.
            </p>

            <form onSubmit={handleSaveCustomGesture} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                  Gesture Name / Trigger
                </label>
                <input
                  type="text"
                  required
                  value={newGestureName}
                  onChange={(e) => setNewGestureName(e.target.value)}
                  placeholder="e.g. THUMBS SIDEWAYS (Need a Break)"
                  className="w-full rounded-2xl bg-[#0D0D0E] border border-white/20 px-4 py-3 text-sm text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                  Intended Spoken Message
                </label>
                <input
                  type="text"
                  required
                  value={newMappedMessage}
                  onChange={(e) => setNewMappedMessage(e.target.value)}
                  placeholder="e.g. Could we please take a brief break?"
                  className="w-full rounded-2xl bg-[#0D0D0E] border border-white/20 px-4 py-3 text-sm text-white focus:outline-none focus:border-white"
                />
              </div>

              {/* Reference Video Upload */}
              <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => handleVideoSelection(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="flex min-h-[74px] w-full items-center justify-center gap-3 rounded-xl border border-white/25 bg-white/[0.035] px-4 py-4 text-center text-sm font-semibold text-white transition-colors hover:border-emerald-300/45 hover:bg-emerald-300/[0.06]"
                >
                  <Upload className="h-5 w-5 shrink-0 text-emerald-400" />
                  <span className="min-w-0 truncate">{uploadedVideo ? uploadedVideo.name : 'Upload Gesture Video'}</span>
                </button>
                <p className="mt-2 text-center font-mono text-[9px] tracking-wide text-[#77777D]">
                  {uploadedVideo ? 'VIDEO SELECTED · SAVED WITH THIS MAPPING' : 'OPTIONAL · MP4, MOV, WEBM'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-5 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsTrainingModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm text-[#8E8E93] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <MagneticButton
                  soundPitch={880}
                  className="px-6 py-2.5 rounded-xl bg-white text-[#0D0D0E] font-semibold text-sm hover:bg-[#F0F0F2] transition-colors cursor-pointer shadow-md"
                >
                  Save Gesture Mapping
                </MagneticButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
