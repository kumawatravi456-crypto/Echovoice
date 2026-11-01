import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Menu, X, LogIn, LogOut, User as UserIcon, LayoutDashboard } from 'lucide-react';
import { audioController } from '../utils/audioSynth';
import { MagneticButton } from './MagneticButton';
import { useAuth } from '../context/AuthContext';

interface NavigationProps {
  onNavigate: (sectionId: string) => void;
  onLogin: () => void;
  onOpenDashboard?: () => void;
}

export function Navigation({ onNavigate, onLogin, onOpenDashboard }: NavigationProps) {
  const { user, profile, signOut } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 40);

      const winHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (winHeight > 0) {
        setScrollProgress((scrollY / winHeight) * 100);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioController.setMuted(next);
    if (!next) {
      audioController.playClick(880, 0.08);
    }
  };

  const handleNavClick = (id: string) => {
    audioController.playClick(520, 0.04);
    setMobileMenuOpen(false);
    onNavigate(id);
  };

  const handleLoginClick = () => {
    audioController.playClick(520, 0.04);
    setMobileMenuOpen(false);
    onLogin();
  };

  const handleSignOutClick = async () => {
    audioController.playClick(440, 0.04);
    setMobileMenuOpen(false);
    await signOut();
  };

  const displayName = user?.displayName || profile?.displayName || user?.email?.split('@')[0] || 'User';

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#0D0D0E]/80 backdrop-blur-xl border-b border-white/10 py-3.5 shadow-2xl'
            : 'bg-transparent py-5'
        }`}
      >
        {/* Subtle Scroll Progress Indicator */}
        <div
          className="absolute bottom-0 left-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/50 to-white transition-all duration-75"
          style={{ width: `${scrollProgress}%` }}
        />

        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          {/* Zone 1: Brand Anchor */}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-3 text-sm font-bold tracking-tight text-white group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl igloo-glass border border-white/20 flex items-center justify-center group-hover:scale-105 transition-transform">
              <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#FFFFFF]" />
            </div>
            <span className="font-display">Project Echo</span>
          </a>

          {/* Zone 2: Clean Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-xs font-mono tracking-wider uppercase text-[#8E8E93]">
            <button
              onClick={() => handleNavClick('gap')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Why it matters
            </button>
            <button
              onClick={() => handleNavClick('signals')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Example messages
            </button>
            <button
              onClick={() => handleNavClick('personalization')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Personalization
            </button>
          </nav>

          {/* Zone 3: Primary Action + Audio Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              className="p-2.5 rounded-full igloo-glass text-[#8E8E93] hover:text-white hover:border-white/30 transition-all cursor-pointer"
              title={isMuted ? 'Sound muted' : 'Sound active'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-white" />}
            </button>

            {user ? (
              /* Signed In State: Shows Dashboard shortcut, User Name, Photo, and Sign Out */
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenDashboard || handleLoginClick}
                  className="px-4 py-2 rounded-full bg-white text-[#0D0D0E] font-semibold text-xs hover:bg-[#F0F0F2] flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)] cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={onOpenDashboard || handleLoginClick}
                  className="px-3 py-1.5 rounded-full igloo-glass border border-white/20 hover:border-white/40 flex items-center gap-2 transition-all text-xs font-medium text-white cursor-pointer hidden sm:flex"
                  title="Open Dashboard"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={displayName}
                      className="w-5 h-5 rounded-full object-cover border border-white/40"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserIcon className="w-3.5 h-3.5 text-white/70" />
                  )}
                  <span className="max-w-[90px] truncate">{displayName}</span>
                </button>

                <button
                  onClick={handleSignOutClick}
                  aria-label="Sign out"
                  title="Sign out"
                  className="p-2.5 rounded-full igloo-glass text-[#8E8E93] hover:text-white hover:border-white/40 transition-all cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* Signed Out State: Login Button */
              <MagneticButton
                onClick={handleLoginClick}
                className="px-5 py-2.5 text-xs font-semibold tracking-wide text-[#0D0D0E] bg-white rounded-full hover:bg-[#F0F0F2] hover:shadow-[0_0_20px_rgba(255,255,255,0.45)] transition-all whitespace-nowrap shrink-0 active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Login</span>
                <LogIn className="w-3.5 h-3.5 text-[#0D0D0E]" />
              </MagneticButton>
            )}

            {/* Mobile drawer toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-[#8E8E93] hover:text-white cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-x-0 top-16 p-6 bg-[#0D0D0E]/95 backdrop-blur-2xl border-b border-white/10 flex flex-col gap-4 text-sm font-medium">
            {user && (
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={displayName}
                      className="w-8 h-8 rounded-full object-cover border border-white/30"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-white text-xs">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white font-semibold truncate text-xs">{displayName}</p>
                    <p className="text-[#8E8E93] font-mono text-[11px] truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOutClick}
                  className="text-xs text-[#A1A1AA] hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}

            <button
              onClick={() => handleNavClick('gap')}
              className="text-left py-2 text-[#8E8E93] hover:text-white cursor-pointer"
            >
              Why it matters
            </button>
            <button
              onClick={() => handleNavClick('signals')}
              className="text-left py-2 text-[#8E8E93] hover:text-white cursor-pointer"
            >
              Example messages
            </button>
            <button
              onClick={() => handleNavClick('live-demo')}
              className="text-left py-2 text-white font-semibold cursor-pointer"
            >
              Try the demo
            </button>
            <button
              onClick={() => handleNavClick('personalization')}
              className="text-left py-2 text-[#8E8E93] hover:text-white cursor-pointer"
            >
              Personalization
            </button>

            {!user && (
              <div className="pt-2 border-t border-white/10">
                <button
                  onClick={handleLoginClick}
                  className="w-full py-3 rounded-xl bg-white text-[#0D0D0E] font-semibold text-center flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login with Google</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>
    </>
  );
}
