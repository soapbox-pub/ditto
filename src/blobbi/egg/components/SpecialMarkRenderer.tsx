import React, { memo, useMemo } from 'react';
import { cn } from '../lib/cn';

interface SpecialMarkRendererProps {
  specialMark: string;
  className?: string;
  animated?: boolean;
  opacity?: number;
}

// SVG content for each special mark with proper scaling and positioning
const SpecialMarkSVGs = {
  sigil_eye: (
    <svg viewBox="0 0 192 240" className="w-full h-full">
      <defs>
        <filter id="sigil-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="1"
            floodColor="rgba(130,85,30,0.6)"
            floodOpacity="0.8"
          />
        </filter>
      </defs>
      {/* Scaled down and repositioned to top center */}
      <g transform="translate(96, 45) scale(0.35) translate(-96, -120)">
        {/* Eye outline */}
        <path
          d="M30 120 Q96 50, 162 120 Q96 190, 30 120 Z"
          fill="none"
          stroke="rgba(130,85,30,0.6)"
          strokeWidth="3"
          filter="url(#sigil-glow)"
        />
        {/* Stylized iris */}
        <circle cx="96" cy="120" r="35" fill="rgba(130,85,30,0.25)" />
        {/* Mystical pupil */}
        <circle cx="96" cy="120" r="12" fill="rgba(80,50,20,0.7)" />
        {/* Mystical rays around iris */}
        <g stroke="rgba(130,85,30,0.4)" strokeWidth="1.5">
          <line x1="96" y1="75" x2="96" y2="55" />
          <line x1="130" y1="90" x2="150" y2="80" />
          <line x1="145" y1="140" x2="165" y2="150" />
          <line x1="32" y1="155" x2="47" y2="140" />
          <line x1="50" y1="90" x2="30" y2="80" />
        </g>
      </g>
    </svg>
  ),

  shimmer_band: (
    <svg viewBox="0 0 192 240" className="w-full h-full">
      <defs>
        <linearGradient id="grad-continuous" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#0099ff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#001144" stopOpacity="0.05" />
        </linearGradient>
        <filter id="shimmer-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00ffcc" floodOpacity="0.4" />
        </filter>
      </defs>
      {/* Left high-tech band with continuous gradient */}
      <g stroke="url(#grad-continuous)" fill="none" strokeWidth="2" filter="url(#shimmer-glow)">
        <path d="M0 100 C30 90, 40 120, 55 130 C70 140, 80 130, 96 138" />
        <path d="M0 120 C25 115, 35 135, 50 145 C65 155, 80 145, 96 150" />
      </g>
      <g fill="url(#grad-continuous)">
        <circle cx="30" cy="100" r="2.5" />
        <circle cx="40" cy="120" r="2.5" />
        <circle cx="25" cy="115" r="2.5" />
        <circle cx="35" cy="135" r="2.5" />
        <circle cx="70" cy="140" r="2.5" />
        <circle cx="80" cy="130" r="2.5" />
        <circle cx="65" cy="155" r="2.5" />
        <circle cx="80" cy="145" r="2.5" />
      </g>
      {/* Right high-tech band with same continuous gradient */}
      <g stroke="url(#grad-continuous)" fill="none" strokeWidth="2" filter="url(#shimmer-glow)">
        <path d="M192 110 C160 100, 150 130, 138 140 C125 150, 110 140, 96 138" />
        <path d="M192 130 C165 120, 152 145, 140 155 C125 165, 110 152, 96 150" />
      </g>
      <g fill="url(#grad-continuous)">
        <circle cx="160" cy="100" r="2.5" />
        <circle cx="150" cy="130" r="2.5" />
        <circle cx="165" cy="120" r="2.5" />
        <circle cx="152" cy="145" r="2.5" />
        <circle cx="125" cy="150" r="2.5" />
        <circle cx="110" cy="140" r="2.5" />
        <circle cx="125" cy="165" r="2.5" />
        <circle cx="110" cy="152" r="2.5" />
      </g>
    </svg>
  ),

  rune_top: (
    <svg viewBox="0 0 192 240" className="w-full h-full">
      <defs>
        <filter id="rune-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="1"
            floodColor="rgba(130, 85, 30, 0.7)"
            floodOpacity="0.6"
          />
        </filter>
      </defs>
      {/* Scaled down and repositioned to top center */}
      <g transform="translate(96, 40) scale(0.4) translate(-40, -40)">
        <g stroke="rgba(130, 85, 30, 0.6)" strokeWidth="2" fill="none" filter="url(#rune-glow)">
          <path d="M20 20 L20 60" />
          <path d="M40 20 L40 60" />
          <path d="M20 40 L40 40" />
          <path d="M10 60 L30 20 L50 60 Z" />
          <path d="M20 45 L40 45" />
          <path d="M10 60 C10 75, 50 75, 50 60" />
        </g>
      </g>
    </svg>
  ),

  ring_mark: (
    <svg viewBox="0 0 192 240" className="w-full h-full">
      <defs>
        <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="1"
            floodColor="rgba(130, 85, 30, 0.3)"
            floodOpacity="0.5"
          />
        </filter>
      </defs>
      {/* Organic ring with irregular borders */}
      <path
        d="M110 105 C125 105, 135 115, 135 130 C135 145, 125 155, 110 155 C95 155, 85 145, 85 130 C85 115, 95 105, 110 105 Z"
        fill="none"
        stroke="rgba(130, 85, 30, 0.18)"
        strokeWidth="3"
        filter="url(#ring-glow)"
      />
      <path
        d="M110 110 C122 110, 130 118, 130 130 C130 142, 122 150, 110 150 C98 150, 90 142, 90 130 C90 118, 98 110, 110 110 Z"
        fill="none"
        stroke="rgba(130, 85, 30, 0.10)"
        strokeWidth="2"
      />
    </svg>
  ),

  oval_spots: (
    <svg viewBox="0 0 192 240" className="w-full h-full">
      <defs>
        <filter id="spots-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
      </defs>
      {/* Wide spot with organic diffuse shape */}
      <path
        d="M60 130 C72 120, 110 120, 118 135 C122 150, 92 155, 74 145 C62 140, 54 138, 60 130 Z"
        fill="rgba(130, 85, 30, 0.25)"
        filter="url(#spots-blur)"
      />
    </svg>
  ),

  glow_crack_pattern: (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <defs>
        <filter id="crack-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00ffe0" floodOpacity="0.9" />
          <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00ffe0" floodOpacity="0.6" />
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#00ffe0" floodOpacity="0.3" />
        </filter>
      </defs>
      <g
        stroke="#00ffe0"
        strokeWidth="2"
        fill="none"
        filter="url(#crack-glow)"
        strokeLinejoin="round"
      >
        <path d="M30 30 L35 40 L28 50 L37 58 L32 67 L40 75" />
        <path d="M28 50 L23 53" strokeWidth="1" />
        <path d="M37 58 L42 62" strokeWidth="1" />
        <path d="M32 67 L30 72" strokeWidth="1" />
        <path d="M80 20 L82 30 L78 40 L84 50 L81 60 L86 68" />
        <path d="M78 40 L73 43" strokeWidth="1" />
        <path d="M84 50 L88 53" strokeWidth="1" />
        <path d="M81 60 L79 65" strokeWidth="1" />
        <path d="M130 90 L135 95 L130 100 L136 105 L131 110 L137 115" />
        <path d="M130 100 L125 102" strokeWidth="1" />
        <path d="M136 105 L140 108" strokeWidth="1" />
        <path d="M131 110 L129 115" strokeWidth="1" />
        <path d="M170 150 L165 160 L172 170 L163 178 L168 185 L160 190" />
        <path d="M172 170 L177 173" strokeWidth="1" />
        <path d="M163 178 L158 182" strokeWidth="1" />
        <path d="M168 185 L170 190" strokeWidth="1" />
      </g>
    </svg>
  ),

  dot_center: (
    <svg viewBox="0 0 192 240" className="w-full h-full">
      <defs>
        <filter id="dot-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
      </defs>
      {/* Irregular and soft central spot */}
      <path
        d="M90 112 C95 108, 105 110, 107 118 C108 124, 100 128, 92 127 C86 126, 84 120, 90 112 Z"
        fill="rgba(120, 75, 30, 0.22)"
        filter="url(#dot-blur)"
      />
    </svg>
  ),
};

