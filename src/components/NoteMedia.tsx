import type { NostrEvent } from '@nostrify/nostrify';

import { VideoPlayer } from '@/components/VideoPlayer';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { useAuthor } from '@/hooks/useAuthor';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import type { ImetaEntry } from '@/lib/imeta';

/** Media content for kind 1 text notes — renders videos, audio, and webxdc apps. */
export function NoteMedia({
  videos,
  audios = [],
  imetaMap,
  webxdcApps = [],
  event,
}: {
  videos: string[];
  audios?: string[];
  imetaMap: Map<string, ImetaEntry>;
  webxdcApps?: ImetaEntry[];
  event: NostrEvent;
}) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey) ?? genUserName(event.pubkey);

  if (videos.length === 0 && audios.length === 0 && webxdcApps.length === 0) return null;

  return (
    <>
      {/* Videos — each rendered with play/pause overlay */}
      {videos.map((url, i) => (
        <VideoPlayer key={`v-${i}`} src={url} poster={imetaMap.get(url)?.thumbnail} dim={imetaMap.get(url)?.dim} blurhash={imetaMap.get(url)?.blurhash} artist={displayName} />
      ))}

      {/* Audio — rendered as visualizer with avatar */}
      {audios.map((url, i) => {
        const mime = imetaMap.get(url)?.mime;
        return (
          <AudioVisualizer
            key={`a-${i}`}
            src={url}
            mime={mime}
            avatarUrl={metadata?.picture}
            avatarFallback={displayName[0]?.toUpperCase() ?? '?'}
          />
        );
      })}

      {/* Webxdc apps */}
      {webxdcApps.map((app) => (
        <WebxdcEmbed key={app.url} url={app.url} uuid={app.webxdc} name={app.summary} icon={app.thumbnail} />
      ))}
    </>
  );
}
