import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  MessageSquareText,
  Paperclip,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  time: string;
}

interface ChatAttachment {
  name: string;
  mimeType: string;
  data: string;
}

const getTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const closeChat = () => {
    setIsOpen(false);
    setIsClosing(true);
    window.setTimeout(() => setIsClosing(false), 180);
  };

  const toggleChat = () => {
    if (isOpen) {
      closeChat();
    } else {
      setIsClosing(false);
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (isOpen) endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isProcessing, isOpen]);

  const sendToAssistant = async (history: ChatMessage[], image?: ChatAttachment | null) => {
    setIsProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(({ role, text }) => ({ role, text })),
          attachment: image ? { mimeType: image.mimeType, data: image.data } : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The assistant could not respond. Try again.');
      if (typeof payload.text !== 'string' || !payload.text.trim()) {
        throw new Error('The assistant returned an empty response. Try again.');
      }

      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: payload.text.trim(),
        time: getTime(),
      }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to connect to the assistant.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || isProcessing) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: text || 'Please describe this image.',
      time: getTime(),
    };
    const updatedHistory = [...messages, userMessage];
    setMessages(updatedHistory);
    setDraft('');
    const attachedImage = attachment;
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    void sendToAssistant(updatedHistory, attachedImage);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleAttachment = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file to attach.');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('Images must be smaller than 6 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const data = dataUrl.split(',')[1];
      if (!data) {
        setError('This image could not be read. Choose another file.');
        return;
      }
      setError('');
      setAttachment({ name: file.name, mimeType: file.type, data });
    };
    reader.onerror = () => setError('This image could not be read. Choose another file.');
    reader.readAsDataURL(file);
  };

  return (
    <>
      {(isOpen || isClosing) && (
        <section
          className={`ai-chat-window fixed z-[70] flex flex-col overflow-hidden rounded-[28px] border border-white/20 text-[#F0F0F2] ${isClosing ? 'ai-chat-window-closing' : ''}`}
          role="dialog"
          aria-label="AI assistant chat"
          aria-hidden={!isOpen}
          inert={!isOpen}
        >
          <div className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-emerald-400/[0.08] blur-[90px]" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-cyan-400/[0.06] blur-[90px]" />

          <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-black/25 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.08] shadow-[0_0_28px_rgba(16,185,129,0.12)]">
                <Sparkles className="h-5 w-5 text-emerald-300" />
                <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#101214] bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate font-mono text-xs font-semibold tracking-[0.16em] text-white sm:text-sm">AI ASSISTANT</h2>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] text-[#8E8E93] sm:text-[10px]">
                  <span className="ai-online-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>LIVE CONVERSATION</span>
                  <span className="text-white/20">/</span>
                  <span className="text-emerald-300">ONLINE</span>
                </div>
              </div>
            </div>
            <div className="ml-2 flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={closeChat}
                className="rounded-xl p-2 text-[#8E8E93] transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Minimize chat"
                title="Minimize"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={closeChat}
                className="rounded-xl p-2 text-[#8E8E93] transition-colors hover:bg-red-400/10 hover:text-red-200"
                aria-label="Close chat"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
            {messages.length === 0 ? (
              <div className="my-auto flex flex-col items-center px-5 py-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06]">
                  <Bot className="h-7 w-7 text-emerald-300/90" />
                </div>
                <p className="font-mono text-[10px] tracking-[0.18em] text-emerald-300">READY FOR INPUT</p>
                <p className="mt-2 max-w-[260px] text-sm leading-6 text-[#8E8E93]">
                  Send a message to start a conversation with Project Echo AI.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className={`ai-chat-message flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] ${message.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={`mb-1.5 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] ${message.role === 'user' ? 'text-emerald-200/60' : 'text-[#8E8E93]'}`}>
                        {message.role === 'assistant' && <Sparkles className="h-3 w-3 text-emerald-300" />}
                        <span>{message.role === 'user' ? 'YOU' : 'ECHO AI'}</span>
                      </div>
                      <div className={`rounded-2xl border px-3.5 py-3 text-[13px] leading-6 shadow-[0_10px_26px_rgba(0,0,0,0.2)] ${
                        message.role === 'user'
                          ? 'rounded-tr-md border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.14] to-cyan-400/[0.07] text-white'
                          : 'rounded-tl-md border-white/10 bg-white/[0.055] text-[#E5E5E8] backdrop-blur-xl'
                      }`}>
                        {message.text}
                      </div>
                      <span className="mt-1.5 font-mono text-[9px] text-[#68686E]">{message.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isProcessing && (
              <div className="ai-chat-message mt-4 flex justify-start">
                <div className="rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.055] px-4 py-3">
                  <div className="mb-2 font-mono text-[9px] tracking-[0.14em] text-emerald-300">AI PROCESSING...</div>
                  <div className="flex items-center gap-1.5" aria-label="AI is responding">
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot ai-typing-dot-delay-1" />
                    <span className="ai-typing-dot ai-typing-dot-delay-2" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100/80" role="alert">
                <span className="font-mono text-[9px] tracking-wider text-amber-200">CONNECTION NOTICE</span>
                <p className="mt-1">{error}</p>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          <footer className="relative z-10 border-t border-white/10 bg-black/25 p-3.5 sm:p-4">
            {attachment && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-2.5 py-1.5">
                <span className="truncate font-mono text-[10px] text-emerald-100/80">{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} className="shrink-0 rounded p-1 text-[#8E8E93] hover:text-white" aria-label="Remove attachment">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSend} className="ai-chat-composer flex items-end gap-2 rounded-2xl border border-white/15 bg-black/35 p-2 transition-all">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleAttachment(event.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mb-0.5 shrink-0 rounded-xl p-2 text-[#8E8E93] transition-colors hover:bg-white/[0.08] hover:text-emerald-200"
                aria-label="Attach an image"
                title="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                maxLength={4000}
                placeholder="TRANSMIT YOUR MESSAGE..."
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[12px] leading-5 text-white outline-none placeholder:text-[#68686E] placeholder:font-mono placeholder:text-[9px] placeholder:tracking-[0.08em] sm:placeholder:text-[10px]"
                aria-label="Your message"
              />
              <button
                type="submit"
                disabled={isProcessing || (!draft.trim() && !attachment)}
                className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-gradient-to-br from-emerald-300/20 to-cyan-300/10 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.12)] transition-all hover:scale-[1.04] hover:border-emerald-200/50 hover:shadow-[0_0_24px_rgba(16,185,129,0.24)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Send message"
              >
                {isProcessing ? <span className="h-3 w-3 animate-spin rounded-full border border-emerald-200/30 border-t-emerald-200" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 font-mono text-[8px] tracking-[0.1em] text-[#5F6066] sm:text-[9px]">
              <span>ENTER TO TRANSMIT</span>
              <span className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400/70" /> PRIVATE SESSION</span>
            </div>
          </footer>
        </section>
      )}

      <button
        type="button"
        onClick={toggleChat}
        className={`ai-chat-launcher fixed bottom-5 right-5 z-[71] flex items-center gap-3 rounded-2xl border border-emerald-200/25 bg-[#111315]/90 px-4 py-3 text-left text-white shadow-[0_14px_40px_rgba(0,0,0,0.48),0_0_28px_rgba(16,185,129,0.12)] backdrop-blur-2xl transition-all hover:-translate-y-0.5 hover:border-emerald-200/45 hover:shadow-[0_18px_48px_rgba(0,0,0,0.56),0_0_32px_rgba(16,185,129,0.18)] active:scale-[0.98] ${isOpen || isClosing ? 'pointer-events-none opacity-0' : ''}`}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Minimize AI chat' : 'Open AI chat'}
        tabIndex={isOpen || isClosing ? -1 : 0}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08]">
          <MessageSquareText className="h-4 w-4 text-emerald-300" />
        </span>
        <span>
          <span className="block font-mono text-[10px] font-semibold tracking-[0.16em]">AI CHAT</span>
          <span className="mt-1 block font-mono text-[8px] tracking-[0.1em] text-[#8E8E93]">PROJECT ECHO</span>
        </span>
        <span className="ml-1 flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2 py-1 font-mono text-[8px] tracking-wider text-emerald-200">
          <span className="ai-online-pulse h-1.5 w-1.5 rounded-full bg-emerald-400" />
          LIVE
        </span>
      </button>
    </>
  );
}
