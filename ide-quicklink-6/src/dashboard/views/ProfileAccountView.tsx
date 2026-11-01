import { User, CheckCircle2, LogOut, Database, Shield, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GlassCard } from '../components/GlassCard';
import { MagneticButton } from '../../components/MagneticButton';

export function ProfileAccountView() {
  const { user, profile, signOut } = useAuth();

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white font-display">
          Profile & Account
        </h1>
        <p className="text-sm sm:text-base text-[#D1D1D6] mt-2 leading-relaxed">
          Your authenticated identity, session details, and protected Cloud Firestore database record.
        </p>
      </div>

      <GlassCard elevated className="p-8 sm:p-10 space-y-8">
        {/* User Card */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center sm:text-left">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User Profile'}
              className="w-24 h-24 rounded-full object-cover border-2 border-white/30 shadow-xl"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-4xl font-bold text-white shadow-xl">
              {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl sm:text-3xl font-bold text-white font-display truncate">
              {user?.displayName || profile?.displayName || 'Project Echo Member'}
            </h2>
            <p className="text-sm text-[#8E8E93] font-mono mt-1 truncate flex items-center justify-center sm:justify-start gap-2">
              <Mail className="w-4 h-4 text-white/60" />
              <span>{user?.email || profile?.email || 'No email attached'}</span>
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mt-4">
              <span className="px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-mono text-[11px] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>AUTHENTICATED SESSION</span>
              </span>
              <span className="px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/80 font-mono text-[11px]">
                UID: {user?.uid || 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Firestore Metadata Card */}
        <div className="p-6 rounded-2xl bg-black/50 border border-white/10 space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 uppercase tracking-wider">
            <Database className="w-4 h-4" />
            <span>Cloud Firestore Profile Record</span>
          </div>
          <p className="text-xs font-mono text-white/90 p-4 rounded-xl bg-white/[0.04] border border-white/10 break-all leading-relaxed">
            /databases/(default)/documents/users/{user?.uid}
          </p>
          <div className="text-xs text-[#8E8E93] leading-relaxed flex items-start gap-2.5 pt-1">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              Your personal profile document is protected by Firestore Zero-Trust Security Rules. Only your authenticated user session can read or write this record.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-white/10 flex justify-end">
          <MagneticButton
            onClick={signOut}
            soundPitch={480}
            className="px-6 py-3.5 rounded-2xl border border-red-500/30 hover:bg-red-500/15 text-red-300 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out of Project Echo</span>
          </MagneticButton>
        </div>
      </GlassCard>
    </div>
  );
}
