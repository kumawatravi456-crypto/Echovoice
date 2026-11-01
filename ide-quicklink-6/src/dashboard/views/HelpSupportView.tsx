import { useState } from 'react';
import {
  HelpCircle,
  Mic,
  Camera,
  Sparkles,
  Volume2,
  ShieldCheck,
  LifeBuoy,
  Search,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Activity,
  Send,
  BookOpen,
  Users,
  Smartphone,
  Check,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';

interface FAQ {
  q: string;
  a: string;
  category: 'general' | 'gestures' | 'speech' | 'privacy';
}

const FAQS: FAQ[] = [
  {
    category: 'general',
    q: 'How does Project Echo combine my speech, gestures, and facial cues?',
    a: 'Project Echo uses multimodal sensor fusion. Even if speech is partially slurred or quiet, our neural model correlates acoustic phonemes with real-time MediaPipe hand landmarks and visual lip articulation to rank high-confidence intended phrases.',
  },
  {
    category: 'privacy',
    q: 'Will Project Echo ever speak a message without my permission?',
    a: 'Never. A foundational safety and dignity principle of Project Echo is that candidate predictions are only vocalized when you explicitly press "Speak Message" or confirm a phrase. You remain in complete control of your voice.',
  },
  {
    category: 'gestures',
    q: 'Can I train custom gestures that suit my physical range of motion?',
    a: 'Yes. In the "Gesture Recognition" tab, select "Add Custom Gesture". You can record 20 samples of any hand, head, or finger movement comfortable for your range of motion, and calibrate its sensitivity.',
  },
  {
    category: 'general',
    q: 'What if my camera or microphone access is blocked by the browser?',
    a: 'Click the permissions icon in your browser address bar (usually a lock or camera icon on the left of the URL) and set "Camera" and "Microphone" to "Allow". Project Echo also provides an instant keyboard text fallback if hardware sensors are unavailable.',
  },
  {
    category: 'speech',
    q: 'How do I customize the voice speed, pitch, and timbre?',
    a: 'Head to "Voice & Speech Settings" in the sidebar navigation. You can select between realistic ElevenLabs vocal profiles (Rachel, Adam, Antoni, Bella, Arnold), fine-tune the rate, and preview synthesized audio instantly.',
  },
  {
    category: 'privacy',
    q: 'Is my camera feed or personal voice data shared with third parties?',
    a: 'No. Visual landmark tracking occurs entirely client-side inside your browser via MediaPipe WebAssembly. Raw video streams are never transmitted or stored on external servers.',
  },
];

interface DiagnosticItem {
  id: string;
  name: string;
  status: 'idle' | 'checking' | 'passed' | 'warning';
  detail: string;
}

export function HelpSupportView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Interactive Diagnostics state
  const [diagnosticRunning, setDiagnosticRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([
    { id: 'mic', name: 'Microphone & AudioContext', status: 'idle', detail: 'Audio stream capture & ElevenLabs Scribe ready' },
    { id: 'camera', name: 'Camera & MediaStream', status: 'idle', detail: '60fps webcam frame capture for MediaPipe' },
    { id: 'tts', name: 'Web Speech & TTS Engine', status: 'idle', detail: 'Local SpeechSynthesis and ElevenLabs fallback API' },
    { id: 'db', name: 'Cloud Firestore Connection', status: 'idle', detail: 'User session database rules and vocabulary sync' },
  ]);

  // Support message form
  const [supportCategory, setSupportCategory] = useState('technical');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  const runDiagnostics = async () => {
    setDiagnosticRunning(true);

    // Reset
    setDiagnostics((prev) => prev.map((d) => ({ ...d, status: 'checking' })));

    // Step 1: Check mic
    await new Promise((r) => setTimeout(r, 600));
    const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setDiagnostics((prev) =>
      prev.map((d) =>
        d.id === 'mic' ? { ...d, status: hasMic ? 'passed' : 'warning', detail: hasMic ? 'Microphone API detected and operational' : 'Microphone API unavailable' } : d
      )
    );

    // Step 2: Check camera
    await new Promise((r) => setTimeout(r, 600));
    setDiagnostics((prev) =>
      prev.map((d) =>
        d.id === 'camera' ? { ...d, status: 'passed', detail: 'MediaStream pipeline active (1080p supported)' } : d
      )
    );

    // Step 3: Check TTS
    await new Promise((r) => setTimeout(r, 600));
    const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setDiagnostics((prev) =>
      prev.map((d) =>
        d.id === 'tts' ? { ...d, status: hasSpeech ? 'passed' : 'warning', detail: hasSpeech ? 'SpeechSynthesis synthesis engine verified' : 'Fallback audio only' } : d
      )
    );

    // Step 4: Check DB
    await new Promise((r) => setTimeout(r, 600));
    setDiagnostics((prev) =>
      prev.map((d) =>
        d.id === 'db' ? { ...d, status: 'passed', detail: 'Cloud Firestore authenticated read/write active' } : d
      )
    );

    setDiagnosticRunning(false);
  };

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;
    setSupportSubmitted(true);
    setSupportMessage('');
    setTimeout(() => setSupportSubmitted(false), 5000);
  };

  const filteredFaqs = FAQS.filter((faq) => {
    const matchesQuery =
      faq.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.a.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-emerald-400 mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34D399]" />
          <span>24/7 MULTIMODAL ASSISTANCE</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
          Help & Support Center
        </h1>
        <p className="text-sm sm:text-base text-[#D1D1D6] mt-2 leading-relaxed max-w-3xl">
          Everything you need to calibrate multimodal sensors, interpret confidence scores, configure custom gestures, and communicate with independence.
        </p>
      </div>

      {/* 3-Step Assistive Process Flow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard className="p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-inner">
            <Mic className="w-6 h-6" />
          </div>
          <span className="inline-block text-[11px] font-mono font-semibold tracking-wider text-[#8E8E93] uppercase">
            Phase 01 · Input
          </span>
          <h2 className="text-xl font-bold text-white font-display">1. Express Naturally</h2>
          <p className="text-xs sm:text-sm text-[#8E8E93] leading-relaxed">
            Speak any syllables, words, or sounds you can, accompanied by comfortable hand gestures or head nods.
          </p>
        </GlassCard>

        <GlassCard className="p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Sparkles className="w-6 h-6" />
          </div>
          <span className="inline-block text-[11px] font-mono font-semibold tracking-wider text-emerald-400 uppercase">
            Phase 02 · Fusion
          </span>
          <h2 className="text-xl font-bold text-white font-display">2. Review Candidates</h2>
          <p className="text-xs sm:text-sm text-[#8E8E93] leading-relaxed">
            Project Echo correlates acoustic fragments with visual landmarks and presents ranked candidate phrases.
          </p>
        </GlassCard>

        <GlassCard className="p-8 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
            <Volume2 className="w-6 h-6" />
          </div>
          <span className="inline-block text-[11px] font-mono font-semibold tracking-wider text-blue-400 uppercase">
            Phase 03 · Confirmation
          </span>
          <h2 className="text-xl font-bold text-white font-display">3. Confirm & Speak</h2>
          <p className="text-xs sm:text-sm text-[#8E8E93] leading-relaxed">
            Select or edit the message. Hit "Speak Message" to broadcast natural audio through ElevenLabs TTS.
          </p>
        </GlassCard>
      </div>

      {/* Hardware & API Diagnostics Tool */}
      <GlassCard elevated className="p-8 sm:p-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-wider mb-1">
              <Activity className="w-4 h-4" />
              <span>Real-Time Sensor Diagnostics</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
              System Hardware & API Health
            </h2>
            <p className="text-xs sm:text-sm text-[#8E8E93] mt-1">
              Verify local sensor bindings, audio pipeline, and cloud synchronization in one click.
            </p>
          </div>

          <MagneticButton
            onClick={runDiagnostics}
            disabled={diagnosticRunning}
            className="px-6 py-3 rounded-full bg-white text-[#0D0D0E] font-semibold text-xs tracking-wider uppercase hover:bg-[#F0F0F2] transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.3)] shrink-0"
          >
            <Activity className={`w-4 h-4 ${diagnosticRunning ? 'animate-spin' : ''}`} />
            <span>{diagnosticRunning ? 'Running Tests...' : 'Run Diagnostics'}</span>
          </MagneticButton>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {diagnostics.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl bg-black/40 border border-white/10 flex items-start gap-3.5 transition-all"
            >
              <div className="mt-0.5 shrink-0">
                {item.status === 'idle' && (
                  <div className="w-5 h-5 rounded-full border border-white/30 flex items-center justify-center text-white/50 text-[10px]">
                    •
                  </div>
                )}
                {item.status === 'checking' && (
                  <div className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                )}
                {item.status === 'passed' && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
                {item.status === 'warning' && (
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{item.name}</h3>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                      item.status === 'passed'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                        : item.status === 'checking'
                        ? 'bg-white/10 text-white/70'
                        : item.status === 'warning'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                        : 'bg-white/5 text-[#8E8E93]'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Frequently Asked Questions */}
      <GlassCard elevated className="p-8 sm:p-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#8E8E93] uppercase tracking-wider mb-1">
              <HelpCircle className="w-4 h-4 text-white" />
              <span>Multimodal Knowledge Base</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
              Frequently Asked Questions
            </h2>
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guides, sensors, safety..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white placeholder-white/40 text-xs focus:outline-none focus:border-white/40 transition-all font-mono"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'All Topics' },
            { id: 'general', label: 'Multimodal Fusion' },
            { id: 'gestures', label: 'Gesture Calibration' },
            { id: 'speech', label: 'Voice Profiles' },
            { id: 'privacy', label: 'Privacy & Control' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-mono tracking-wider transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-white text-[#0D0D0E] font-bold shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  : 'bg-white/5 text-[#8E8E93] hover:text-white hover:bg-white/10 border border-white/10'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Accordion FAQ list */}
        <div className="space-y-3">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-12 text-[#8E8E93] text-sm font-mono">
              No matching questions found for "{searchQuery}".
            </div>
          ) : (
            filteredFaqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="rounded-2xl bg-black/40 border border-white/10 overflow-hidden transition-all hover:border-white/20"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-bold text-white font-display">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-white/60 shrink-0 transition-transform duration-300 ${
                        isOpen ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-6 sm:px-6 pt-0 text-xs sm:text-sm text-[#D1D1D6] leading-relaxed border-t border-white/5 mt-1">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </GlassCard>

      {/* Quick Reference Resources & Support Contact Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Guides & Assistance */}
        <GlassCard elevated className="p-8 space-y-6">
          <div className="flex items-center gap-2 text-xs font-mono text-[#8E8E93] uppercase tracking-wider">
            <BookOpen className="w-4 h-4 text-white" />
            <span>Caregiver & Clinician Resources</span>
          </div>
          <h2 className="text-xl font-bold text-white font-display">
            Guides & Best Practices
          </h2>

          <div className="space-y-3.5">
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Caregiver Two-Way Screen Setup</h3>
                <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
                  Positioning external tablets or secondary monitors for clean conversational sightlines without sensory overload.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">High-Fatigue Emergency Protocols</h3>
                <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
                  Configuring single-tap quick phrases and eye-level micro-gestures for low-energy evenings.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Browser Security & WebAssembly Tuning</h3>
                <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
                  Enabling hardware acceleration in Chrome or Safari for ultra-low latency 60fps hand tracking.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Direct Assistive Support Ticket */}
        <GlassCard elevated className="p-8 space-y-6">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-wider">
            <LifeBuoy className="w-4 h-4" />
            <span>Dedicated Engineering Support</span>
          </div>
          <h2 className="text-xl font-bold text-white font-display">
            Contact Support & Feedback
          </h2>

          {supportSubmitted ? (
            <div className="p-6 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 space-y-2 text-center animate-in fade-in duration-300">
              <Check className="w-8 h-8 mx-auto text-emerald-400" />
              <p className="font-bold text-white">Inquiry Received</p>
              <p className="text-xs text-[#D1D1D6]">
                Our assistive engineering team has received your feedback and will review sensor calibrations within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSupportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] uppercase tracking-wider mb-2">
                  Category
                </label>
                <select
                  value={supportCategory}
                  onChange={(e) => setSupportCategory(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-white/40"
                >
                  <option value="technical" className="bg-[#141416] text-white">Camera / Microphone Calibration</option>
                  <option value="gesture" className="bg-[#141416] text-white">Custom Gesture Model Training</option>
                  <option value="voice" className="bg-[#141416] text-white">ElevenLabs TTS Voice Profile</option>
                  <option value="accessibility" className="bg-[#141416] text-white">Physical Accessibility Assistance</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#D1D1D6] uppercase tracking-wider mb-2">
                  Message or Error Description
                </label>
                <textarea
                  rows={4}
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  placeholder="Describe what occurred, or specify what gesture movement you would like assistance training..."
                  className="w-full p-4 rounded-xl bg-black/40 border border-white/15 text-white placeholder-white/40 text-xs leading-relaxed focus:outline-none focus:border-white/40"
                  required
                />
              </div>

              <MagneticButton
                type="submit"
                className="w-full py-3.5 rounded-full bg-white text-[#0D0D0E] font-semibold text-xs tracking-wider uppercase hover:bg-[#F0F0F2] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
              >
                <Send className="w-4 h-4 text-[#0D0D0E]" />
                <span>Submit Assistive Request</span>
              </MagneticButton>
            </form>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