// Animation variants for different special marks
const getAnimationClasses = (specialMark: string, animated: boolean) => {
  if (!animated) return '';

  switch (specialMark) {
    case 'sigil_eye':
      return 'animate-pulse';
    case 'shimmer_band':
      return ''; // shimmer_band should always be static and centered
    case 'glow_crack_pattern':
      return 'animate-glow-pulse';
    case 'rune_top':
      return 'animate-rune-glow';
    default:
      return '';
  }
};

// Performance optimization: memoize the SVG content
const MemoizedSVG = memo(
  ({
    specialMark,
    className,
    animated,
    opacity = 1,
  }: {
    specialMark: string;
    className: string;
    animated: boolean;
    opacity: number;
  }) => {
    const svgContent = SpecialMarkSVGs[specialMark as keyof typeof SpecialMarkSVGs];
    const animationClass = getAnimationClasses(specialMark, animated);

    if (!svgContent) return null;

    return (
      <div className={cn(className, animationClass)} style={{ opacity }}>
        {svgContent}
      </div>
    );
  }
);

MemoizedSVG.displayName = 'MemoizedSVG';

export const SpecialMarkRenderer: React.FC<SpecialMarkRendererProps> = ({
  specialMark,
  className,
  animated = false,
  opacity = 1,
}) => {
  // Memoize positioning and sizing calculations
  const markStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      pointerEvents: 'none' as const,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 10,
    }),
    []
  );

  // Check if the special mark is supported
  if (!SpecialMarkSVGs[specialMark as keyof typeof SpecialMarkSVGs]) {
    console.warn(`Unsupported special mark: ${specialMark}`);
    return null;
  }

  return (
    <div style={markStyle} className={cn('special-mark-container', className)}>
      <MemoizedSVG
        specialMark={specialMark}
        className="w-full h-full"
        animated={animated}
        opacity={opacity}
      />
    </div>
  );
};

// Fallback component for unsupported browsers or low-power devices
export const SpecialMarkFallback: React.FC<{
  specialMark: string;
  className?: string;
}> = ({ specialMark, className }) => {
  const fallbackStyle = useMemo(() => {
    const baseStyle = {
      position: 'absolute' as const,
      pointerEvents: 'none' as const,
    };

    // Simple fallback shapes for each mark type
    switch (specialMark) {
      case 'dot_center':
        return {
          ...baseStyle,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '8px',
          height: '8px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '50%',
        };
      case 'ring_mark':
        return {
          ...baseStyle,
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '20px',
          height: '20px',
          border: '2px solid rgba(0, 0, 0, 0.2)',
          borderRadius: '50%',
        };

      default:
        return {
          ...baseStyle,
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '12px',
          height: '8px',
          background: 'rgba(130, 85, 30, 0.3)',
          borderRadius: '50%',
        };
    }
  }, [specialMark]);

  if (!fallbackStyle) return null;

  return <div style={fallbackStyle} className={className} />;
};
