import { useState } from 'react';
import { Camera, Check, Mic, ShieldCheck, Volume2 } from 'lucide-react';
import type { SessionConsent } from '../types';

interface SessionConsentModalProps {
  initialChoices: SessionConsent;
  onAgree: (consent: SessionConsent) => void;
  onDisagree: () => void;
}

const consentOptions: {
  key: keyof SessionConsent;
  title: string;
  description: string;
  Icon: typeof Camera;
}[] = [
  {
    key: 'camera',
    title: 'Camera access',
    description: 'Allow the live camera preview for gesture support. This prototype does not record or upload camera video.',
    Icon: Camera,
  },
  {
    key: 'microphone',
    title: 'Microphone and speech input',
    description: 'When you start live speech input with Scribe, audio is streamed to ElevenLabs for remote transcription. Echo does not persist raw audio by default; provider retention follows your ElevenLabs account terms. Browser microphone permission is also required. Browser SpeechRecognition is an optional development fallback.',
    Icon: Mic,
  },
  {
    key: 'voiceCloning',
    title: 'Voice-cloning consent',
    description: 'I consent to voice-sample processing only if I later start a separate cloning setup. Voice cloning is not active in this prototype; this checkbox does not record or upload audio.',
    Icon: Volume2,
  },
];

export function SessionConsentModal({ initialChoices, onAgree, onDisagree }: SessionConsentModalProps) {
  const [choices, setChoices] = useState<SessionConsent>(initialChoices);
  const hasSelectedConsent = Object.values(choices).some(Boolean);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md">
      <section
        className="session-consent-panel my-auto w-full max-w-xl rounded-[28px] border border-white/20 p-5 text-[#F0F0F2] sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-consent-title"
        aria-describedby="session-consent-description"
      >
        <div className="mb-5 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="font-mono text-[9px] tracking-[0.18em] text-emerald-300">SESSION PRIVACY</p>
            <h2 id="session-consent-title" className="mt-1 font-display text-2xl font-semibold text-white">Choose your permissions</h2>
            <p id="session-consent-description" className="mt-2 text-xs leading-5 text-[#A2A2A8]">
              These choices apply for this login session. Select only the features you want to use. You can continue without granting access.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {consentOptions.map(({ key, title, description, Icon }) => (
            <label
              key={key}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors sm:p-4 ${choices[key] ? 'border-emerald-300/30 bg-emerald-300/[0.055]' : 'border-white/10 bg-white/[0.025] hover:border-white/20'}`}
            >
              <input
                type="checkbox"
                checked={choices[key]}
                onChange={(event) => setChoices((current) => ({ ...current, [key]: event.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-400"
              />
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${choices[key] ? 'text-emerald-300' : 'text-[#8E8E93]'}`} />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-white">{title}</span>
                <span className="mt-1 block text-[10px] leading-[1.6] text-[#8E8E93]">{description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDisagree}
            className="rounded-xl border border-white/15 px-4 py-2.5 font-mono text-[10px] tracking-wider text-[#B4B4B8] transition-colors hover:border-white/30 hover:bg-white/[0.05] hover:text-white"
          >
            DISAGREE · CONTINUE WITHOUT
          </button>
          <button
            type="button"
            onClick={() => onAgree(choices)}
            disabled={!hasSelectedConsent}
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.12] px-4 py-2.5 font-mono text-[10px] font-semibold tracking-wider text-emerald-100 transition-colors hover:border-emerald-200/50 hover:bg-emerald-300/[0.2] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            AGREE TO SELECTED
          </button>
        </div>
        <p className="mt-3 text-center font-mono text-[8px] leading-4 tracking-wide text-[#64646A]">
          Browser-level camera or microphone permission may still be requested when you start those features.
        </p>
      </section>
    </div>
  );
}
