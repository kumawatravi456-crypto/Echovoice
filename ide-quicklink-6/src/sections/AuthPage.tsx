import { useState } from 'react';
import { ArrowLeft, LogOut, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthPageProps {
  onBack: () => void;
}

export function AuthPage({ onBack }: AuthPageProps) {
  const {
    user,
    profile,
    isSigningIn,
    error,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    clearError,
  } = useAuth();

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const switchMode = (createAccount: boolean) => {
    setIsCreatingAccount(createAccount);
    setLocalError(null);
    clearError();
  };

  const handleGoogleAuth = async () => {
    setLocalError(null);
    clearError();
    try {
      await signInWithGoogle();
    } catch {
      // Error surfaced via auth context
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError('Please enter your Gmail / email address.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    if (isCreatingAccount) {
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();

      if (!trimmedFirst) {
        setLocalError('Please enter your first name.');
        return;
      }

      if (password !== confirmPassword) {
        setLocalError('Passwords do not match. Please re-enter both passwords.');
        return;
      }

      const fullName = `${trimmedFirst} ${trimmedLast}`.trim();
      try {
        await signUpWithEmail(trimmedEmail, password, fullName);
      } catch {
        // Handled in context
      }
    } else {
      try {
        await signInWithEmail(trimmedEmail, password);
      } catch {
        // Handled in context
      }
    }
  };

  const activeError = localError || error;

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center px-6 py-28">
      <div className="w-full max-w-lg">
        <button
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 text-sm text-[#D1D1D6] hover:text-white cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Project Echo
        </button>

        <section className="rounded-3xl igloo-glass-elevated border border-white/20 p-8 sm:p-10 shadow-2xl">
          {user ? (
            /* Signed In User State */
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#8E8E93]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399]" />
                <span>Signed In to Project Echo</span>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User Profile'}
                    className="w-14 h-14 rounded-full border border-white/30 object-cover shadow-md"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-xl font-bold text-white">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-white font-display truncate">
                    {user.displayName || profile?.displayName || 'Echo Member'}
                  </h2>
                  <p className="text-xs text-[#8E8E93] font-mono truncate">
                    {user.email || profile?.email || 'No email provided'}
                  </p>
                  <p className="text-[11px] text-[#A1A1AA] mt-1 font-mono">
                    UID: {user.uid.slice(0, 8)}...
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-[#8E8E93] leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 text-white font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Cloud Firestore Profile Synced</span>
                </div>
                <p>
                  Your profile metadata is safely saved in your protected Firestore database document.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={onBack}
                  className="w-full rounded-xl bg-white text-[#0D0D0E] py-3.5 text-sm font-semibold hover:bg-[#F0F0F2] transition-all cursor-pointer shadow-lg hover:shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                >
                  Go to My Dashboard
                </button>
                <button
                  onClick={signOut}
                  className="w-full rounded-xl border border-white/20 py-3 text-sm font-medium text-[#D1D1D6] hover:text-white hover:border-white/40 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            /* Unauthenticated View: Form + Google Auth Option */
            <div>
              <div className="mb-7">
                <p className="text-xs font-mono uppercase tracking-widest text-[#8E8E93]">Project Echo Authentication</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white font-display mt-1">
                  {isCreatingAccount ? 'Create your account' : 'Welcome back'}
                </h1>
                <p className="text-sm leading-relaxed text-[#D1D1D6] mt-2">
                  {isCreatingAccount
                    ? 'Enter your name, Gmail address, and choose a password to create your account.'
                    : 'Sign in with your Gmail and password to access your communication model.'}
                </p>
              </div>

              {/* Error Notification Banner */}
              {activeError && (
                <div
                  role="alert"
                  className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-[#F0F0F2] flex flex-col gap-2.5"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs sm:text-sm leading-relaxed">
                      <p className="font-semibold text-white mb-0.5">Authentication Notice</p>
                      <p className="text-[#D1D1D6]">{activeError}</p>
                    </div>
                  </div>

                  {activeError.includes('Firebase') && (
                    <a
                      href="https://console.firebase.google.com/project/gen-lang-client-0611544051/authentication/providers"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 text-xs font-medium transition-colors"
                    >
                      <span>Enable Email/Password in Firebase Console</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {!isCreatingAccount && (activeError.includes('Invalid email') || activeError.includes('account')) && (
                    <button
                      type="button"
                      onClick={() => switchMode(true)}
                      className="text-xs text-left text-amber-300 underline underline-offset-2 hover:text-white cursor-pointer mt-0.5"
                    >
                      Don't have an account yet? Click here to create your account first.
                    </button>
                  )}
                </div>
              )}

              {/* Email / Password Form */}
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {isCreatingAccount && (
                  /* First Name and Last Name Columns */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="auth-first-name" className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                        First Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="auth-first-name"
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. Alex"
                        className="w-full rounded-xl bg-[#0D0D0E]/80 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/50"
                      />
                    </div>
                    <div>
                      <label htmlFor="auth-last-name" className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                        Last Name
                      </label>
                      <input
                        id="auth-last-name"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="e.g. Morgan"
                        className="w-full rounded-xl bg-[#0D0D0E]/80 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/50"
                      />
                    </div>
                  </div>
                )}

                {/* Gmail Address Column */}
                <div>
                  <label htmlFor="auth-email" className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                    Gmail / Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="w-full rounded-xl bg-[#0D0D0E]/80 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/50"
                  />
                </div>

                {/* Password Column */}
                <div>
                  <label htmlFor="auth-password" className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-xl bg-[#0D0D0E]/80 border border-white/15 px-4 py-3 pr-12 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#8E8E93] hover:text-white cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Column (When Creating Account) */}
                {isCreatingAccount && (
                  <div>
                    <label htmlFor="auth-confirm-password" className="block text-xs font-mono text-[#D1D1D6] mb-1.5 uppercase">
                      Confirm Password <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        className="w-full rounded-xl bg-[#0D0D0E]/80 border border-white/15 px-4 py-3 pr-12 text-sm text-white placeholder:text-[#77777D] focus:outline-none focus:border-white/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#8E8E93] hover:text-white cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full rounded-2xl bg-white text-[#0D0D0E] py-4 text-sm font-semibold hover:bg-[#F0F0F2] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:shadow-[0_0_30px_rgba(255,255,255,0.45)] mt-2"
                >
                  {isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#0D0D0E]" />
                      <span>{isCreatingAccount ? 'Creating account...' : 'Signing in...'}</span>
                    </>
                  ) : (
                    <span>{isCreatingAccount ? 'Create Account' : 'Login'}</span>
                  )}
                </button>
              </form>

              {/* Separator */}
              <div className="relative my-7 flex items-center justify-center">
                <div className="w-full border-t border-white/10" />
                <span className="absolute bg-[#1C1C1F] px-3 text-xs font-mono text-[#8E8E93] uppercase">
                  Or continue with
                </span>
              </div>

              {/* Google Sign-In Alternative */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isSigningIn}
                className="w-full rounded-2xl igloo-glass border border-white/20 py-3.5 px-4 text-sm font-medium text-white hover:border-white/40 transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                <span>Continue with Google</span>
              </button>

              {/* Mode Switch Toggle */}
              <div className="mt-8 border-t border-white/10 pt-6 text-center text-sm text-[#8E8E93]">
                {isCreatingAccount ? 'Already have an account?' : 'New to Project Echo?'}{' '}
                <button
                  type="button"
                  onClick={() => switchMode(!isCreatingAccount)}
                  className="text-white underline underline-offset-4 hover:text-[#D1D1D6] font-medium cursor-pointer transition-colors"
                >
                  {isCreatingAccount ? 'Login here' : 'Create an account'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
