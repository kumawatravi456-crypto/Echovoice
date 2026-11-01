import { MagneticButton } from '../components/MagneticButton';

interface FinalCTAProps {
  onTryDemo: () => void;
}

export function FinalCTA({ onTryDemo }: FinalCTAProps) {
  return (
    <section id="contact" className="py-36 relative overflow-hidden bg-[#0D0D0E]">
      <div className="max-w-5xl mx-auto px-6 md:px-12 relative z-10 text-center">
        <h2 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white font-display mb-6 text-balance leading-[1.04]">
          Every expression deserves to be understood.
        </h2>
        <p className="text-lg md:text-xl text-[#8E8E93] max-w-2xl mx-auto leading-relaxed font-normal">
          Project Echo is a prototype exploring accessible ways to express intended thoughts, with the user in control of every message.
        </p>
        <div className="max-w-xl mx-auto mt-12 rounded-3xl igloo-glass-elevated border border-white/20 p-8 md:p-10 text-center shadow-2xl">
          <h3 className="text-2xl font-bold text-white font-display mb-3">Explore the prototype</h3>
          <p className="text-sm text-[#8E8E93] leading-relaxed mb-6">
            Choose an example message, edit its wording, and hear it spoken aloud.
          </p>
          <MagneticButton
            onClick={onTryDemo}
            className="px-6 py-3 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm cursor-pointer"
          >
            Try example messages
          </MagneticButton>
        </div>
      </div>
    </section>
  );
}
