import { useState } from 'react';
import { Check, Edit3, MessageSquareQuote, Volume2 } from 'lucide-react';
import { audioController } from '../utils/audioSynth';

const exampleMessages = [
  'I need water.',
  'Please help me.',
  'I am feeling uncomfortable.',
  'I want to talk to my family.',
];

export function InteractiveDemo() {
  const [selectedMessage, setSelectedMessage] = useState(exampleMessages[0]);
  const [editedMessage, setEditedMessage] = useState(exampleMessages[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [spokenMessages, setSpokenMessages] = useState<string[]>([]);

  const selectMessage = (message: string) => {
    setSelectedMessage(message);
    setEditedMessage(message);
    setIsEditing(false);
  };

  const speakMessage = () => {
    const message = editedMessage.trim();
    if (!message) return;
    audioController.speakConfirmedMessage(message);
    setSpokenMessages((current) => [message, ...current]);
  };

  return (
    <section id="live-demo" className="py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <div className="max-w-3xl mb-12">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white font-display">
            Try an example message.
          </h2>
          <p className="text-base sm:text-lg text-white font-semibold mt-4 inline-block igloo-glass-elevated border border-white/20 px-5 py-3 rounded-2xl shadow-xl">
            These sample phrases are not generated from live sensors. Choose one, edit it, and confirm to hear it spoken aloud.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 space-y-3">
            <h3 className="text-lg font-bold text-white mb-4">Example messages</h3>
            {exampleMessages.map((message) => (
              <button
                key={message}
                onClick={() => selectMessage(message)}
                aria-pressed={selectedMessage === message}
                className={`w-full p-4 rounded-2xl border text-left cursor-pointer ${selectedMessage === message ? 'bg-white/15 border-white text-white' : 'bg-[#141416] border-white/10 text-[#D1D1D6] hover:border-white/25'}`}
              >
                {message}
              </button>
            ))}
          </div>

          <div className="lg:col-span-7 rounded-3xl igloo-glass-elevated border border-white/20 p-6 md:p-8">
            <h3 className="text-2xl font-bold text-white font-display mb-5">Review your message</h3>
            {isEditing ? (
              <textarea
                value={editedMessage}
                onChange={(event) => setEditedMessage(event.target.value)}
                rows={3}
                aria-label="Edit your message"
                className="w-full p-4 rounded-xl bg-[#0D0D0E] border border-white/20 text-white text-base focus:outline-none focus:border-white"
              />
            ) : (
              <p className="min-h-24 p-4 rounded-xl bg-[#0D0D0E] border border-white/10 text-white text-lg leading-relaxed">
                {editedMessage}
              </p>
            )}

            <div className="flex flex-wrap gap-3 mt-5">
              <button
                onClick={() => setIsEditing((current) => !current)}
                className="px-4 py-2.5 rounded-full igloo-glass border border-white/20 text-white text-sm flex items-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                {isEditing ? 'Done editing' : 'Edit message'}
              </button>
              <button
                onClick={speakMessage}
                disabled={!editedMessage.trim()}
                className="px-5 py-2.5 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Volume2 className="w-4 h-4" />
                Confirm and speak
              </button>
            </div>
            <p className="text-sm text-[#8E8E93] mt-4">The example is spoken only after you confirm.</p>
          </div>

          {spokenMessages.length > 0 && (
            <div className="lg:col-span-12 rounded-3xl igloo-glass border border-white/10 p-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                <MessageSquareQuote className="w-4 h-4" />
                Messages you confirmed
              </h3>
              <ul className="space-y-2">
                {spokenMessages.map((message, index) => (
                  <li key={`${index}-${message}`} className="flex items-center gap-2 text-sm text-[#D1D1D6]">
                    <Check className="w-4 h-4 text-white" />
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
