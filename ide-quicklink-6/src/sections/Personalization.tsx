import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { audioController } from '../utils/audioSynth';

const voiceOptions = [
  { label: 'Lower pitch', pitch: 0.85 },
  { label: 'Default pitch', pitch: 1 },
  { label: 'Higher pitch', pitch: 1.2 },
];

const preferenceOptions = ['Everyday needs', 'Comfort', 'Family and social'];

export function Personalization() {
  const [voicePitch, setVoicePitch] = useState(1);
  const [preferences, setPreferences] = useState<string[]>(['Everyday needs']);

  const togglePreference = (preference: string) => {
    setPreferences((current) => current.includes(preference)
      ? current.filter((item) => item !== preference)
      : [...current, preference]);
  };

  return (
    <section id="personalization" className="py-32 relative overflow-hidden bg-[#0D0D0E]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <div className="max-w-3xl mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white font-display mb-4 text-balance">
            Communication is personal.
          </h2>
          <p className="text-base sm:text-lg text-[#8E8E93] font-normal leading-relaxed">
            Choose a spoken voice and the kinds of messages that matter to you.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 rounded-3xl igloo-glass border border-white/10 p-8 md:p-10">
            <span className="text-xs font-mono text-[#8E8E93] tracking-widest uppercase block mb-2">VOICE PREFERENCE</span>
            <h3 className="text-2xl font-bold text-white font-display mb-6">Choose a pitch</h3>
            <div className="space-y-3">
              {voiceOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => setVoicePitch(option.pitch)}
                  aria-pressed={voicePitch === option.pitch}
                  className={`w-full p-4 rounded-xl border text-left cursor-pointer ${voicePitch === option.pitch ? 'bg-white text-[#0D0D0E] border-white font-semibold' : 'bg-[#141416] border-white/10 text-[#D1D1D6]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => audioController.speakConfirmedMessage('This is a sample message.', { pitch: voicePitch })}
              className="mt-6 px-4 py-2.5 rounded-full igloo-glass text-white border border-white/20 text-sm flex items-center gap-2 cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
              Hear sample voice
            </button>
          </div>

          <div className="lg:col-span-7 rounded-3xl igloo-glass border border-white/10 p-8 md:p-10">
            <span className="text-xs font-mono text-[#8E8E93] tracking-widest uppercase block mb-2">COMMUNICATION PREFERENCES</span>
            <h3 className="text-2xl font-bold text-white font-display mb-6">What matters to you?</h3>
            <div className="space-y-3">
              {preferenceOptions.map((preference) => {
                const selected = preferences.includes(preference);
                return (
                  <button
                    key={preference}
                    onClick={() => togglePreference(preference)}
                    aria-pressed={selected}
                    className={`w-full p-4 rounded-xl border text-left cursor-pointer ${selected ? 'bg-white text-[#0D0D0E] border-white font-semibold' : 'bg-[#141416] border-white/10 text-[#D1D1D6]'}`}
                  >
                    {preference}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
