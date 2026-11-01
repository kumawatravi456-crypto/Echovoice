import { useState } from 'react';
import { MessageSquare, Pencil, Volume2, SlidersHorizontal } from 'lucide-react';
import { audioController } from '../utils/audioSynth';

const cards = [
  {
    title: 'Everyday messages',
    subtitle: 'Start with a phrase',
    description: 'Choose an example for asking for help, sharing a need, or connecting with family.',
    icon: MessageSquare,
  },
  {
    title: 'Edit your words',
    subtitle: 'Make it yours',
    description: 'Adjust the message before you decide whether to share it.',
    icon: Pencil,
  },
  {
    title: 'Spoken output',
    subtitle: 'Hear the message',
    description: 'The prototype can speak a message aloud using your browser’s speech synthesis.',
    icon: Volume2,
  },
  {
    title: 'Personal preferences',
    subtitle: 'Choose what matters',
    description: 'Set a preferred voice pitch and select the communication topics that matter to you.',
    icon: SlidersHorizontal,
  },
];

export function BeyondSpeech() {
  const [activeCard, setActiveCard] = useState(0);

  return (
    <section id="signals" className="py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <div className="max-w-2xl mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white font-display">
            Beyond Speech.
          </h2>
          <p className="text-base sm:text-lg text-[#D1D1D6] mt-4 font-normal">
            Explore the parts of the prototype that support expressing, editing, and sharing a message.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {cards.map((card, index) => {
            const Icon = card.icon;
            const selected = activeCard === index;
            return (
              <button
                key={card.title}
                onClick={() => {
                  audioController.playClick(500 + index * 70, 0.04);
                  setActiveCard(index);
                }}
                aria-pressed={selected}
                className={`text-left rounded-3xl p-8 md:p-10 igloo-glass border transition-all cursor-pointer ${selected ? 'border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'border-white/10 hover:border-white/30'}`}
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono text-[#8E8E93]">0{index + 1}</span>
                    <h3 className="text-2xl font-bold text-white font-display">{card.title}</h3>
                  </div>
                </div>
                <div className="text-xs font-mono tracking-widest uppercase text-[#8E8E93] mb-2">{card.subtitle}</div>
                <p className="text-sm text-[#D1D1D6] leading-relaxed">{card.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
