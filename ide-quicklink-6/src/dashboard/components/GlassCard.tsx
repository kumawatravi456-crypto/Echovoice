import { useRef, ReactNode, MouseEvent } from 'react';
import gsap from 'gsap';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = '',
  elevated = false,
  interactive = false,
  onClick,
}: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!interactive || !cardRef.current) return;
    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    const x = e.clientX - (left + width / 2);
    const y = e.clientY - (top + height / 2);

    // Subtle 3D tilt
    gsap.to(cardRef.current, {
      rotateY: (x / width) * 5,
      rotateX: -(y / height) * 5,
      transformPerspective: 1000,
      duration: 0.3,
      ease: 'power2.out',
    });
  };

  const handleMouseLeave = () => {
    if (!interactive || !cardRef.current) return;
    gsap.to(cardRef.current, {
      rotateX: 0,
      rotateY: 0,
      duration: 0.6,
      ease: 'power2.out',
    });
  };

  const baseGlass = elevated ? 'igloo-glass-elevated' : 'igloo-glass';

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`rounded-3xl border ${baseGlass} ${
        interactive ? 'cursor-pointer hover:border-white/35 transition-all' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
