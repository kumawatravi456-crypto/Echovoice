import { useState, useEffect } from 'react';
import { Volume2, Play, Sliders, Globe, Shield, Check } from 'lucide-react';
import { VoiceSettings } from '../types';
import { defaultVoiceSettings } from '../mockData';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';

interface VoiceSettingsViewProps {
  voiceCloningConsent: boolean;
  onRequestConsent: () => void;
}

export function VoiceSettingsView({ voiceCloningConsent, onRequestConsent }: VoiceSettingsViewProps) {
  const [settings, setSettings] = useState<VoiceSettings>(defaultVoiceSettings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [testSampleText, setTestSampleText] = useState('Hello, this is your calibrated Project Echo voice.');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        if (voices.length > 0 && !settings.voiceURI) {
          setSettings((prev) => ({ ...prev, voiceURI: voices[0].voiceURI }));
        }
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const handleTestVoice = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlayingTest(true);
      const utterance = new SpeechSynthesisUtterance(testSampleText);
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;

      const chosenVoice = availableVoices.find((v) => v.voiceURI === settings.voiceURI);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      utterance.onend = () => setIsPlayingTest(false);
      utterance.onerror = () => setIsPlayingTest(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
          Voice & Speech Settings
        </h1>
        <p className="text-sm sm:text-base text-[#D1D1D6] mt-2 leading-relaxed">
          Customise your text-to-speech output voice, cadence, pitch, and language options for confirmed speech broadcasts.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4" />
          <span>Voice configuration saved successfully.</span>
        </div>
      )}

      <GlassCard elevated className="p-8 sm:p-10 space-y-8">
        {/* Language Selection */}
        <div>
          <label className="block text-xs font-mono text-[#D1D1D6] uppercase tracking-wider mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-white" />
            <span>Spoken Language & Accent</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {[
              { id: 'en-US', label: 'English (US / Global)' },
              { id: 'en-IN', label: 'English (Indian Accent)' },
              { id: 'hi-IN', label: 'Hindi (हिन्दी)' },
            ].map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, language: lang.id as VoiceSettings['language'] }))}
                className={`p-4 rounded-2xl border text-sm font-semibold text-left transition-all cursor-pointer ${
                  settings.language === lang.id
                    ? 'bg-white text-[#0D0D0E] border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] font-bold'
                    : 'bg-[#141416]/80 border-white/10 text-white hover:border-white/30'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice Selection */}
        <div>
          <label className="block text-xs font-mono text-[#D1D1D6] uppercase tracking-wider mb-2.5">
            Text-to-Speech Output Voice
          </label>
          <select
            value={settings.voiceURI}
            onChange={(e) => setSettings((s) => ({ ...s, voiceURI: e.target.value }))}
            className="w-full rounded-2xl bg-[#0D0D0E] border border-white/20 p-4 text-sm text-white focus:outline-none focus:border-white shadow-inner"
          >
            {availableVoices.length > 0 ? (
              availableVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) {v.default ? '— Default' : ''}
                </option>
              ))
            ) : (
              <option value="">Default System Natural Voice (ElevenLabs compatible)</option>
            )}
          </select>
        </div>

        {/* Sliders: Rate & Pitch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-[#D1D1D6]">
              <span className="uppercase tracking-wider">Speech Speed: {settings.rate}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={settings.rate}
              onChange={(e) => setSettings((s) => ({ ...s, rate: parseFloat(e.target.value) }))}
              className="w-full accent-white cursor-pointer h-2 bg-white/10 rounded-lg appearance-none"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#8E8E93]">
              <span>Slower (0.5x)</span>
              <span>Default (1.0x)</span>
              <span>Faster (1.5x)</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-[#D1D1D6]">
              <span className="uppercase tracking-wider">Pitch Level: {settings.pitch}x</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.4"
              step="0.05"
              value={settings.pitch}
              onChange={(e) => setSettings((s) => ({ ...s, pitch: parseFloat(e.target.value) }))}
              className="w-full accent-white cursor-pointer h-2 bg-white/10 rounded-lg appearance-none"
            />
            <div className="flex justify-between text-[10px] font-mono text-[#8E8E93]">
              <span>Deeper (0.6x)</span>
              <span>Standard (1.0x)</span>
              <span>Higher (1.4x)</span>
            </div>
          </div>
        </div>

        {/* Voice Preview Tester */}
        <div className="p-6 rounded-2xl bg-black/50 border border-white/10 space-y-3.5">
          <label className="block text-xs font-mono text-[#8E8E93] uppercase tracking-wider">Test Voice Phrase</label>
          <div className="flex gap-2.5">
            <input
              type="text"
              value={testSampleText}
              onChange={(e) => setTestSampleText(e.target.value)}
              className="flex-1 rounded-xl bg-[#0D0D0E] border border-white/15 px-4 py-3 text-sm text-white focus:outline-none focus:border-white"
            />
            <MagneticButton
              onClick={handleTestVoice}
              disabled={isPlayingTest}
              soundPitch={880}
              className="px-6 py-3 rounded-xl bg-white text-[#0D0D0E] font-semibold text-xs flex items-center gap-2 hover:bg-[#F0F0F2] cursor-pointer disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)] active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current text-[#0D0D0E]" />
              <span>{isPlayingTest ? 'Speaking...' : 'Test Voice'}</span>
            </MagneticButton>
          </div>
        </div>

        {/* Voice Cloning Notice */}
        <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] text-xs text-[#8E8E93] leading-relaxed flex items-start gap-3">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p>
            <strong className="text-white">Custom Voice Cloning:</strong>{' '}
            {voiceCloningConsent
              ? 'You gave voice-cloning consent for this session. Cloning is not connected in this prototype, and no voice sample is recorded or uploaded.'
              : 'Voice cloning is not enabled for this session. It is not connected in this prototype, and no voice sample is recorded or uploaded.'}
            <button
              type="button"
              onClick={onRequestConsent}
              className="ml-2 font-semibold text-emerald-300 underline decoration-emerald-300/40 underline-offset-2 hover:text-emerald-200"
            >
              Review session consent
            </button>
          </p>
        </div>

        <MagneticButton
          onClick={handleSave}
          soundPitch={740}
          className="w-full py-4 rounded-2xl bg-white text-[#0D0D0E] font-bold text-sm hover:bg-[#F0F0F2] transition-all cursor-pointer shadow-[0_0_25px_rgba(255,255,255,0.35)]"
        >
          Save Voice Settings
        </MagneticButton>
      </GlassCard>
    </div>
  );
}
