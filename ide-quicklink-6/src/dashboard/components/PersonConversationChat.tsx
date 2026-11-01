import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronDown, Mic, MicOff, Send, Volume2, X } from 'lucide-react';
import type { ConversationMessage } from '../types';
import { WaveformVisualizer } from './WaveformVisualizer';

type Speaker = 'user' | 'partner';

interface PopupPosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PersonConversationChatProps {
  messages: ConversationMessage[];
  position: PopupPosition;
  isListening: boolean;
  interimTranscript: string;
  voiceError: string | null;
  onToggleListening: () => void;
  onClose: () => void;
  onSpeakText: (text: string, speaker: Speaker) => void;
}

export function PersonConversationChat({
  messages,
  position,
  isListening,
  interimTranscript,
  voiceError,
  onToggleListening,
  onClose,
  onSpeakText,
}: PersonConversationChatProps) {
  const [speaker, setSpeaker] = useState<Speaker>('user');
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isListening]);

  const sendText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSpeakText(text, speaker);
    setDraft('');
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const orderedMessages = [...messages].reverse();

  return (
    <section
      className="person-chat-popup fixed z-[80] flex flex-col overflow-hidden rounded-[26px] border border-white/20 text-[#F0F0F2]"
      role="dialog"
      aria-modal="false"
      aria-label="Person-to-person voice chat"
      onClick={(event) => event.stopPropagation()}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      }}
    >
      <header className="flex items-center justify-between border-b border-white/10 bg-black/25 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-300">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-mono text-[11px] font-semibold tracking-[0.14em] text-white">LIVE CONVERSATION</h2>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[8px] tracking-[0.1em] text-[#8E8E93]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              PERSON TO PERSON · VOICE SUPPORTED
            </p>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#8E8E93] transition-colors hover:bg-white/[0.08] hover:text-white" aria-label="Minimize conversation chat" title="Minimize">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#8E8E93] transition-colors hover:bg-red-400/10 hover:text-red-200" aria-label="Close conversation chat" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5">
        <span className="font-mono text-[9px] tracking-[0.12em] text-[#8E8E93]">SPEAKING AS</span>
        <div className="flex rounded-xl border border-white/10 bg-black/30 p-1">
          {(['user', 'partner'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSpeaker(value)}
              aria-pressed={speaker === value}
              className={`rounded-lg px-3 py-1.5 font-mono text-[9px] tracking-wider transition-colors ${speaker === value ? 'bg-emerald-300/15 text-emerald-200' : 'text-[#8E8E93] hover:text-white'}`}
            >
              {value === 'user' ? 'YOU' : 'PARTNER'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {orderedMessages.length === 0 ? (
          <div className="my-auto flex flex-col items-center px-4 py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#8E8E93]">
              <Volume2 className="h-5 w-5" />
            </div>
            <p className="font-mono text-[9px] tracking-[0.16em] text-emerald-300">VOICE BRIDGE READY</p>
            <p className="mt-2 max-w-[250px] text-xs leading-5 text-[#8E8E93]">
              Choose who is speaking. Dictated words appear here; typed replies are spoken aloud.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orderedMessages.map((message) => {
              const isYou = message.sender === 'user';
              return (
                <div key={message.id} className={`person-chat-message flex ${isYou ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex max-w-[88%] flex-col ${isYou ? 'items-end' : 'items-start'}`}>
                    <span className="mb-1 px-1 font-mono text-[8px] tracking-[0.13em] text-[#77777D]">
                      {message.sender === 'unknown' ? 'UNKNOWN SPEAKER' : isYou ? 'YOU' : 'PARTNER'}
                    </span>
                    <div className={`rounded-2xl border px-3.5 py-2.5 text-[13px] leading-5 ${isYou
                      ? 'rounded-tr-md border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.14] to-cyan-400/[0.07] text-white'
                      : 'rounded-tl-md border-white/10 bg-white/[0.055] text-[#E5E5E8]'
                    }`}>
                      {message.interpretedMessage}
                    </div>
                    <span className="mt-1 px-1 font-mono text-[8px] text-[#68686E]">{message.timestamp}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isListening && (
          <div className="mt-4 flex min-h-[76px] items-center justify-between gap-4 rounded-[18px] border border-white/10 bg-black/45 px-4 py-3 shadow-inner shadow-black/30">
            <WaveformVisualizer isActive barsCount={28} className="h-12 flex-1 gap-[4px]" />
            <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-emerald-300">LISTENING</span>
          </div>
        )}
        {interimTranscript && (
          <p className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-xs italic text-emerald-100/80" aria-live="polite">
            {interimTranscript}
            <span className="ml-2 font-mono text-[8px] not-italic text-emerald-300/60">LIVE</span>
          </p>
        )}
        {voiceError && <p className="mt-3 text-[10px] leading-4 text-amber-200/80" role="status">{voiceError}</p>}
        <div ref={messagesEndRef} />
      </div>

      <footer className="border-t border-white/10 bg-black/25 p-3">
        <form onSubmit={sendText} className="person-chat-composer flex items-end gap-2 rounded-2xl border border-white/15 bg-black/35 p-2 transition-all">
          <button
            type="button"
            onClick={onToggleListening}
            className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors ${isListening ? 'border-red-300/35 bg-red-400/10 text-red-200' : 'border-white/10 text-[#8E8E93] hover:border-emerald-300/20 hover:text-emerald-200'}`}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            title={isListening ? 'Stop listening' : `Dictate as ${speaker === 'user' ? 'you' : 'partner'}`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            maxLength={1000}
            placeholder="TYPE A REPLY TO SPEAK..."
            className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-[#68686E] placeholder:font-mono placeholder:text-[9px] placeholder:tracking-[0.07em]"
            aria-label="Type a message to speak"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/[0.12] text-emerald-200 transition-all hover:border-emerald-200/50 hover:bg-emerald-300/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Speak message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 px-1 font-mono text-[8px] tracking-[0.1em] text-[#5F6066]">VOICE INPUT · SPEECH OUTPUT · ENTER TO SPEAK</p>
      </footer>
    </section>
  );
}
