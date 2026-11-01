interface WaveformVisualizerProps {
  isActive?: boolean;
  barsCount?: number;
  className?: string;
  variant?: 'silver' | 'emerald';
}

export function WaveformVisualizer({
  isActive = false,
  barsCount = 18,
  className = '',
  variant = 'silver',
}: WaveformVisualizerProps) {
  const bars = Array.from({ length: barsCount }, (_, i) => i);

  return (
    <div className={`flex items-center gap-[3px] h-8 ${className}`} aria-hidden="true">
      {bars.map((i) => {
        // Pseudo-random height variance for aesthetic audio graph
        const delay = (i * 0.08) % 0.8;
        const baseHeight = 25 + ((i * 37) % 65);
        return (
          <span
            key={i}
            style={{
              animationDelay: `${delay}s`,
              height: isActive ? `${baseHeight}%` : '20%',
              minHeight: '4px',
            }}
            className={`w-[3px] rounded-full transition-all duration-300 ${
              isActive
                ? variant === 'emerald'
                  ? 'bg-emerald-400 wave-bar-silver shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                  : 'bg-white wave-bar-silver shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                : 'bg-white/20'
            }`}
          />
        );
      })}
    </div>
  );
}
