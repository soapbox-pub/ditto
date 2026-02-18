import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';

interface QRCodeCanvasProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  className?: string;
}

export function QRCodeCanvas({ value, size = 256, level = 'M', className }: QRCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        errorCorrectionLevel: level,
      },
      (error) => {
        if (error) console.error('QR Code generation error:', error);
      }
    );
  }, [value, size, level]);

  return <canvas ref={canvasRef} className={className} />;
}
