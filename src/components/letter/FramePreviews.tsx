import { FRAME_PRESETS, type FrameStyle } from '@/lib/letterTypes';

const BG = '#f5e6d3';

export function NoneFramePreview() {
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="10" y="10" width="44" height="44" fill={BG} rx="4" />
      {[20,28,36,44].map(y => <line key={y} x1="14" y1={y} x2="50" y2={y} stroke="#c4a88240" strokeWidth="0.8" />)}
      <line x1="22" y1="32" x2="42" y2="32" stroke="#c4a882" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EmojiFramePreview({ frameId }: { frameId: FrameStyle }) {
  const preset = FRAME_PRESETS.find(f => f.id === frameId);
  if (!preset?.emojis || !preset.bgColor) return null;

  const positions = [
    {x:5,y:6},{x:15,y:4},{x:25,y:7},{x:35,y:4},{x:45,y:6},{x:55,y:5},
    {x:5,y:58},{x:15,y:60},{x:25,y:57},{x:35,y:60},{x:45,y:58},{x:55,y:59},
    {x:4,y:18},{x:6,y:30},{x:4,y:42},{x:6,y:52},
    {x:58,y:18},{x:60,y:30},{x:58,y:42},{x:60,y:52},
    {x:8,y:10},{x:56,y:10},{x:8,y:54},{x:56,y:54},
  ];

  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="0" y="0" width="64" height="64" fill={preset.bgColor} rx="8" />
      {positions.map((p, i) => (
        <text key={i} x={p.x} y={p.y} fontSize="8" textAnchor="middle" dominantBaseline="central">
          {preset.emojis![i % preset.emojis!.length]}
        </text>
      ))}
      <rect x="10" y="10" width="44" height="44" fill={BG} rx="4" />
      {[20,28,36,44].map(y => <line key={y} x1="14" y1={y} x2="50" y2={y} stroke="#c4a88240" strokeWidth="0.8" />)}
    </svg>
  );
}
