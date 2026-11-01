import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { audioController } from '../utils/audioSynth';

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('PREPARING PROJECT ECHO');
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const statusMessages = [
      'PREPARING PROJECT ECHO',
      'LOADING THE PROTOTYPE',
      'READY TO EXPLORE',
    ];

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 8) + 4;
        if (next >= 100) {
          clearInterval(timer);
          setStatusText('READY TO EXPLORE');
          setTimeout(() => {
            setIsFading(true);
            audioController.playClick(880, 0.08);
            setTimeout(() => {
              onComplete();
            }, 600);
          }, 300);
          return 100;
        }

        const msgIdx = Math.min(
          statusMessages.length - 1,
          Math.floor((next / 100) * statusMessages.length)
        );
        setStatusText(statusMessages[msgIdx]);
        return next;
      });
    }, 45);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-8 md:p-14 bg-[#0D0D0E] transition-opacity duration-700 ease-out ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top Bar Header */}
      <div className="w-full max-w-7xl flex items-center justify-between text-xs font-mono text-[#8E8E93] uppercase">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_#FFFFFF] animate-pulse" />
          <span>PROJECT ECHO // COMMUNICATION PROTOTYPE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#F0F0F2]">PROJECT ECHO</span>
        </div>
      </div>

      {/* Center Cinematic Mark */}
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl igloo-glass border border-white/20 flex items-center justify-center igloo-glow-silver">
            <Sparkles className="w-9 h-9 text-white" />
          </div>
          <div className="absolute -inset-2 rounded-3xl border border-white/20 animate-ping pointer-events-none" />
        </div>

        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-display">
            Project Echo
          </h1>
          <p className="text-xs font-mono text-[#8E8E93] mt-1 tracking-wider uppercase">
            Accessible Communication Prototype
          </p>
        </div>

        {/* Counter */}
        <div className="text-6xl sm:text-7xl font-bold font-mono text-white tabular-nums tracking-tighter">
          {progress.toString().padStart(2, '0')}%
        </div>
      </div>

      {/* Bottom Progress Bar & Telemetry Status */}
      <div className="w-full max-w-md space-y-3">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#8E8E93]">
          <span className="truncate">{statusText}</span>
        </div>

        <div className="w-full h-[2.5px] bg-[#1C1C1F] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#555558] via-[#8E8E93] to-[#FFFFFF] transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="text-center pt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
            className="text-xs text-[#8E8E93] hover:text-white transition-colors uppercase font-mono tracking-wider underline underline-offset-4 cursor-pointer"
          >
            Skip Intro →
          </button>
        </div>
      </div>
    </div>
  );
}
