import { ArrowLeftRight, UserRound, Volume2 } from 'lucide-react';
import { audioController } from '../utils/audioSynth';

const exampleMessages = [
  'I need water.',
  'Please help me.',
  'I am feeling uncomfortable.',
  'I want to talk to my family.',
];

export function TwoWayCommunication() {
  return (
    <section className="py-32 relative overflow-hidden bg-[#0D0D0E]">
      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <div className="max-w-3xl mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white font-display mb-4 text-balance">
            Two-Way Conversation.
          </h2>
          <p className="text-base sm:text-lg text-[#8E8E93] font-normal leading-relaxed">
            Everyday communication can include asking for help, sharing a need, or connecting with someone you care about.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-11 gap-6 items-stretch relative">
          <div className="lg:col-span-5 rounded-3xl igloo-glass border border-white/10 p-8 md:p-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white flex items-center justify-center">
                  <UserRound className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-mono text-[#8E8E93]">A CONVERSATION STARTS</span>
                  <h3 className="text-base font-bold text-white">What would you like to say?</h3>
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-[#141416] border border-white/10">
                <p className="text-lg text-[#F0F0F2] font-medium leading-relaxed">
                  Choose a phrase that shares what you need or how you feel.
                </p>
              </div>
            </div>
            <p className="pt-6 border-t border-white/10 text-sm text-[#8E8E93]">
              These are example messages included in the prototype.
            </p>
          </div>

          <div className="lg:col-span-1 flex items-center justify-center py-2 lg:py-0">
            <div className="w-12 h-12 rounded-full igloo-glass border border-white/30 text-white flex items-center justify-center shadow-lg">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
          </div>

          <div className="lg:col-span-5 rounded-3xl igloo-glass-elevated border border-white/20 p-8 md:p-10 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/10">
                <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-mono text-white/70">YOUR MESSAGE</span>
                  <h3 className="text-base font-bold text-white">Choose a phrase to hear</h3>
                </div>
              </div>
              <div className="space-y-3">
                {exampleMessages.map((message) => (
                  <button
                    key={message}
                    onClick={() => audioController.speakConfirmedMessage(message)}
                    className="w-full p-3.5 rounded-xl bg-[#141416] border border-white/10 hover:border-white text-sm text-[#F0F0F2] flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span>{message}</span>
                    <Volume2 className="w-4 h-4 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-6 mt-6 border-t border-white/10 text-xs text-[#8E8E93]">
              Select a phrase to hear the browser’s sample voice.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
