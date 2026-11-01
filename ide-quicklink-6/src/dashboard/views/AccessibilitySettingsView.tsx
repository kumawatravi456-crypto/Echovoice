import { useState } from 'react';
import { Eye, Type, Zap, Volume2, ShieldCheck, Check } from 'lucide-react';
import { AccessibilitySettings } from '../types';
import { defaultAccessibilitySettings } from '../mockData';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';

export function AccessibilitySettingsView() {
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultAccessibilitySettings);
  const [saveToast, setSaveToast] = useState(false);

  const toggle = (key: keyof Omit<AccessibilitySettings, 'fontSize'>) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
          Accessibility Settings
        </h1>
        <p className="text-sm sm:text-base text-[#D1D1D6] mt-2 leading-relaxed">
          Accessibility is the core foundation of Project Echo. Adjust typography scaling, motor assistance hit-targets, and contrast ratios.
        </p>
      </div>

      {saveToast && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4" />
          <span>Accessibility preferences updated.</span>
        </div>
      )}

      <GlassCard elevated className="p-8 sm:p-10 space-y-8">
        {/* Font Sizing */}
        <div>
          <label className="block text-xs font-mono text-[#D1D1D6] uppercase tracking-wider mb-3.5 flex items-center gap-2">
            <Type className="w-4 h-4 text-white" />
            <span>Interface Typography Scaling</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {[
              { id: 'normal', label: 'Standard (100%)', desc: 'Default UI scale' },
              { id: 'large', label: 'Large (120%)', desc: 'Enhanced clarity' },
              { id: 'extra-large', label: 'Extra Large (140%)', desc: 'Maximum legibility' },
            ].map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, fontSize: size.id as AccessibilitySettings['fontSize'] }))}
                className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                  settings.fontSize === size.id
                    ? 'bg-white text-[#0D0D0E] border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] font-bold'
                    : 'bg-[#141416]/80 border-white/10 text-white hover:border-white/30'
                }`}
              >
                <p className="font-bold text-sm sm:text-base">{size.label}</p>
                <p className="text-xs opacity-75 mt-1">{size.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="space-y-4 pt-4 border-t border-white/10">
          {/* High Contrast */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-black/50 border border-white/10">
            <div className="flex items-center gap-3.5">
              <Eye className="w-5 h-5 text-white/70" />
              <div>
                <p className="text-sm sm:text-base font-semibold text-white">High Contrast Monochromatic Mode</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">Increases border sharpness and text contrast ratios</p>
              </div>
            </div>
            <button
              onClick={() => toggle('highContrast')}
              className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${
                settings.highContrast ? 'bg-emerald-500 shadow-[0_0_10px_#34D399]' : 'bg-white/20'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform mt-1 ${
                  settings.highContrast ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Large Touch Targets */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-black/50 border border-white/10">
            <div className="flex items-center gap-3.5">
              <ShieldCheck className="w-5 h-5 text-white/70" />
              <div>
                <p className="text-sm sm:text-base font-semibold text-white">Large Touch Targets (Motor Assistance)</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">Expands clickable areas and button hit-targets for easier tapping</p>
              </div>
            </div>
            <button
              onClick={() => toggle('largeTouchTargets')}
              className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${
                settings.largeTouchTargets ? 'bg-emerald-500 shadow-[0_0_10px_#34D399]' : 'bg-white/20'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform mt-1 ${
                  settings.largeTouchTargets ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Reduced Motion */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-black/50 border border-white/10">
            <div className="flex items-center gap-3.5">
              <Zap className="w-5 h-5 text-white/70" />
              <div>
                <p className="text-sm sm:text-base font-semibold text-white">Reduced Motion & Smooth Transitions</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">Minimizes camera choreographies and decorative canvas shifts</p>
              </div>
            </div>
            <button
              onClick={() => toggle('reducedMotion')}
              className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${
                settings.reducedMotion ? 'bg-emerald-500 shadow-[0_0_10px_#34D399]' : 'bg-white/20'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform mt-1 ${
                  settings.reducedMotion ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Audio Feedback */}
          <div className="flex items-center justify-between p-5 rounded-2xl bg-black/50 border border-white/10">
            <div className="flex items-center gap-3.5">
              <Volume2 className="w-5 h-5 text-white/70" />
              <div>
                <p className="text-sm sm:text-base font-semibold text-white">Haptic Audio Affirmation Clicks</p>
                <p className="text-xs text-[#8E8E93] mt-0.5">Synthesizes soft frequency audio feedback when buttons are clicked</p>
              </div>
            </div>
            <button
              onClick={() => toggle('audioFeedback')}
              className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer ${
                settings.audioFeedback ? 'bg-emerald-500 shadow-[0_0_10px_#34D399]' : 'bg-white/20'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform mt-1 ${
                  settings.audioFeedback ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <MagneticButton
          onClick={handleSave}
          soundPitch={740}
          className="w-full py-4 rounded-2xl bg-white text-[#0D0D0E] font-bold text-sm hover:bg-[#F0F0F2] transition-all cursor-pointer shadow-[0_0_25px_rgba(255,255,255,0.35)]"
        >
          Save Accessibility Preferences
        </MagneticButton>
      </GlassCard>
    </div>
  );
}
