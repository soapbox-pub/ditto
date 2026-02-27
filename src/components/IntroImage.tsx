interface IntroImageProps {
  src: string;
  className?: string;
}

export function IntroImage({ src, className }: IntroImageProps) {
  return (
    <div
      className={`w-40 shrink-0 bg-primary opacity-90 ${className ?? ''}`}
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
