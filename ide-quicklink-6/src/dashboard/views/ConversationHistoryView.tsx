import { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  Clock,
  Trash2,
  Eye,
  MessageSquare,
  Volume2,
  X,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { ConversationSession } from '../types';
import { initialConversations } from '../mockData';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';

interface ConversationHistoryViewProps {
  initialSelectedId?: string;
}

export function ConversationHistoryView({ initialSelectedId }: ConversationHistoryViewProps) {
  const [conversations, setConversations] = useState<ConversationSession[]>(initialConversations);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<ConversationSession | null>(() => {
    if (initialSelectedId) {
      return initialConversations.find((c) => c.id === initialSelectedId) || null;
    }
    return null;
  });

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q) ||
        c.messages.some((m) => m.interpretedMessage.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedSession?.id === id) {
      setSelectedSession(null);
    }
  };

  const handleClearAllHistory = () => {
    if (window.confirm('Are you sure you want to delete all stored conversation history? This cannot be undone.')) {
      setConversations([]);
      setSelectedSession(null);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
            Conversation History
          </h1>
          <p className="text-sm sm:text-base text-[#D1D1D6] mt-2">
            Searchable transcripts of your confirmed multimodal conversations and spoken exchanges.
          </p>
        </div>

        {conversations.length > 0 && (
          <MagneticButton
            onClick={handleClearAllHistory}
            soundPitch={440}
            className="px-4 py-2.5 rounded-2xl border border-red-500/30 text-red-300 hover:bg-red-500/15 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </MagneticButton>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by topic, keyword, or spoken message..."
          className="w-full rounded-2xl bg-[#141416]/80 border border-white/15 pl-11 pr-4 py-3.5 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/40 shadow-inner"
        />
      </div>

      {/* Sessions Grid */}
      {filteredSessions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSessions.map((session) => (
            <GlassCard
              key={session.id}
              interactive
              elevated
              onClick={() => setSelectedSession(session)}
              className="p-7 flex flex-col justify-between gap-6 group"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-[#8E8E93] mb-3">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-white/60" />
                    <span>{session.date}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-white/60" />
                    <span>{session.duration}</span>
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white group-hover:text-emerald-300 transition-colors font-display tracking-tight leading-snug">
                  {session.title}
                </h2>
                <p className="text-xs text-[#8E8E93] mt-2.5 line-clamp-3 leading-relaxed">
                  {session.preview}
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
                <span className="text-[#8E8E93]">
                  {session.messages.length} messages logged
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="p-2 rounded-xl text-[#8E8E93] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-white font-medium flex items-center gap-1 group-hover:underline">
                    <span>Inspect</span>
                    <Eye className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <div className="p-16 text-center rounded-3xl igloo-glass border border-white/10">
          <MessageSquare className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-white font-semibold text-base">No conversation history found</p>
          <p className="text-xs text-[#8E8E93] mt-1">
            {searchQuery ? 'Try clearing your search query.' : 'Spoken conversations will be logged here.'}
          </p>
        </div>
      )}

      {/* Session Details Drawer / Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl igloo-glass-elevated border border-white/25 p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <span className="text-[11px] font-mono text-[#8E8E93] uppercase tracking-wider">Conversation Transcript</span>
                <h2 className="text-2xl font-bold text-white font-display mt-0.5">{selectedSession.title}</h2>
                <p className="text-xs text-[#8E8E93] mt-1 font-mono">
                  {selectedSession.date} • Duration: {selectedSession.duration}
                </p>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="p-2 rounded-xl text-[#8E8E93] hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Stream */}
            <div className="py-6 space-y-4">
              {selectedSession.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] font-mono text-[#8E8E93] uppercase tracking-wider">
                      {msg.sender === 'unknown' ? 'Unknown speaker' : isUser ? 'User (You)' : 'Partner'} • {msg.timestamp}
                    </span>
                    <div
                      className={`p-5 rounded-2xl max-w-lg text-sm leading-relaxed ${
                        isUser
                          ? 'bg-white text-[#0D0D0E] font-medium shadow-md'
                          : 'bg-white/10 border border-white/15 text-white'
                      }`}
                    >
                      <p className="text-base">{msg.interpretedMessage}</p>

                      {msg.originalTranscript && (
                        <p className="text-[11px] font-mono text-black/60 mt-2.5 pt-2 border-t border-black/10">
                          Raw Acoustic: "{msg.originalTranscript}"
                        </p>
                      )}

                      {msg.signalsUsed && msg.signalsUsed.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {msg.signalsUsed.map((sig, i) => (
                            <span
                              key={i}
                              className="px-2.5 py-0.5 rounded-full bg-black/10 text-[10px] font-mono text-black/80 font-semibold"
                            >
                              ✓ {sig}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Privacy note */}
            <div className="pt-5 border-t border-white/10 flex items-center justify-between text-xs text-[#8E8E93]">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Protected with local privacy encryption</span>
              </span>
              <button
                onClick={() => setSelectedSession(null)}
                className="px-5 py-2.5 rounded-xl bg-white text-[#0D0D0E] font-semibold text-xs cursor-pointer hover:bg-[#F0F0F2] transition-colors"
              >
                Close Transcript
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
