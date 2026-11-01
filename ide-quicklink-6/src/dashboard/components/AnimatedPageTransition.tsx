import { useRef, useEffect, ReactNode } from 'react';
import gsap from 'gsap';

interface AnimatedPageTransitionProps {
  children: ReactNode;
  tabKey: string;
  className?: string;
}

export function AnimatedPageTransition({
  children,
  tabKey,
  className = '',
}: AnimatedPageTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Reset and animate in smoothly
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
    );
  }, [tabKey]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
