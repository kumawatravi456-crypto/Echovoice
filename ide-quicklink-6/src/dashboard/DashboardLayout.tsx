import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Hand,
  History,
  BookMarked,
  Volume2,
  Sliders,
  User,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  Check,
} from 'lucide-react';
import gsap from 'gsap';
import type { DashboardTab, SessionConsent } from './types';
import { useAuth } from '../context/AuthContext';
import { OverviewView } from './views/OverviewView';
import { LiveConversationView } from './views/LiveConversationView';
import { GestureRecognitionView } from './views/GestureRecognitionView';
import { ConversationHistoryView } from './views/ConversationHistoryView';
import { PersonalVocabularyView } from './views/PersonalVocabularyView';
import { VoiceSettingsView } from './views/VoiceSettingsView';
import { AccessibilitySettingsView } from './views/AccessibilitySettingsView';
import { ProfileAccountView } from './views/ProfileAccountView';
import { HelpSupportView } from './views/HelpSupportView';
import { AnimatedPageTransition } from './components/AnimatedPageTransition';
import { MagneticButton } from '../components/MagneticButton';
import { SessionConsentModal } from './components/SessionConsentModal';

interface DashboardLayoutProps {
  onReturnToLanding: () => void;
}

export function DashboardLayout({ onReturnToLanding }: DashboardLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>(undefined);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sessionConsent, setSessionConsent] = useState<SessionConsent>({
    camera: false,
    microphone: false,
    voiceCloning: false,
  });
  const [consentResolved, setConsentResolved] = useState(false);

  const sidebarRef = useRef<HTMLElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.displayName || profile?.displayName || user?.email?.split('@')[0] || 'Member';

  const navItems: { id: DashboardTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'live-conversation', label: 'Live Conversation', icon: MessageSquare },
    { id: 'gestures', label: 'Gesture Recognition', icon: Hand },
    { id: 'history', label: 'Conversation History', icon: History },
    { id: 'vocabulary', label: 'Personal Vocabulary', icon: BookMarked },
    { id: 'voice-settings', label: 'Voice & Speech Settings', icon: Volume2 },
    { id: 'accessibility', label: 'Accessibility Settings', icon: Sliders },
    { id: 'profile', label: 'Profile & Account', icon: User },
    { id: 'help', label: 'Help & Support', icon: HelpCircle },
  ];

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setShowNotifications(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const agreeToSessionConsent = (consent: SessionConsent) => {
    setSessionConsent(consent);
    setConsentResolved(true);
  };

  const disagreeToSessionConsent = () => {
    setSessionConsent({ camera: false, microphone: false, voiceCloning: false });
    setConsentResolved(true);
  };

  // Close notifications on outer click
  useEffect(() => {
    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (
        notificationMenuRef.current &&
        !notificationMenuRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showNotifications]);

  const currentNav = navItems.find((n) => n.id === activeTab);

  return (
    <div className="min-h-screen bg-transparent text-[#F0F0F2] flex flex-col md:flex-row relative selection:bg-white/20 selection:text-white">
      {/* Background Atmospheric Noise Texture */}
      <div className="fixed inset-0 pointer-events-none z-0 igloo-noise" aria-hidden="true" />

      {/* Ambient Lighting Orbs matching Landing Page */}
      <div
        className="fixed -top-40 -left-40 w-[550px] h-[550px] rounded-full bg-white/[0.03] blur-[140px] pointer-events-none z-0"
        aria-hidden="true"
      />
      <div
        className="fixed top-1/3 -right-40 w-[600px] h-[600px] rounded-full bg-white/[0.025] blur-[160px] pointer-events-none z-0"
        aria-hidden="true"
      />

      {/* =========================================================================
          DESKTOP SIDEBAR NAVIGATION
         ========================================================================= */}
      <aside
        ref={sidebarRef}
        className={`hidden md:flex flex-col justify-between border-r border-white/10 bg-[#0D0D0E]/60 backdrop-blur-2xl transition-all duration-300 z-30 shrink-0 sticky top-0 h-screen ${
          isSidebarCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        {/* Brand / Logo Top */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div
            onClick={() => handleTabChange('overview')}
            className="flex items-center gap-3 overflow-hidden cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl igloo-glass border border-white/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform igloo-glow-silver">
              <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_#FFFFFF]" />
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <span className="font-bold text-white text-base tracking-tight font-display block truncate">
                  Project Echo
                </span>
                <span className="text-[10px] font-mono text-emerald-400 block tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34D399]" />
                  <span>WORKSPACE</span>
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-1.5 rounded-xl text-[#8E8E93] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-xs font-semibold tracking-wide transition-all cursor-pointer relative group ${
                  isActive
                    ? 'bg-white text-[#0D0D0E] shadow-[0_0_25px_rgba(255,255,255,0.35)] font-bold'
                    : 'text-[#8E8E93] hover:text-white hover:bg-white/[0.06]'
                }`}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-[#0D0D0E]' : 'text-inherit'
                  }`}
                />
                {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Bottom Profile & Public Site Strip */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {/* Public Landing Page link */}
          <button
            onClick={onReturnToLanding}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-[#8E8E93] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer ${
              isSidebarCollapsed ? 'justify-center' : ''
            }`}
            title="View Public Landing Page"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate font-mono text-[11px]">PUBLIC LANDING</span>}
          </button>

          {/* User profile capsule */}
          <div
            className={`flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.03] border border-white/10 ${
              isSidebarCollapsed ? 'justify-center' : ''
            }`}
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="w-8 h-8 rounded-full object-cover border border-white/30 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                <p className="text-[10px] text-[#8E8E93] font-mono truncate">{user?.email}</p>
              </div>
            )}

            {!isSidebarCollapsed && (
              <button
                onClick={signOut}
                className="p-1.5 text-[#8E8E93] hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* =========================================================================
          MAIN APPLICATION VIEWPORT
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Floating Glass Dashboard Header */}
        <header className="sticky top-0 z-20 bg-[#0D0D0E]/60 backdrop-blur-xl border-b border-white/10 px-6 sm:px-10 py-4 flex items-center justify-between gap-4">
          {/* Breadcrumb & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-[#8E8E93] hover:text-white border border-white/10 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#8E8E93] uppercase">
                <span className="cursor-pointer hover:text-white" onClick={() => handleTabChange('overview')}>
                  Project Echo
                </span>
                <span>/</span>
                <span className="text-white font-medium">{currentNav?.label}</span>
              </div>
              <h1 className="text-lg sm:text-2xl font-bold text-white font-display tracking-tight truncate">
                {currentNav?.label}
              </h1>
            </div>
          </div>

          {/* System Status Indicators & Notifications */}
          <div className="flex items-center gap-3">
            {/* Live Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full igloo-glass border border-white/15 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399] animate-pulse" />
              <span className="text-white text-[11px] tracking-wide">SYSTEM READY</span>
            </div>

            {/* Notifications Dropdown */}
            <div className="relative" ref={notificationMenuRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2.5 rounded-full igloo-glass border border-white/15 text-[#8E8E93] hover:text-white transition-colors cursor-pointer relative hover:border-white/30"
                title="System Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34D399]" />
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-3 w-84 rounded-3xl igloo-glass-elevated border border-white/20 p-5 shadow-2xl z-50 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <span className="font-bold text-white font-display text-sm">System Telemetry</span>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="p-1 text-[#8E8E93] hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-white font-semibold">MediaPipe Hand Landmark Tracking Ready</p>
                        <p className="text-[#8E8E93] text-[11px] mt-0.5">21 landmark vertices active for live gesture interpretation.</p>
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-white font-semibold">ElevenLabs Voice Synthesizer Connected</p>
                        <p className="text-[#8E8E93] text-[11px] mt-0.5">Speech synthesis ready for confirmed message output.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar Button */}
            <button
              onClick={() => handleTabChange('profile')}
              className="p-1 rounded-full border border-white/20 hover:border-white/50 transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(255,255,255,0.25)]"
              title="Profile & Account"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayName}
                  className="w-7 h-7 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/85 backdrop-blur-md flex">
            <div className="w-80 bg-[#0D0D0E] border-r border-white/10 p-6 flex flex-col justify-between h-full">
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl igloo-glass border border-white/20 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#FFFFFF]" />
                    </div>
                    <span className="font-bold text-white font-display text-base">Project Echo</span>
                  </div>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-[#8E8E93] hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-1.5">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-white text-[#0D0D0E] font-bold shadow-lg'
                            : 'text-[#8E8E93] hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="space-y-2 pt-4 border-t border-white/10">
                <button
                  onClick={onReturnToLanding}
                  className="w-full py-3 rounded-2xl border border-white/15 text-xs text-white flex items-center justify-center gap-2 cursor-pointer hover:border-white/30"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Public Landing Page</span>
                </button>
                <button
                  onClick={signOut}
                  className="w-full py-3 rounded-2xl bg-white/10 text-white hover:bg-red-500/20 hover:text-red-300 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Content Viewport with GSAP Stagger Transition */}
        <main className="flex-1 p-6 sm:p-10 relative z-10 overflow-y-auto">
          <AnimatedPageTransition tabKey={activeTab}>
            {activeTab === 'overview' && (
              <OverviewView
                userName={displayName}
                onNavigateTab={handleTabChange}
                onSelectConversation={(id) => {
                  setSelectedHistoryId(id);
                  setActiveTab('history');
                }}
              />
            )}

            {activeTab === 'live-conversation' && (
              <LiveConversationView
                mediaConsent={sessionConsent}
                onRequestConsent={() => setConsentResolved(false)}
              />
            )}

            {activeTab === 'gestures' && <GestureRecognitionView />}

            {activeTab === 'history' && (
              <ConversationHistoryView initialSelectedId={selectedHistoryId} />
            )}

            {activeTab === 'vocabulary' && <PersonalVocabularyView />}

            {activeTab === 'voice-settings' && (
              <VoiceSettingsView
                voiceCloningConsent={sessionConsent.voiceCloning}
                onRequestConsent={() => setConsentResolved(false)}
              />
            )}

            {activeTab === 'accessibility' && <AccessibilitySettingsView />}

            {activeTab === 'profile' && <ProfileAccountView />}

            {activeTab === 'help' && <HelpSupportView />}
          </AnimatedPageTransition>
        </main>
      </div>
      {!consentResolved && (
        <SessionConsentModal
          initialChoices={sessionConsent}
          onAgree={agreeToSessionConsent}
          onDisagree={disagreeToSessionConsent}
        />
      )}
    </div>
  );
}
