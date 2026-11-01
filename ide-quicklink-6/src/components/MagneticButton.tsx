import { useRef, ReactNode, MouseEvent, ButtonHTMLAttributes } from 'react';
import gsap from 'gsap';
import { audioController } from '../utils/audioSynth';

interface MagneticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
  onClick?: (e?: MouseEvent<HTMLButtonElement>) => void;
  strength?: number;
  soundPitch?: number;
}

export function MagneticButton({
  children,
  className = '',
  onClick,
  strength = 0.35,
  soundPitch = 640,
  disabled,
  type = 'button',
  ...restProps
}: MagneticButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current) return;
    const { left, top, width, height } = buttonRef.current.getBoundingClientRect();
    const x = e.clientX - (left + width / 2);
    const y = e.clientY - (top + height / 2);

    gsap.to(buttonRef.current, {
      x: x * strength,
      y: y * strength,
      duration: 0.3,
      ease: 'power2.out',
    });
  };

  const handleMouseLeave = () => {
    if (!buttonRef.current) return;
    gsap.to(buttonRef.current, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: 'elastic.out(1.1, 0.4)',
    });
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    audioController.playClick(soundPitch, 0.04);
    if (onClick) onClick(e);
  };

  return (
    <button
      ref={buttonRef}
      type={type}
      disabled={disabled}
      onMouseMove={disabled ? undefined : handleMouseMove}
      onMouseLeave={disabled ? undefined : handleMouseLeave}
      onClick={handleClick}
      className={`cursor-pointer transition-colors ${className}`}
      {...restProps}
    >
      {children}
    </button>
  );
}
