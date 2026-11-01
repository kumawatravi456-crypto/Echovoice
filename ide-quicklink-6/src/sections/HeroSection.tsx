import { ArrowDown, Sparkles, LayoutDashboard } from 'lucide-react';
import { MagneticButton } from '../components/MagneticButton';
import { useAuth } from '../context/AuthContext';

interface HeroSectionProps {
  onExplore: () => void;
  onLaunchDemo: () => void;
  onStartWithGoogle: () => void;
}

export function HeroSection({ onExplore, onLaunchDemo, onStartWithGoogle }: HeroSectionProps) {
  const { user } = useAuth();

  return (
    <section id="hero" className="relative min-h-screen pt-36 pb-24 flex flex-col justify-between overflow-hidden">
      {/* Main Narrative Headline */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 w-full relative z-10 my-auto">
        <div className="max-w-3xl">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white leading-[0.98] mb-8 font-display text-balance">
            Your voice.{' '}
            <span className="text-gradient-white block sm:inline">Your expression.</span>{' '}
            <span className="text-[#8E8E93] font-normal">Your conversation.</span>
          </h1>

          <p className="text-lg md:text-xl text-[#D1D1D6] leading-relaxed max-w-xl mb-10 font-normal">
            Beyond Words, Beyond Barriers — Giving Every Voice a Way to Speak.
          </p>

          {/* Action Button Row */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <MagneticButton
              onClick={onStartWithGoogle}
              soundPitch={880}
              className="px-8 py-4 rounded-full bg-white text-[#0D0D0E] font-semibold text-sm hover:bg-[#F0F0F2] hover:shadow-[0_0_30px_rgba(255,255,255,0.45)] transition-all flex items-center gap-3 whitespace-nowrap cursor-pointer shadow-lg active:scale-95"
            >
              {user ? (
                <>
                  <LayoutDashboard className="w-4 h-4 text-[#0D0D0E]" />
                  <span>Open My Dashboard</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Start with Google</span>
                </>
              )}
            </MagneticButton>

            <MagneticButton
              onClick={onLaunchDemo}
              soundPitch={740}
              className="px-7 py-4 rounded-full igloo-glass text-white font-medium text-sm hover:border-white/50 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer active:scale-95"
            >
              <span>Try example messages</span>
              <Sparkles className="w-4 h-4 text-white" />
            </MagneticButton>

            <MagneticButton
              onClick={onExplore}
              soundPitch={540}
              className="px-6 py-4 rounded-full text-[#8E8E93] hover:text-white font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              Explore Project Echo
            </MagneticButton>
          </div>

        </div>
      </div>

      {/* Bottom Scroll Guide Indicator */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 w-full flex items-center justify-between text-xs font-mono text-[#8E8E93] pt-6">
        <div className="flex items-center gap-2 animate-bounce text-white">
          <ArrowDown className="w-3.5 h-3.5 text-white" />
          <span>SCROLL TO EXPLORE PROJECT ECHO</span>
        </div>
      </div>
    </section>
  );
}
