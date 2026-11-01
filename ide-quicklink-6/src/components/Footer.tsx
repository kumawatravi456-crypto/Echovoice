interface FooterProps {
  onNavigate: (sectionId: string) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="border-t border-white/10 bg-[#0D0D0E]/95 backdrop-blur-xl py-16 text-xs text-[#8E8E93] relative z-20">
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        {/* Brand Lockup */}
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            <span className="text-lg font-bold tracking-tight text-white font-display">
              Project Echo
            </span>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-[#8E8E93] font-normal">
            An accessible communication prototype focused on helping people express what they mean.
          </p>
        </div>

        {/* Navigation Mirror */}
        <div className="flex flex-wrap items-center gap-6 text-xs font-mono tracking-wider uppercase">
          <button
            onClick={() => onNavigate('hero')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Home
          </button>
          <button
            onClick={() => onNavigate('gap')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Why it matters
          </button>
          <button
            onClick={() => onNavigate('signals')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Example messages
          </button>
          <button
            onClick={() => onNavigate('live-demo')}
            className="text-white hover:text-white transition-colors cursor-pointer font-semibold underline underline-offset-4 decoration-white/40"
          >
            Try the demo
          </button>
          <button
            onClick={() => onNavigate('personalization')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Personalization
          </button>
        </div>

        {/* Copyright & Ethics Notice */}
        <div className="text-left md:text-right text-[11px] font-mono text-[#555558]">
          <div>© {new Date().getFullYear()} Project Echo Initiative.</div>
        </div>
      </div>
    </footer>
  );
}
