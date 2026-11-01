import { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Preloader } from './components/Preloader';
import { IglooWorldCanvas } from './scenes/IglooWorldCanvas';
import { Navigation } from './components/Navigation';
import { HeroSection } from './sections/HeroSection';
import { CommunicationGap } from './sections/CommunicationGap';
import { BeyondSpeech } from './sections/BeyondSpeech';
import { InteractiveDemo } from './sections/InteractiveDemo';
import { TwoWayCommunication } from './sections/TwoWayCommunication';
import { Personalization } from './sections/Personalization';
import { FinalCTA } from './sections/FinalCTA';
import { AuthPage } from './sections/AuthPage';
import { Footer } from './components/Footer';
import { CustomCursor } from './components/CustomCursor';
import { DashboardLayout } from './dashboard/DashboardLayout';

function AppContent() {
  const { user, loading } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentHash, setCurrentHash] = useState(() => window.location.hash);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Sync hash routing
  useEffect(() => {
    const handleHashSync = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('popstate', handleHashSync);
    window.addEventListener('hashchange', handleHashSync);
    return () => {
      window.removeEventListener('popstate', handleHashSync);
      window.removeEventListener('hashchange', handleHashSync);
    };
  }, []);

  // When user signs in, automatically transition to dashboard unless explicitly viewing public landing
  useEffect(() => {
    if (user && window.location.hash !== '#landing') {
      if (window.location.hash === '#login' || !window.location.hash) {
        window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
        setCurrentHash('#dashboard');
      }
    }
  }, [user]);

  // Synchronize window scroll progress with 3D camera choreography for landing page
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const progress = maxScroll > 0 ? scrollY / maxScroll : 0;
          setScrollProgress(Math.min(1, Math.max(0, progress)));
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const openLoginPage = () => {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#login`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentHash('#login');
  };

  const openDashboard = () => {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentHash('#dashboard');
  };

  const openLandingPage = () => {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#landing`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setCurrentHash('#landing');
  };

  const isAuthView = currentHash === '#login';
  const isDashboardView = Boolean(user && (currentHash === '#dashboard' || (!currentHash && user)));
  const isLandingView = !isAuthView && !isDashboardView;

  return (
    <div className="min-h-screen bg-[#0D0D0E] text-[#F0F0F2] relative selection:bg-white/20 selection:text-white overflow-x-hidden">
      {/* Igloo Cinematic Preloader */}
      {!isLoaded && <Preloader onComplete={() => setIsLoaded(true)} />}

      {/* Persistent Fullscreen 3D World (Three.js WebGL Canvas) - Active across landing, auth, and dashboard */}
      <IglooWorldCanvas scrollProgress={scrollProgress} isDashboard={isDashboardView} />

      {/* Filmic Atmospheric Noise Filter */}
      <div className="fixed inset-0 pointer-events-none z-[45] igloo-noise" aria-hidden="true" />

      {/* Studio Magnetic Precision Fluid Cursor */}
      <CustomCursor />

      {/* Conditional Route Views */}
      {isDashboardView ? (
        <DashboardLayout onReturnToLanding={openLandingPage} />
      ) : isAuthView ? (
        <AuthPage onBack={user ? openDashboard : openLandingPage} />
      ) : (
        <>
          <Navigation
            onNavigate={scrollToSection}
            onLogin={openLoginPage}
            onOpenDashboard={openDashboard}
          />
          <main className="relative z-10">
            <HeroSection
              onExplore={() => scrollToSection('gap')}
              onLaunchDemo={() => scrollToSection('live-demo')}
              onStartWithGoogle={user ? openDashboard : openLoginPage}
            />
            <CommunicationGap />
            <BeyondSpeech />
            <TwoWayCommunication />
            <InteractiveDemo />
            <Personalization />
            <FinalCTA onTryDemo={() => scrollToSection('live-demo')} />
          </main>
          <Footer onNavigate={scrollToSection} />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
