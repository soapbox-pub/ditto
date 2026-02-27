interface IntroImageProps {
  src: string;
  /** Tailwind size class, e.g. "w-40" (default) or "w-10" */
  size?: string;
  className?: string;
}

export function IntroImage({ src, size = 'w-40', className }: IntroImageProps) {
  return (
    <div
      className={`${size} shrink-0 bg-primary opacity-90 ${className ?? ''}`}
      style={{
        maskImage: `url(${src})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: `url(${src})`,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        aspectRatio: '1 / 1',
      }}
    />
  );
}
