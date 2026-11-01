import { useState, useRef } from 'react';
import {
  Sparkles,
  MessageSquare,
  Hand,
  Volume2,
  Mic,
  Camera,
  CheckCircle2,
  ArrowRight,
  Clock,
  ShieldCheck,
  TrendingUp,
  Zap,
  HeartHandshake,
  Edit3,
  MessageSquareQuote,
  RotateCcw,
} from 'lucide-react';
import { DashboardTab } from '../types';
import { initialGestures, initialConversations } from '../mockData';
import { MagneticButton } from '../../components/MagneticButton';
import { GlassCard } from '../components/GlassCard';
import { audioController } from '../../utils/audioSynth';

interface OverviewViewProps {
  userName: string;
  onNavigateTab: (tab: DashboardTab) => void;
  onSelectConversation: (id: string) => void;
}

const exampleDemoMessages = [
  'I need water.',
  'Please help me.',
  'I am feeling uncomfortable.',
  'I want to talk to my family.',
  'Could you adjust my pillow?',
  'I am ready to rest now.',
];

export function OverviewView({ userName, onNavigateTab, onSelectConversation }: OverviewViewProps) {
  const [gestures] = useState(initialGestures);
  const [recentConversations] = useState(initialConversations);

  // Interactive Demo state from frontend
  const [selectedDemoMessage, setSelectedDemoMessage] = useState(exampleDemoMessages[0]);
  const [editedDemoMessage, setEditedDemoMessage] = useState(exampleDemoMessages[0]);
  const [isEditingDemo, setIsEditingDemo] = useState(false);
  const [confirmedDemoMessages, setConfirmedDemoMessages] = useState<{ text: string; time: string }[]>([
    { text: 'I need water.', time: 'Just now' },
  ]);

  const demoStudioRef = useRef<HTMLDivElement>(null);

  const selectDemoMessage = (message: string) => {
    setSelectedDemoMessage(message);
    setEditedDemoMessage(message);
    setIsEditingDemo(false);
    audioController.playClick(600, 0.04);
  };

  const handleConfirmAndSpeak = () => {
    const message = editedDemoMessage.trim();
    if (!message) return;
    audioController.speakConfirmedMessage(message);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setConfirmedDemoMessages((current) => [{ text: message, time: timeStr }, ...current]);
  };

  const scrollToDemo = () => {
    if (demoStudioRef.current) {
      demoStudioRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-12 max-w-7xl mx-auto">
      {/* =========================================================================
          1. CINEMATIC WELCOME HERO SECTION (Direct match to reference image 06763ca9)
         ========================================================================= */}
      <div className="relative rounded-3xl igloo-glass-elevated border border-white/20 p-8 sm:p-12 overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/15 text-xs font-mono text-emerald-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34D399]" />
            <span>MULTIMODAL SENSORS CONNECTED</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white font-display leading-[1.05] text-balance">
            Your voice. Your expression.{' '}
            <span className="text-gradient-white block sm:inline">Your conversation.</span>
          </h1>

          <p className="text-base sm:text-lg text-[#D1D1D6] mt-4 leading-relaxed font-normal max-w-2xl">
            Beyond Words, Beyond Barriers — Giving Every Voice a Way to Speak. Welcome back,{' '}
            <span className="text-white font-semibold">{userName}</span>. Your workspace is calibrated.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-8">
            <MagneticButton
              onClick={() => onNavigateTab('live-conversation')}
              soundPitch={740}
              className="px-8 py-4 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm hover:bg-[#F0F0F2] transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(255,255,255,0.4)] hover:shadow-[0_0_40px_rgba(255,255,255,0.6)] cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-[#0D0D0E]" />
              <span>Start a Conversation</span>
              <ArrowRight className="w-4 h-4 text-[#0D0D0E]" />
            </MagneticButton>

            <MagneticButton
              onClick={scrollToDemo}
              soundPitch={620}
              className="px-7 py-4 rounded-full igloo-glass text-white font-medium text-sm hover:border-white/50 transition-all flex items-center gap-2.5 cursor-pointer shadow-lg"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Try example messages</span>
            </MagneticButton>

            <MagneticButton
              onClick={() => onNavigateTab('gestures')}
              soundPitch={540}
              className="px-7 py-4 rounded-full bg-white/5 border border-white/10 text-white font-medium text-sm hover:border-white/30 transition-all flex items-center gap-2.5 cursor-pointer"
            >
              <Hand className="w-4 h-4 text-white" />
              <span>Configure My Gestures</span>
            </MagneticButton>
          </div>
        </div>

        {/* Ambient atmospheric glows */}
        <div className="absolute -right-16 -bottom-16 w-96 h-96 rounded-full bg-white/[0.05] blur-3xl pointer-events-none" />
        <div className="absolute right-1/4 top-0 w-64 h-64 rounded-full bg-white/[0.03] blur-2xl pointer-events-none" />
      </div>

      {/* =========================================================================
          2. COMMUNICATION SHOULD NEVER BE A BARRIER (Direct match to reference image 26bc5eb9)
         ========================================================================= */}
      <div className="space-y-6">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight font-display text-balance">
            Communication should never be a barrier.
          </h2>
          <p className="text-sm sm:text-base text-[#D1D1D6] leading-relaxed font-normal mt-3">
            For people with ALS, cerebral palsy, Parkinson's, stroke, or laryngectomy, speaking can be exhausting.
            Communication is more than slow, letter-by-letter tools.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Column: Storytelling Asset Card */}
          <div className="lg:col-span-5 rounded-3xl overflow-hidden igloo-glass border border-white/15 relative min-h-[440px] flex flex-col justify-end p-8 md:p-10 group shadow-2xl">
            <img
              src="/src/assets/images/echo_human_connection_1793438132375.jpg"
              alt="Two individuals engaged in authentic, expressive conversation"
              className="absolute inset-0 w-full h-full object-cover grayscale contrast-110 transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0E] via-[#0D0D0E]/60 to-transparent" />

            <div className="relative z-10 space-y-2">
              <span className="text-xs font-mono text-white tracking-widest uppercase block">
                AUTHENTIC CONNECTION
              </span>
              <h3 className="text-2xl font-bold text-white font-display">
                Supporting natural expression
              </h3>
              <p className="text-xs text-[#D1D1D6] leading-relaxed">
                Project Echo explores ways to help people express complete thoughts while keeping every message under their control.
              </p>

              <div className="pt-2">
                <MagneticButton
                  onClick={() => onNavigateTab('live-conversation')}
                  className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white text-white hover:text-[#0D0D0E] text-xs font-semibold tracking-wider uppercase border border-white/30 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <span>Open Live Two-Way Mode</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </MagneticButton>
              </div>
            </div>
          </div>

          {/* Right Column: Comparative Analysis & Concept Card */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl igloo-glass-elevated border border-white/15 p-8 md:p-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between flex-wrap gap-4 mb-8 pb-4 border-b border-white/10">
                <h3 className="text-xl sm:text-2xl font-bold text-white font-display">
                  A communication concept
                </h3>
                <span className="text-xs font-mono text-[#8E8E93] uppercase tracking-wider">
                  DESIGN PILLARS
                </span>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-white/10 border border-white/30 shadow-[0_0_25px_rgba(255,255,255,0.08)] transition-all hover:border-white/50">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/15 text-white shrink-0">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-white mb-1">
                        Express a complete thought
                      </h4>
                      <p className="text-sm text-[#D1D1D6] leading-relaxed">
                        Choose a sample message, edit the wording, and decide whether to speak it aloud.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white/[0.05] border border-white/15 transition-all hover:border-white/30">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/10 text-white shrink-0">
                      <HeartHandshake className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-white mb-1">
                        The user stays in control
                      </h4>
                      <p className="text-sm text-[#D1D1D6] leading-relaxed">
                        Nothing is spoken until the user confirms the message.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 transition-all hover:border-white/25">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/10 text-emerald-400 shrink-0">
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-white mb-1">
                        Multimodal Sensor Coordination
                      </h4>
                      <p className="text-sm text-[#8E8E93] leading-relaxed">
                        Combines acoustic syllable fragments, 21-point hand landmark recognition, and lip articulation into high-confidence suggestions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-white/10 flex items-center justify-between text-xs text-[#8E8E93]">
              <span>ElevenLabs Scribe & MediaPipe Pipeline</span>
              <span className="text-emerald-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                ACTIVE IN BROWSER
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. INTERACTIVE DEMO FROM FRONTEND (Direct match to user request & InteractiveDemo.tsx)
         ========================================================================= */}
      <div ref={demoStudioRef} className="space-y-6 pt-4">
        <div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white font-display">
            Try an example message.
          </h2>
          <p className="text-xs sm:text-sm text-black font-bold mt-3 inline-block bg-white border border-white/30 px-5 py-3 rounded-2xl shadow-xl">
            These sample phrases are not generated from live sensors. Choose one, edit it, and confirm to hear it spoken aloud.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Example Messages List */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center justify-between">
              <span>Example messages</span>
              <span className="text-xs font-mono text-[#8E8E93]">{exampleDemoMessages.length} phrases</span>
            </h3>

            {exampleDemoMessages.map((message) => {
              const isSelected = selectedDemoMessage === message;
              return (
                <button
                  key={message}
                  onClick={() => selectDemoMessage(message)}
                  aria-pressed={isSelected}
                  className={`w-full p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white/15 border-white text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] font-semibold'
                      : 'bg-[#141416]/80 border-white/10 text-[#D1D1D6] hover:border-white/30 hover:bg-[#18181c]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{message}</span>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Review & Speak Card */}
          <div className="lg:col-span-7 rounded-3xl igloo-glass-elevated border border-white/20 p-6 md:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white font-display">Review your message</h3>
              <span className="text-xs font-mono text-emerald-400">READY TO SPEAK</span>
            </div>

            {isEditingDemo ? (
              <textarea
                value={editedDemoMessage}
                onChange={(event) => setEditedDemoMessage(event.target.value)}
                rows={3}
                aria-label="Edit your message"
                className="w-full p-4 rounded-xl bg-[#0D0D0E] border border-white/30 text-white text-base focus:outline-none focus:border-white font-sans transition-all"
                autoFocus
              />
            ) : (
              <p className="min-h-24 p-5 rounded-xl bg-[#0D0D0E]/80 border border-white/15 text-white text-lg leading-relaxed flex items-center">
                "{editedDemoMessage}"
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <MagneticButton
                onClick={() => setIsEditingDemo((current) => !current)}
                className="px-5 py-3 rounded-full igloo-glass border border-white/20 text-white text-sm flex items-center gap-2 cursor-pointer hover:border-white/40"
              >
                <Edit3 className="w-4 h-4" />
                <span>{isEditingDemo ? 'Done editing' : 'Edit message'}</span>
              </MagneticButton>

              <MagneticButton
                onClick={handleConfirmAndSpeak}
                disabled={!editedDemoMessage.trim()}
                soundPitch={800}
                className="px-6 py-3 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm flex items-center gap-2.5 cursor-pointer disabled:opacity-50 hover:bg-[#F0F0F2] shadow-[0_0_25px_rgba(255,255,255,0.4)]"
              >
                <Volume2 className="w-4 h-4 text-[#0D0D0E]" />
                <span>Confirm and speak</span>
              </MagneticButton>
            </div>

            <p className="text-xs text-[#8E8E93] pt-2 border-t border-white/10 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>The example is spoken aloud only after you confirm.</span>
            </p>
          </div>

          {/* Messages Confirmed Feed */}
          {confirmedDemoMessages.length > 0 && (
            <div className="lg:col-span-12 rounded-3xl igloo-glass border border-white/15 p-6 md:p-8 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wider font-mono">
                <MessageSquareQuote className="w-4 h-4 text-white" />
                <span>Messages you confirmed in this session</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {confirmedDemoMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">"{msg.text}"</p>
                      <p className="text-[10px] font-mono text-[#8E8E93] mt-0.5">{msg.time}</p>
                    </div>
                    <button
                      onClick={() => audioController.speakConfirmedMessage(msg.text)}
                      className="p-2 rounded-xl bg-white/10 hover:bg-white text-white hover:text-black transition-all cursor-pointer shrink-0"
                      title="Replay audio"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          4. SENSOR READINESS & HARDWARE STATUS CARDS
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            icon: Mic,
            title: 'Microphone Stream',
            desc: 'ElevenLabs Scribe Online',
            status: 'Ready',
          },
          {
            icon: Camera,
            title: 'MediaPipe Camera',
            desc: '21 Hand Landmarks Active',
            status: 'Ready',
          },
          {
            icon: Sparkles,
            title: 'Multimodal AI Context',
            desc: 'Multimodal Fusion Model',
            status: 'Ready',
          },
          {
            icon: Volume2,
            title: 'Voice Synthesizer',
            desc: 'ElevenLabs TTS Ready',
            status: 'Ready',
          },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <GlassCard
              key={idx}
              interactive
              className="p-6 flex items-center gap-4 hover:border-white/40 transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:scale-105 transition-transform igloo-glow-silver">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-[#8E8E93] uppercase tracking-wider">{item.title}</p>
                <p className="text-sm font-semibold text-white truncate mt-0.5">{item.desc}</p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-emerald-400">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{item.status}</span>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* =========================================================================
          5. CORE STATS & RECENT SESSIONS STRIP
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Recent Conversations */}
        <div className="lg:col-span-7 space-y-8">
          <GlassCard elevated className="p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div>
                <h2 className="text-xl font-bold text-white font-display">Recent Conversations</h2>
                <p className="text-xs text-[#8E8E93] mt-0.5">Searchable transcripts with verified speech logs</p>
              </div>
              <button
                onClick={() => onNavigateTab('history')}
                className="text-xs text-[#D1D1D6] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer group"
              >
                <span>View all</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {recentConversations.slice(0, 3).map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onNavigateTab('history');
                  }}
                  className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/35 hover:bg-white/[0.06] transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors truncate">
                        {conv.title}
                      </p>
                      <p className="text-xs text-[#8E8E93] line-clamp-1 mt-1 leading-relaxed">
                        {conv.preview}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#8E8E93] shrink-0 pt-0.5">
                      <Clock className="w-3.5 h-3.5 text-white/50" />
                      <span>{conv.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Activity Metrics Strip */}
          <div className="grid grid-cols-3 gap-4">
            <GlassCard className="p-6">
              <div className="flex items-center gap-2 text-xs font-mono text-[#8E8E93]">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>CONFIRMED</span>
              </div>
              <p className="text-3xl font-bold text-white font-display mt-2 tracking-tight">128</p>
              <p className="text-[11px] text-[#A1A1AA] mt-1">+14% this week</p>
            </GlassCard>

            <GlassCard className="p-6">
              <div className="flex items-center gap-2 text-xs font-mono text-[#8E8E93]">
                <Hand className="w-3.5 h-3.5 text-blue-400" />
                <span>GESTURES</span>
              </div>
              <p className="text-3xl font-bold text-white font-display mt-2 tracking-tight">{gestures.length}</p>
              <p className="text-[11px] text-[#A1A1AA] mt-1">All 5 active</p>
            </GlassCard>

            <GlassCard className="p-6">
              <div className="flex items-center gap-2 text-xs font-mono text-[#8E8E93]">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>ACCURACY</span>
              </div>
              <p className="text-3xl font-bold text-white font-display mt-2 tracking-tight">95.4%</p>
              <p className="text-[11px] text-[#A1A1AA] mt-1">Self-confirmed</p>
            </GlassCard>
          </div>
        </div>

        {/* Right: Personal Gesture Overview */}
        <div className="lg:col-span-5 space-y-6">
          <GlassCard elevated className="p-8">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div>
                <h2 className="text-xl font-bold text-white font-display">Personalised Gestures</h2>
                <p className="text-xs text-[#8E8E93] mt-0.5">MediaPipe custom training</p>
              </div>
              <button
                onClick={() => onNavigateTab('gestures')}
                className="text-xs text-[#D1D1D6] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer group"
              >
                <span>Manage</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="space-y-3">
              {gestures.map((gesture) => (
                <div
                  key={gesture.id}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/25 transition-all"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl p-2 rounded-xl bg-white/5 border border-white/10">
                      {gesture.handIcon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{gesture.name.split(' (')[0]}</p>
                      <p className="text-xs text-[#8E8E93] truncate mt-0.5">"{gesture.mappedMessage}"</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs font-mono text-emerald-400 font-semibold">
                      {Math.round(gesture.confidence * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => onNavigateTab('gestures')}
              className="w-full mt-6 py-3.5 rounded-2xl border border-white/20 hover:border-white/40 text-xs font-semibold text-white tracking-wider uppercase transition-all cursor-pointer hover:bg-white/[0.04]"
            >
              + Train New Custom Gesture
            </button>
          </GlassCard>

          {/* User Confirmation Standard Notice */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs text-[#8E8E93] leading-relaxed">
            <p className="text-white font-semibold mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>User Confirmation First</span>
            </p>
            <p>
              Project Echo never speaks aloud automatically. Every prediction requires your explicit click or tap before speech synthesis runs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
