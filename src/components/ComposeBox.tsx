import { lazy, Suspense, useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Paperclip, Smile, AlertTriangle, X, Loader2, Mic, Square, Sticker, BarChart3, Plus, ChevronLeft } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { encode as blurhashEncode } from 'blurhash';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { GifPicker } from '@/components/GifPicker';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { EmojiShortcodeAutocomplete } from '@/components/EmojiShortcodeAutocomplete';

import { NoteContent } from '@/components/NoteContent';
import { NoteMedia } from '@/components/NoteMedia';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePostComment } from '@/hooks/usePostComment';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import type { EventStats } from '@/hooks/useTrending';
import { cn } from '@/lib/utils';
import { extractVideoUrls, extractAudioUrls, IMETA_MEDIA_URL_REGEX, mimeFromExt } from '@/lib/mediaUrls';

/** Lazy-loaded EmojiPicker — keeps emoji-mart + its data out of the main bundle. */
const LazyEmojiPicker = lazy(() => import('@/components/EmojiPicker').then(m => ({ default: m.EmojiPicker })));
import { parseImetaMap } from '@/lib/imeta';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useInsertText } from '@/hooks/useInsertText';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { formatTime } from '@/lib/formatTime';
import { DITTO_RELAY } from '@/lib/appRelays';
import { resizeImage } from '@/lib/resizeImage';

const MAX_CHARS = 5000;

/** Short random ID for poll options. */
function pollOptionId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * For an image File, returns `{ dim: "WxH", blurhash: "..." }`.
 * Decodes to a small canvas (max 64px wide) for speed — large enough
 * for a good blurhash sample but cheap to compute.
 * Returns an empty object for non-image files or if anything fails.
 */
async function getImageMeta(file: File): Promise<{ dim?: string; blurhash?: string }> {
  if (!file.type.startsWith('image/')) return {};
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });

      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      if (!naturalWidth || !naturalHeight) return {};

      const dim = `${naturalWidth}x${naturalHeight}`;

      // Downsample for blurhash encoding — 64px wide keeps it fast
      const SAMPLE_W = 64;
      const scale = SAMPLE_W / naturalWidth;
      const sampleW = SAMPLE_W;
      const sampleH = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { dim };

      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

      // componentX/Y: 4x3 gives a good balance of detail vs hash length
      const blurhash = blurhashEncode(data, sampleW, sampleH, 4, 3);
      return { dim, blurhash };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return {};
  }
}

interface ComposeBoxProps {
  onSuccess?: () => void;
  placeholder?: string;
  compact?: boolean;
  /** Event being replied to – adds NIP-10 reply tags when set. A URL triggers NIP-22 comment mode. */
  replyTo?: NostrEvent | URL;
  /** Event being quoted – shows embedded preview and adds quote tags. */
  quotedEvent?: NostrEvent;
  /** If true, the compose area is always expanded (e.g. inside a modal). */
  forceExpanded?: boolean;
  /** If true, hides the avatar (useful inside modals with their own layout). */
  hideAvatar?: boolean;
  /** Controlled preview mode (for modal usage). */
  previewMode?: boolean;
  /** Callback to notify parent of previewable content changes. */
  onHasPreviewableContentChange?: (hasContent: boolean) => void;
  /** Pre-filled content for the compose box. */
  initialContent?: string;
  /** Open directly in poll mode. */
  initialMode?: 'post' | 'poll';
}

/** Circular progress ring for character count. */
function CharRing({ count, max }: { count: number; max: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(count / max, 1);
  const offset = circumference * (1 - ratio);
  const overLimit = count > max;
  const nearLimit = count > max * 0.9;

  return (
    <div className="relative flex items-center justify-center size-7">
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
        {/* Background ring */}
        <circle
          cx="14" cy="14" r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-secondary"
        />
        {/* Progress ring */}
        <circle
          cx="14" cy="14" r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-150',
            overLimit ? 'stroke-destructive' : nearLimit ? 'stroke-amber-500' : 'stroke-primary',
          )}
        />
      </svg>
    </div>
  );
}


export function ComposeBox({ 
  onSuccess, 
  placeholder = "What's on your mind?", 
  compact = false, 
  replyTo, 
  quotedEvent, 
  forceExpanded = false, 
  hideAvatar = false,
  previewMode: controlledPreviewMode,
  onHasPreviewableContentChange,
  initialContent = '',
  initialMode = 'post',
}: ComposeBoxProps) {
  const { user, metadata, isLoading: isProfileLoading } = useCurrentUser();
  const avatarShape = getAvatarShape(metadata);
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const { mutateAsync: createEvent, isPending, isPending: isPollPending } = useNostrPublish();
  const { mutateAsync: postComment, isPending: isCommentPending } = usePostComment();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { feedSettings } = useFeedSettings();
  const customEmojisEnabled = feedSettings.showCustomEmojis !== false;
  const { emojis: allCustomEmojis } = useCustomEmojis();
  const customEmojis = useMemo(() => customEmojisEnabled ? allCustomEmojis : [], [customEmojisEnabled, allCustomEmojis]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { config } = useAppContext();
  const imageQuality = config.imageQuality;

  const [content, setContent] = useState(initialContent);
  const [expanded, setExpanded] = useState(false);
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cwText, setCwText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'gif' | 'stickers'>('emoji');
  const [trayOpen, setTrayOpen] = useState(false);
  const [internalPreviewMode, setInternalPreviewMode] = useState(false);

  // Poll mode state
  const [mode, setMode] = useState<'post' | 'poll'>(initialMode);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState([
    { id: pollOptionId(), label: '' },
    { id: pollOptionId(), label: '' },
  ]);
  const [pollType, setPollType] = useState<'singlechoice' | 'multiplechoice'>('singlechoice');
  const [pollDuration, setPollDuration] = useState<7 | 3 | 1 | 0>(7);
  const [removedEmbeds, setRemovedEmbeds] = useState<Set<string>>(new Set());
  const [_uploadedFileTags, setUploadedFileTags] = useState<string[][]>([]);
  /** Maps uploaded file URLs to their NIP-94 tags (grouped per upload). */
  const [uploadedFileGroups, setUploadedFileGroups] = useState<Map<string, string[][]>>(new Map());
  /** Maps .xdc URLs to their generated webxdc UUIDs. */
  const [webxdcUuids, setWebxdcUuids] = useState<Map<string, string>>(new Map());
  /** Maps .xdc URLs to extracted metadata (name + icon URL). */
  const [webxdcMetas, setWebxdcMetas] = useState<Map<string, { name?: string; iconUrl?: string }>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { insertAtCursor, insertEmoji: insertEmojiAtCursor } = useInsertText(textareaRef, content, setContent);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording
  const voiceRecorder = useVoiceRecorder();
  const [isPublishingVoice, setIsPublishingVoice] = useState(false);

  const resetComposeState = useCallback(() => {
    setContent('');
    setCwEnabled(false);
    setCwText('');
    setExpanded(false);
    setPickerOpen(false);
    setTrayOpen(false);
    setInternalPreviewMode(false);
    setMode(initialMode);
    setPollQuestion('');
    setPollOptions([{ id: pollOptionId(), label: '' }, { id: pollOptionId(), label: '' }]);
    setPollType('singlechoice');
    setPollDuration(7);
    setRemovedEmbeds(new Set());
    setUploadedFileTags([]);
    setUploadedFileGroups(new Map());
    setWebxdcUuids(new Map());
    setWebxdcMetas(new Map());
  }, [initialMode]);

  // Use controlled preview mode if provided, otherwise use internal state
  const previewMode = controlledPreviewMode !== undefined ? controlledPreviewMode : internalPreviewMode;

  // Auto-expand when quotedEvent is provided
  useEffect(() => {
    if (quotedEvent) {
      setExpanded(true);
    }
  }, [quotedEvent]);

  // Auto-resize textarea height as content grows/shrinks
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Reset to auto so shrinking is detected correctly
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const charCount = content.length;
  const remaining = MAX_CHARS - charCount;

  const expand = useCallback(() => {
    if (!expanded) setExpanded(true);
  }, [expanded]);



  // Detect embeds in content (nevent, note, naddr, URLs) with their positions
  const detectedEmbeds = useMemo(() => {
    const embeds: Array<{ 
      type: 'nevent' | 'note' | 'naddr' | 'link'; 
      value: string; 
      index: number;
      eventId?: string; 
      addr?: { kind: number; pubkey: string; identifier: string } 
    }> = [];
    
    // Detect nostr: URIs
    const nostrMatches = content.matchAll(/nostr:(nevent1|note1|naddr1)[023456789acdefghjklmnpqrstuvwxyz]+/g);
    for (const match of nostrMatches) {
      const bech32 = match[0].slice('nostr:'.length);
      try {
        const decoded = nip19.decode(bech32);
        if (decoded.type === 'nevent') {
          embeds.push({ type: 'nevent', value: match[0], index: match.index!, eventId: decoded.data.id });
        } else if (decoded.type === 'note') {
          embeds.push({ type: 'note', value: match[0], index: match.index!, eventId: decoded.data });
        } else if (decoded.type === 'naddr') {
          embeds.push({ 
            type: 'naddr', 
            value: match[0], 
            index: match.index!,
            addr: { 
              kind: decoded.data.kind, 
              pubkey: decoded.data.pubkey, 
              identifier: decoded.data.identifier 
            } 
          });
        }
      } catch {
        // Invalid bech32, skip
      }
    }

    // Detect raw NIP-19 identifiers (without nostr: prefix)
    const rawNip19Matches = content.matchAll(/\b(nevent1|note1|naddr1)[023456789acdefghjklmnpqrstuvwxyz]+\b/g);
    for (const match of rawNip19Matches) {
      const bech32 = match[0];
      // Skip if it's already prefixed with nostr: (already handled above)
      const beforeIndex = match.index! - 6;
      const before = content.substring(Math.max(0, beforeIndex), match.index);
      if (before.endsWith('nostr:')) continue;
      
      try {
        const decoded = nip19.decode(bech32);
        if (decoded.type === 'nevent') {
          embeds.push({ type: 'nevent', value: match[0], index: match.index!, eventId: decoded.data.id });
        } else if (decoded.type === 'note') {
          embeds.push({ type: 'note', value: match[0], index: match.index!, eventId: decoded.data });
        } else if (decoded.type === 'naddr') {
          embeds.push({ 
            type: 'naddr', 
            value: match[0], 
            index: match.index!,
            addr: { 
              kind: decoded.data.kind, 
              pubkey: decoded.data.pubkey, 
              identifier: decoded.data.identifier 
            } 
          });
        }
      } catch {
        // Invalid bech32, skip
      }
    }

    // Detect regular URLs (but not image/video URLs that will be rendered inline)
    const urlMatches = content.matchAll(/https?:\/\/[^\s]+/g);
    for (const match of urlMatches) {
      const url = match[0];
      // Skip media URLs that render inline
      // Note: SVGs not excluded - LinkPreview checks content-type and handles both cases
      if (!IMETA_MEDIA_URL_REGEX.test(url)) {
        embeds.push({ type: 'link', value: url, index: match.index! });
      }
    }

    // Sort by position in content
    return embeds.sort((a, b) => a.index - b.index);
  }, [content]);

  // Filter out removed embeds
  const visibleEmbeds = useMemo(() => 
    detectedEmbeds.filter(embed => !removedEmbeds.has(embed.value)),
    [detectedEmbeds, removedEmbeds]
  );

  // Extract videos for preview mode
  const previewVideos = useMemo(() => content ? extractVideoUrls(content) : [], [content]);

  // Extract audio for preview mode
  const previewAudios = useMemo(() => content ? extractAudioUrls(content) : [], [content]);

  // Detect inline images for preview mode
  const hasPreviewImages = useMemo(() => {
    if (!content) return false;
    return /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|avif)(\?[^\s]*)?/i.test(content);
  }, [content]);

  // Detect nostr:npub/nprofile mentions in content
  const hasMentions = useMemo(() => {
    return /nostr:(npub1|nprofile1)[023456789acdefghjklmnpqrstuvwxyz]+/.test(content);
  }, [content]);

  // Detect custom emojis in content for preview mode
  const hasCustomEmojis = useMemo(() => {
    if (customEmojis.length === 0 || !content) return false;
    const emojiSet = new Set(customEmojis.map((e) => e.shortcode));
    const matches = content.matchAll(/:([a-zA-Z0-9_-]+):/g);
    for (const match of matches) {
      if (emojiSet.has(match[1])) return true;
    }
    return false;
  }, [content, customEmojis]);

  // Detect webxdc attachments for preview mode
  const hasWebxdc = useMemo(() => webxdcUuids.size > 0, [webxdcUuids]);

  // Check if content has any previewable content (link previews, images, videos, audio, webxdc, mentions, or custom emojis)
  const hasPreviewableContent = useMemo(() => {
    return visibleEmbeds.length > 0 || hasPreviewImages || previewVideos.length > 0 || previewAudios.length > 0 || hasWebxdc || hasMentions || hasCustomEmojis;
  }, [visibleEmbeds, hasPreviewImages, previewVideos, previewAudios, hasWebxdc, hasMentions, hasCustomEmojis]);

  // Notify parent of previewable content changes
  useEffect(() => {
    if (onHasPreviewableContentChange) {
      onHasPreviewableContentChange(hasPreviewableContent);
    }
  }, [hasPreviewableContent, onHasPreviewableContentChange]);

  // Include quoted event if provided and not removed.
  // Use naddr for addressable events (kinds 30000-39999) so the reference
  // stays stable across event updates; use nevent for everything else.
  const quotedEventNip19 = useMemo(() => {
    if (!quotedEvent) return null;
    if (quotedEvent.kind >= 30000 && quotedEvent.kind < 40000) {
      const dTag = quotedEvent.tags.find(([name]) => name === 'd')?.[1] ?? '';
      return nip19.naddrEncode({
        kind: quotedEvent.kind,
        pubkey: quotedEvent.pubkey,
        identifier: dTag,
        relays: [DITTO_RELAY],
      });
    }
    return nip19.neventEncode({ id: quotedEvent.id, author: quotedEvent.pubkey, relays: [DITTO_RELAY] });
  }, [quotedEvent]);
  const quotedEventKey = quotedEventNip19 ? `nostr:${quotedEventNip19}` : null;
  const showQuotedEvent = quotedEvent && quotedEventKey && !removedEmbeds.has(quotedEventKey);

  // Create mock event for preview
  const mockEvent = useMemo(() => {
    if (!user || !content) return null;
    
    const hashtags = content.match(/#[\p{L}\p{N}_]+/gu)?.map((t) => t.slice(1)) || [];
    const tags: string[][] = hashtags.map((t) => ['t', t.toLowerCase()]);

    // NIP-30: Add emoji tags for custom emojis referenced in content
    if (customEmojis.length > 0) {
      const emojiMap = new Map(customEmojis.map((e) => [e.shortcode, e.url]));
      const shortcodeRegex = /:([a-zA-Z0-9_-]+):/g;
      const usedEmojis = new Set<string>();
      let match;
      while ((match = shortcodeRegex.exec(content)) !== null) {
        const shortcode = match[1];
        if (emojiMap.has(shortcode) && !usedEmojis.has(shortcode)) {
          usedEmojis.add(shortcode);
          tags.push(['emoji', shortcode, emojiMap.get(shortcode)!]);
        }
      }
    }

    // NIP-92: Build imeta tags for uploaded media so preview can render them
    const mediaUrlMatches = content.matchAll(new RegExp(IMETA_MEDIA_URL_REGEX.source, 'gi'));
    const processedUrls = new Set<string>();
    for (const m of mediaUrlMatches) {
      const url = m[0];
      if (processedUrls.has(url)) continue;
      processedUrls.add(url);
      const ext = m[1].toLowerCase();
      const isWebxdc = ext === 'xdc';
      const fileTags = uploadedFileGroups.get(url);
      if (fileTags) {
        const imetaFields = fileTags.map(tag => `${tag[0]} ${tag[1]}`);
        if (isWebxdc) {
          const filtered = imetaFields.filter(f => !f.startsWith('m '));
          filtered.push('m application/x-webxdc');
          const uuid = webxdcUuids.get(url);
          if (uuid) filtered.push(`webxdc ${uuid}`);
          const meta = webxdcMetas.get(url);
          if (meta?.name) filtered.push(`summary ${meta.name}`);
          if (meta?.iconUrl) filtered.push(`image ${meta.iconUrl}`);
          tags.push(['imeta', ...filtered]);
        } else {
          tags.push(['imeta', ...imetaFields]);
        }
      } else {
        const mimeType = mimeFromExt(ext);
        const imetaTag = ['imeta', `url ${url}`, `m ${mimeType}`];
        if (isWebxdc) {
          const uuid = webxdcUuids.get(url);
          if (uuid) imetaTag.push(`webxdc ${uuid}`);
          const meta = webxdcMetas.get(url);
          if (meta?.name) imetaTag.push(`summary ${meta.name}`);
          if (meta?.iconUrl) imetaTag.push(`image ${meta.iconUrl}`);
        }
        tags.push(imetaTag);
      }
    }
    
    return {
      id: 'preview',
      pubkey: user.pubkey,
      content: content.trim(),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags,
      sig: '',
    };
  }, [user, content, customEmojis, uploadedFileGroups, webxdcUuids, webxdcMetas]);

  const insertEmoji = useCallback((emoji: string) => {
    insertEmojiAtCursor(emoji);
    expand();
  }, [insertEmojiAtCursor, expand]);

  const handleInsertMention = insertAtCursor;

  const handleInsertShortcodeEmoji = insertAtCursor;

  const handleFileUpload = useCallback(async (file: File) => {
    try {
      // .xdc files are ZIP archives; browsers don't know their MIME type so file.type is ''.
      // Blossom servers may reject uploads with an empty Content-Type, so we re-wrap the file
      // with the correct MIME type before uploading.
      const isXdc = file.name.endsWith('.xdc');
      const isImage = file.type.startsWith('image/');

      let uploadableFile: File;
      let resizedDim: string | undefined;

      if (isXdc && !file.type) {
        uploadableFile = new File([file], file.name, { type: 'application/x-webxdc' });
      } else if (isImage && imageQuality === 'compressed') {
        // Resize & optimize images before uploading for better performance.
        const resized = await resizeImage(file);
        uploadableFile = resized.file;
        resizedDim = resized.dimensions;
      } else {
        uploadableFile = file;
      }

      const tags = await uploadFile(uploadableFile);
      let [[, url]] = tags;

      // Blossom returns hash-based URLs that may lack the original file extension.
      // Append the extension so downstream media-URL detection and imeta generation work.
      if (isXdc && !url.endsWith('.xdc')) {
        url = url + '.xdc';
        // Update the url tag in the NIP-94 tags to match
        const urlTag = tags.find(t => t[0] === 'url');
        if (urlTag) urlTag[1] = url;
      }

      // Compute dim + blurhash and inject into NIP-94 tags
      if (!isXdc && isImage) {
        // Use dimensions from resizeImage; compute blurhash from the resized file
        if (resizedDim) tags.push(['dim', resizedDim]);
        const { blurhash } = await getImageMeta(uploadableFile);
        if (blurhash) tags.push(['blurhash', blurhash]);
      }

      // Store the full NIP-94 tags for later use in imeta
      setUploadedFileTags((prev) => [...prev, ...tags]);
      setUploadedFileGroups((prev) => new Map(prev).set(url, tags));
      setContent((prev) => (prev ? prev + '\n' + url : url));

      // For .xdc files, generate a UUID and extract manifest metadata
      if (isXdc) {
        const uuid = crypto.randomUUID();
        setWebxdcUuids((prev) => new Map(prev).set(url, uuid));

        // Extract name and icon from the .xdc archive
        try {
          const { extractWebxdcMeta } = await import('@/lib/webxdcMeta');
          const meta = await extractWebxdcMeta(file);
          const metaEntry: { name?: string; iconUrl?: string } = { name: meta.name };

          // Upload the icon to Blossom if present
          if (meta.iconFile) {
            try {
              const iconTags = await uploadFile(meta.iconFile);
              const [[, iconUrl]] = iconTags;
              metaEntry.iconUrl = iconUrl;
            } catch {
              // Icon upload failed — continue without it
            }
          }

          setWebxdcMetas((prev) => new Map(prev).set(url, metaEntry));
        } catch {
          // Metadata extraction failed — continue without it
        }
      }

      expand();
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload file.', variant: 'destructive' });
    }
  }, [uploadFile, expand, toast, imageQuality]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for image files in clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevent default paste behavior for images
        const file = item.getAsFile();
        if (file) {
          await handleFileUpload(file);
        }
        break;
      }
    }
  }, [handleFileUpload]);

  /** Start voice recording. */
  const handleStartRecording = useCallback(async () => {
    try {
      await voiceRecorder.startRecording();
      expand();
    } catch {
      toast({ title: 'Microphone access denied', description: 'Please allow microphone access to record voice messages.', variant: 'destructive' });
    }
  }, [voiceRecorder, expand, toast]);

  /** Stop recording, upload, and publish as kind 1222 or 1244. */
  const handleStopAndPublishVoice = useCallback(async () => {
    if (!user) return;
    setIsPublishingVoice(true);
    try {
      const recording = await voiceRecorder.stopRecording();
      if (!recording) return;

      // Determine file extension from MIME type
      const extMap: Record<string, string> = {
        'audio/mp4': '.m4a',
        'audio/mp4;codecs=aac': '.m4a',
        'audio/aac': '.aac',
        'audio/webm;codecs=opus': '.webm',
        'audio/webm': '.webm',
        'audio/ogg;codecs=opus': '.ogg',
      };
      const ext = extMap[recording.mimeType] ?? '.webm';
      const fileName = `voice-message-${Date.now()}${ext}`;
      const file = new File([recording.blob], fileName, { type: recording.mimeType });

      // Upload to Blossom
      const tags = await uploadFile(file);
      const [[, audioUrl]] = tags;

      // Build NIP-A0 imeta tag with waveform and duration
      const imetaFields = [
        `url ${audioUrl}`,
        `m ${recording.mimeType}`,
        `waveform ${recording.waveform.join(' ')}`,
        `duration ${Math.round(recording.duration)}`,
      ];
      const imetaTag = ['imeta', ...imetaFields];

      // Determine kind: 1244 for NIP-22 replies, 1222 for root messages
      const isNip22Reply = replyTo && (replyTo instanceof URL || replyTo.kind !== 1);
      const isKind1Reply = replyTo && !(replyTo instanceof URL) && replyTo.kind === 1;

      if (isNip22Reply) {
        // NIP-22 voice reply (kind 1244) — use postComment infrastructure
        // but we need to publish kind 1244 directly since postComment uses kind 1111
        // Build NIP-22 tags manually
        const voiceTags: string[][] = [imetaTag];

        if (replyTo instanceof URL) {
          voiceTags.push(['I', replyTo.toString()]);
          voiceTags.push(['K', replyTo.protocol === 'http:' || replyTo.protocol === 'https:' ? 'web' : replyTo.protocol.replace(/:$/, '')]);
          // lowercase reply tags pointing to same root
          voiceTags.push(['i', replyTo.toString()]);
          voiceTags.push(['k', replyTo.protocol === 'http:' || replyTo.protocol === 'https:' ? 'web' : replyTo.protocol.replace(/:$/, '')]);
        } else {
          voiceTags.push(['E', replyTo.id]);
          voiceTags.push(['K', replyTo.kind.toString()]);
          voiceTags.push(['P', replyTo.pubkey]);
          // lowercase reply tags
          voiceTags.push(['e', replyTo.id]);
          voiceTags.push(['k', replyTo.kind.toString()]);
          voiceTags.push(['p', replyTo.pubkey]);
        }

        await createEvent({
          kind: 1244,
          content: audioUrl,
          tags: voiceTags,
        });
      } else if (isKind1Reply && !(replyTo instanceof URL)) {
        // NIP-10 voice reply to a kind 1 note — still publish as kind 1222 with reply tags
        const voiceTags: string[][] = [imetaTag];
        const rootTag = replyTo.tags.find(([name, , , marker]) => name === 'e' && marker === 'root');
        if (rootTag) {
          voiceTags.push(['e', rootTag[1], rootTag[2] || DITTO_RELAY, 'root', ...(rootTag[4] ? [rootTag[4]] : [])]);
          voiceTags.push(['e', replyTo.id, DITTO_RELAY, 'reply', replyTo.pubkey]);
        } else {
          voiceTags.push(['e', replyTo.id, DITTO_RELAY, 'root', replyTo.pubkey]);
        }
        voiceTags.push(['p', replyTo.pubkey]);

        await createEvent({
          kind: 1222,
          content: audioUrl,
          tags: voiceTags,
        });
      } else {
        // Root voice message (kind 1222)
        await createEvent({
          kind: 1222,
          content: audioUrl,
          tags: [imetaTag],
        });
      }

      // Reset state
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      if (replyTo) {
        if (replyTo instanceof URL) {
          queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] });
        } else {
          queryClient.invalidateQueries({ queryKey: ['replies', replyTo.id] });
          if (replyTo.kind !== 1) {
            queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] });
          }
        }
      }
      toast({ title: 'Voice message sent!', description: 'Your voice message has been published.' });
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to send voice message.', variant: 'destructive' });
    } finally {
      setIsPublishingVoice(false);
    }
  }, [user, voiceRecorder, uploadFile, createEvent, replyTo, queryClient, toast, onSuccess]);

  const handleSubmit = async () => {
    if (!content.trim() || !user || charCount > MAX_CHARS) return;

    try {
      const hashtags = content.match(/#[\p{L}\p{N}_]+/gu)?.map((t) => t.slice(1)) || [];
      const tags: string[][] = hashtags.map((t) => ['t', t.toLowerCase()]);

      // NIP-27 mention p tags — extract nostr:npub1... from content
      const mentionMatches = content.matchAll(/nostr:(npub1[023456789acdefghjklmnpqrstuvwxyz]+)/g);
      const mentionedPubkeys = new Set<string>();
      for (const match of mentionMatches) {
        try {
          const decoded = nip19.decode(match[1]);
          if (decoded.type === 'npub') {
            mentionedPubkeys.add(decoded.data);
          }
        } catch {
          // Invalid bech32, skip
        }
      }
      // Don't include ourselves
      mentionedPubkeys.delete(user.pubkey);
      for (const pk of mentionedPubkeys) {
        tags.push(['p', pk]);
      }

      // Reply tags: NIP-10 for kind 1 targets, NIP-22 for non-kind-1 targets and URLs
      const isNip22Reply = replyTo && (replyTo instanceof URL || replyTo.kind !== 1);

      if (replyTo && !isNip22Reply && !(replyTo instanceof URL)) {
        // NIP-10 reply tags (kind 1 targets only)
        const rootTag = replyTo.tags.find(([name, , , marker]) => name === 'e' && marker === 'root');
        if (rootTag) {
          // replyTo is itself a reply – preserve the root and mark replyTo as reply
          tags.push(['e', rootTag[1], rootTag[2] || DITTO_RELAY, 'root', ...(rootTag[4] ? [rootTag[4]] : [])]);
          tags.push(['e', replyTo.id, DITTO_RELAY, 'reply', replyTo.pubkey]);
        } else {
          // replyTo is a top-level note – it becomes the root
          tags.push(['e', replyTo.id, DITTO_RELAY, 'root', replyTo.pubkey]);
        }

        // Add p tags: original author + all existing p tags from the parent
        // Skip pubkeys already added by mention detection above
        const pPubkeys = new Set<string>();
        pPubkeys.add(replyTo.pubkey);
        for (const tag of replyTo.tags) {
          if (tag[0] === 'p' && tag[1]) pPubkeys.add(tag[1]);
        }
        // Don't include ourselves or already-mentioned pubkeys
        if (user.pubkey) pPubkeys.delete(user.pubkey);
        for (const pk of mentionedPubkeys) pPubkeys.delete(pk);
        for (const pk of pPubkeys) {
          tags.push(['p', pk]);
        }
      }

      // Quote tags (if quoted event and not removed)
      // Per NIP-18, quotes should use the q tag and include the nostr: URI in content.
      // For addressable events (kinds 30000-39999), use event address coordinates
      // so the reference stays stable across event updates.
      let finalContent = content.trim();
      if (showQuotedEvent && quotedEvent && quotedEventNip19) {
        if (quotedEvent.kind >= 30000 && quotedEvent.kind < 40000) {
          const dTag = quotedEvent.tags.find(([name]) => name === 'd')?.[1] ?? '';
          tags.push(['q', `${quotedEvent.kind}:${quotedEvent.pubkey}:${dTag}`, DITTO_RELAY]);
        } else {
          tags.push(['q', quotedEvent.id, DITTO_RELAY, quotedEvent.pubkey]);
        }
        // Add the nostr: URI to the content if not already present
        const quoteUri = `nostr:${quotedEventNip19}`;
        if (!finalContent.includes(quoteUri)) {
          finalContent = finalContent + '\n\n' + quoteUri;
        }
      }

      // NIP-36: content warning
      if (cwEnabled) {
        tags.push(['content-warning', cwText || '']);
        tags.push(['L', 'content-warning']);
        if (cwText) {
          tags.push(['l', cwText, 'content-warning']);
        }
      }

      // NIP-30: Add emoji tags for custom emojis referenced in content
      if (customEmojis.length > 0) {
        const emojiMap = new Map(customEmojis.map((e) => [e.shortcode, e.url]));
        const shortcodeRegex = /:([a-zA-Z0-9_-]+):/g;
        const usedEmojis = new Set<string>();
        let emojiMatch;
        while ((emojiMatch = shortcodeRegex.exec(finalContent)) !== null) {
          const shortcode = emojiMatch[1];
          if (emojiMap.has(shortcode) && !usedEmojis.has(shortcode)) {
            usedEmojis.add(shortcode);
            tags.push(['emoji', shortcode, emojiMap.get(shortcode)!]);
          }
        }
      }

      // NIP-92: Add imeta tags for media URLs in content
      const mediaUrlMatches = finalContent.matchAll(new RegExp(IMETA_MEDIA_URL_REGEX.source, 'gi'));
      const processedUrls = new Set<string>();
      
      for (const match of mediaUrlMatches) {
        const url = match[0];
        if (processedUrls.has(url)) continue;
        processedUrls.add(url);
        
        const ext = match[1].toLowerCase();
        const isWebxdc = ext === 'xdc';

        // Build imeta from grouped upload tags if available, otherwise infer
        const fileTags = uploadedFileGroups.get(url);
        
        if (fileTags) {
          const imetaFields = fileTags.map(tag => `${tag[0]} ${tag[1]}`);

          if (isWebxdc) {
            // Override MIME type for .xdc files and add webxdc UUID + metadata
            const filtered = imetaFields.filter(f => !f.startsWith('m '));
            filtered.push('m application/x-webxdc');
            const uuid = webxdcUuids.get(url);
            if (uuid) filtered.push(`webxdc ${uuid}`);
            const meta = webxdcMetas.get(url);
            if (meta?.name) filtered.push(`summary ${meta.name}`);
            if (meta?.iconUrl) filtered.push(`image ${meta.iconUrl}`);
            tags.push(['imeta', ...filtered]);
          } else {
            tags.push(['imeta', ...imetaFields]);
          }
        } else {
          // Fallback: basic imeta tag with URL and inferred mime type
          const mimeType = mimeFromExt(ext);
          
          const imetaTag = ['imeta', `url ${url}`, `m ${mimeType}`];
          if (isWebxdc) {
            const uuid = webxdcUuids.get(url);
            if (uuid) imetaTag.push(`webxdc ${uuid}`);
            const meta = webxdcMetas.get(url);
            if (meta?.name) imetaTag.push(`summary ${meta.name}`);
            if (meta?.iconUrl) imetaTag.push(`image ${meta.iconUrl}`);
          }
          tags.push(imetaTag);
        }
      }



      if (isNip22Reply) {
        // NIP-22: use usePostComment for non-kind-1 targets and URL roots
        // Determine root and reply params for the comment hook
        let root: NostrEvent | URL | `#${string}`;
        let reply: NostrEvent | undefined;

        if (replyTo instanceof URL) {
          // External content root — the URL is the root directly
          root = replyTo;
        } else if (replyTo.kind === 1111) {
          // Replying to a comment: replyTo is the parent, root is derived from its uppercase tags
          reply = replyTo;

          // Reconstruct the original root from the comment's uppercase tags
          const K = replyTo.tags.find(([n]) => n === 'K')?.[1];
          const P = replyTo.tags.find(([n]) => n === 'P')?.[1];
          const A = replyTo.tags.find(([n]) => n === 'A')?.[1];
          const E = replyTo.tags.find(([n]) => n === 'E')?.[1];
          const I = replyTo.tags.find(([n]) => n === 'I')?.[1];

          // External content root (URL or hashtag identifier)
          if (I) {
            if (K === '#') {
              root = I as `#${string}`;
            } else {
              try {
                root = new URL(I);
              } catch {
                root = I as `#${string}`;
              }
            }
          } else {
            const rootKind = K ? parseInt(K, 10) : 0;
            const rootPubkey = P ?? '';

            if (A) {
              // Addressable/replaceable root: extract d-tag from the A value
              const parts = A.split(':');
              const dValue = parts.length >= 3 ? parts.slice(2).join(':') : '';
              root = {
                id: E ?? '',
                kind: rootKind,
                pubkey: rootPubkey,
                content: '',
                created_at: 0,
                sig: '',
                tags: [['d', dValue]],
              };
            } else {
              root = {
                id: E ?? '',
                kind: rootKind,
                pubkey: rootPubkey,
                content: '',
                created_at: 0,
                sig: '',
                tags: [],
              };
            }
          }
        } else {
          // Replying directly to a non-kind-1 event: it is the root
          root = replyTo;
        }

        await postComment({ root, reply, content: finalContent, tags });
      } else {
        await createEvent({
          kind: 1,
          content: finalContent,
          tags,
          created_at: Math.floor(Date.now() / 1000),
        });
      }

      resetComposeState();
      // Optimistically bump the reply count on the parent event
      if (replyTo && !(replyTo instanceof URL)) {
        queryClient.setQueryData<EventStats>(['event-stats', replyTo.id], (prev) =>
          prev ? { ...prev, replies: prev.replies + 1 } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      if (replyTo) {
        if (replyTo instanceof URL) {
          queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] });
        } else {
          queryClient.invalidateQueries({ queryKey: ['replies', replyTo.id] });
          // Invalidate the event-comments cache used by CommentsSheet
          if (replyTo.kind !== 1) {
            const dTag = replyTo.tags.find(([n]) => n === 'd')?.[1] ?? '';
            const aTag = `${replyTo.kind}:${replyTo.pubkey}:${dTag}`;
            queryClient.invalidateQueries({ queryKey: ['event-comments', aTag] });
          }
        }
      }
      if (quotedEvent) {
        queryClient.invalidateQueries({ queryKey: ['event-stats', quotedEvent.id] });
        queryClient.invalidateQueries({ queryKey: ['event-interactions', quotedEvent.id] });
      }
      toast({ title: 'Posted!', description: replyTo ? 'Your reply has been published.' : quotedEvent ? 'Your quote has been published.' : 'Your note has been published.' });
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish note.', variant: 'destructive' });
    }
  };

  const handlePollSubmit = async () => {
    const filledOptions = pollOptions.filter((o) => o.label.trim());
    if (!pollQuestion.trim() || filledOptions.length < 2 || !user || isPollPending) return;

    const tags: string[][] = [];
    for (const opt of filledOptions) {
      tags.push(['option', opt.id, opt.label.trim()]);
    }
    tags.push(['polltype', pollType]);
    if (pollDuration > 0) {
      tags.push(['endsAt', String(Math.floor(Date.now() / 1000) + pollDuration * 86_400)]);
    }
    tags.push(['alt', `Poll: ${pollQuestion.trim()}`]);

    try {
      await createEvent({ kind: 1068, content: pollQuestion.trim(), tags });
      resetComposeState();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast({ title: 'Poll published!' });
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish poll.', variant: 'destructive' });
    }
  };

  const pollFilledCount = pollOptions.filter((o) => o.label.trim()).length;
  const isPollValid = pollQuestion.trim().length > 0 && pollFilledCount >= 2;

  const isExpanded = forceExpanded || expanded || content.length > 0 || !compact;

  // Early return after all hooks to avoid violating Rules of Hooks
  if (!user && compact) return null;

  return (
    <div className={cn("px-4 py-3 bg-background/85")}>
      {/* Preview toggle at top when not controlled and has previewable content */}
      {hasPreviewableContent && controlledPreviewMode === undefined && (
        <div className="flex items-center justify-end mb-3">
          <div className="inline-flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg">
            <button
              onClick={() => setInternalPreviewMode(false)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
                !previewMode 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Edit
            </button>
            <button
              onClick={() => setInternalPreviewMode(true)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all",
                previewMode 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Preview
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!hideAvatar && user && (
          isProfileLoading ? (
            <Skeleton className="size-12 shrink-0 mt-0.5 rounded-full" />
          ) : (
            <Link to={userProfileUrl} className="shrink-0">
              <Avatar shape={avatarShape} className="size-12 shrink-0 mt-0.5">
                <AvatarImage src={metadata?.picture} alt={metadata?.name} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {(metadata?.name?.[0] || '?').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          )
        )}

        <div className="flex-1 min-w-0">
          {mode === 'poll' ? (
          /* ── Inline poll builder ─────────────────────────────── */
          <div className="pt-2.5 pb-1 space-y-3">
            {/* Back to post link — hidden when poll mode is the only mode */}
            {initialMode !== 'poll' && (
              <button
                type="button"
                onClick={() => setMode('post')}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors -mt-0.5"
              >
                <ChevronLeft className="size-3.5" />
                Back to post
              </button>
            )}

            {/* Question */}
            <textarea
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask a question…"
              rows={2}
              maxLength={280}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg pb-1 opacity-85 break-words"
            />

            {/* Options */}
            <div className="space-y-1.5">
              {pollOptions.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) =>
                      setPollOptions((prev) =>
                        prev.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o)),
                      )
                    }
                    placeholder={`Option ${idx + 1}`}
                    maxLength={100}
                    className="flex-1 bg-secondary/40 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (pollOptions.length > 2) {
                        setPollOptions((prev) => prev.filter((o) => o.id !== opt.id));
                      }
                    }}
                    disabled={pollOptions.length <= 2}
                    className="p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}

              {pollOptions.length < 8 && (
                <button
                  type="button"
                  onClick={() =>
                    setPollOptions((prev) => [...prev, { id: pollOptionId(), label: '' }])
                  }
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-0.5"
                >
                  <Plus className="size-3" />
                  Add option
                </button>
              )}
            </div>

            {/* Settings row — pill toggles */}
            <div className="flex flex-wrap gap-2 pt-0.5">
              {(['singlechoice', 'multiplechoice'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPollType(t)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    pollType === t
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  {t === 'singlechoice' ? 'Single choice' : 'Multiple choice'}
                </button>
              ))}
              <div className="w-px bg-border self-stretch mx-0.5" />
              {([1, 3, 7, 0] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPollDuration(d)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full border transition-colors',
                    pollDuration === d
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                  )}
                >
                  {d === 0 ? <span style={{ fontSize: '15px', lineHeight: 1, position: 'relative', top: '-1px' }}>∞</span> : `${d}d`}
                </button>
              ))}
            </div>
          </div>
        ) : !previewMode ? (
          /* ── Edit mode — Textarea ────────────────────────────── */
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={expand}
              onPaste={handlePaste}
              placeholder={placeholder}
              className={cn(
                'w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg pt-2.5 pb-2 opacity-85 break-words overflow-hidden transition-[min-height] duration-200 ease-in-out',
                isExpanded ? 'min-h-[100px]' : 'min-h-[44px]',
              )}
              rows={1}
              disabled={!user}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                }
              }}
            />
            <MentionAutocomplete
              textareaRef={textareaRef}
              content={content}
              onInsertMention={handleInsertMention}
            />
            <EmojiShortcodeAutocomplete
              textareaRef={textareaRef}
              content={content}
              onInsertEmoji={handleInsertShortcodeEmoji}
            />
          </div>
        ) : (
          /* Preview mode - Show how post will look */
          mockEvent && (() => {
            const imetaMap = parseImetaMap(mockEvent.tags);
            const videos = extractVideoUrls(mockEvent.content);
            const imetaAudios = Array.from(imetaMap.values())
              .filter((e) => e.mime?.startsWith('audio/'))
              .map((e) => e.url);
            const audios = imetaAudios.length > 0 ? imetaAudios : extractAudioUrls(mockEvent.content);
            const webxdcApps = Array.from(imetaMap.values()).filter(
              (entry) => entry.mime === 'application/x-webxdc' || entry.mime === 'application/vnd.webxdc+zip',
            );
            return (
              <div className="pt-2.5 pb-2 min-h-[100px]">
                <div className="text-lg opacity-85">
                  <NoteContent event={mockEvent} className="text-foreground" />
                </div>
                <NoteMedia
                  videos={videos}
                  audios={audios}
                  imetaMap={imetaMap}
                  webxdcApps={webxdcApps}
                  event={mockEvent}
                />
              </div>
            );
          })()
        )}

        {/* Content warning input */}
        {cwEnabled && (
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-500 shrink-0" />
            <Input
              value={cwText}
              onChange={(e) => setCwText(e.target.value)}
              placeholder="Content warning reason (optional)"
              className="h-8 text-base md:text-sm bg-secondary/50 border-0 rounded-lg"
            />
            <button
              onClick={() => { setCwEnabled(false); setCwText(''); }}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Quoted event preview */}
        {showQuotedEvent && quotedEvent && quotedEventKey && (
          <div className="mt-4 mb-3">
            {quotedEvent.kind >= 30000 && quotedEvent.kind < 40000 ? (
              <EmbeddedNaddr addr={{
                kind: quotedEvent.kind,
                pubkey: quotedEvent.pubkey,
                identifier: quotedEvent.tags.find(([name]) => name === 'd')?.[1] ?? '',
              }} />
            ) : (
              <EmbeddedNote eventId={quotedEvent.id} />
            )}
          </div>
        )}

        {/* Toolbar + post button */}
        {isExpanded && (
          voiceRecorder.isRecording || isPublishingVoice ? (
            /* ── Voice recording UI ─────────────────────────────── */
            <div className="flex items-center gap-3 mt-3 rounded-xl bg-destructive/5 border border-destructive/20 px-3 py-2.5">
              {/* Recording indicator */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="size-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
                <span className="text-sm font-medium tabular-nums text-destructive">
                  {formatTime(voiceRecorder.recordingDuration)}
                </span>
              </div>

              {/* Live waveform preview */}
              <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
                {voiceRecorder.liveWaveform.slice(-60).map((amp, i) => {
                  const h = 3 + (amp / 100) * 21;
                  return (
                    <div
                      key={i}
                      className="w-[3px] shrink-0 rounded-full bg-destructive/60"
                      style={{ height: `${h}px` }}
                    />
                  );
                })}
              </div>

              {/* Cancel button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={voiceRecorder.cancelRecording}
                    disabled={isPublishingVoice}
                    className="p-2 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  >
                    <X className="size-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Cancel</TooltipContent>
              </Tooltip>

              {/* Stop & send button */}
              <Button
                onClick={handleStopAndPublishVoice}
                disabled={isPublishingVoice || voiceRecorder.recordingDuration < 0.5}
                className="rounded-full px-4 font-bold"
                size="sm"
              >
                {isPublishingVoice ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Square className="size-3.5 mr-1.5" fill="currentColor" />
                )}
                {isPublishingVoice ? 'Sending...' : 'Send'}
              </Button>
            </div>
          ) : (
            /* ── Normal toolbar ──────────────────────────────────── */
            <div className="flex items-center justify-between mt-3">
              {/* Left: action icons */}
              <div className="flex items-center gap-1 -ml-2">
                {/* File upload */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || !user}
                      className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                    >
                      {isUploading ? <Loader2 className="size-[18px] animate-spin" /> : <Paperclip className="size-[18px]" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Attach file</TooltipContent>
                </Tooltip>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.xdc"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) {
                      Array.from(files).forEach((file) => handleFileUpload(file));
                    }
                    e.target.value = '';
                  }}
                />

                {/* Voice recording */}
                {voiceRecorder.isSupported && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleStartRecording}
                        disabled={!user}
                        className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                      >
                        <Mic className="size-[18px]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Voice message</TooltipContent>
                  </Tooltip>
                )}

                 {/* Emoji / GIF picker */}
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <button
                       type="button"
                       onClick={() => setPickerOpen(true)}
                       className={cn(
                         'p-2 rounded-full transition-colors',
                         pickerOpen
                           ? 'text-primary bg-primary/10'
                           : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                       )}
                     >
                       <Smile className="size-[18px]" />
                     </button>
                   </TooltipTrigger>
                   {!pickerOpen && <TooltipContent>Emoji / GIF</TooltipContent>}
                 </Tooltip>
                 <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                   <DialogContent
                     className="w-auto max-w-fit p-0 gap-0 border-border rounded-xl overflow-hidden [&>button]:hidden"
                     onOpenAutoFocus={(e) => e.preventDefault()}
                   >
                     {/* Tab bar */}
                     <div className="flex">
                       <button
                         type="button"
                         onClick={() => setPickerTab('emoji')}
                         className={cn(
                           'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
                           pickerTab === 'emoji'
                             ? 'text-primary border-primary'
                             : 'text-muted-foreground hover:text-foreground border-border',
                         )}
                       >
                         <Smile className="size-3.5" />
                         Emoji
                       </button>
                       <button
                         type="button"
                         onClick={() => setPickerTab('gif')}
                         className={cn(
                           'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
                           pickerTab === 'gif'
                             ? 'text-primary border-primary'
                             : 'text-muted-foreground hover:text-foreground border-border',
                         )}
                       >
                         <svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                           <rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                           <text x="9" y="9" textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="700" fontFamily="system-ui,sans-serif" fill="currentColor" letterSpacing="0.5">GIF</text>
                         </svg>
                         GIF
                       </button>
                       {customEmojis.length > 0 && (
                         <button
                           type="button"
                           onClick={() => setPickerTab('stickers')}
                           className={cn(
                             'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
                             pickerTab === 'stickers'
                               ? 'text-primary border-primary'
                               : 'text-muted-foreground hover:text-foreground border-border',
                           )}
                         >
                           <Sticker className="size-3.5" />
                           Stickers
                         </button>
                       )}
                     </div>
                     {/* Picker content */}
                      {pickerTab === 'emoji' ? (
                        <Suspense fallback={<div className="w-[316px] h-[435px] flex items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
                          <LazyEmojiPicker
                            customEmojis={customEmojis}
                            onSelect={(selection) => {
                              if (selection.type === 'native') {
                                insertEmoji(selection.emoji);
                              } else {
                                insertEmoji(`:${selection.shortcode}:`);
                              }
                            }}
                          />
                        </Suspense>
                     ) : pickerTab === 'stickers' ? (
                       <div className="w-[316px] h-[435px]">
                         {customEmojis.length === 0 ? (
                           <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                             <Sticker className="size-8 opacity-40" />
                             <p className="text-sm">No sticker packs yet</p>
                             <p className="text-xs">Add emoji packs to your profile to use stickers</p>
                           </div>
                         ) : (
                           <ScrollArea className="h-full">
                             <div className="grid grid-cols-4 gap-1.5 p-2">
                               {customEmojis.map((emoji) => (
                                 <button
                                   key={emoji.shortcode}
                                   type="button"
                                   title={emoji.shortcode}
                                   onClick={() => {
                                     setContent((prev) => (prev ? prev + '\n' + emoji.url : emoji.url));
                                     setPickerOpen(false);
                                     expand();
                                   }}
                                   className="aspect-square rounded-lg overflow-hidden hover:bg-muted transition-colors p-1 group"
                                 >
                                   <img
                                     src={emoji.url}
                                     alt={emoji.shortcode}
                                     className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-150"
                                   />
                                 </button>
                               ))}
                             </div>
                           </ScrollArea>
                         )}
                       </div>
                     ) : (
                       <GifPicker onSelect={(gif) => {
                         setContent((prev) => (prev ? prev + '\n' + gif.url : gif.url));
                         setPickerOpen(false);
                         expand();
                       }} />
                     )}
                   </DialogContent>
                 </Dialog>

                {/* Overflow: Poll + CW */}
                <Popover open={trayOpen} onOpenChange={setTrayOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={!user}
                          className={cn(
                            'p-2 rounded-full transition-colors disabled:opacity-40',
                            (trayOpen || mode === 'poll' || cwEnabled)
                              ? 'text-primary bg-primary/10'
                              : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                          )}
                        >
                          <Plus className="size-[18px]" strokeWidth={2.5} />
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    {!trayOpen && <TooltipContent>More</TooltipContent>}
                  </Tooltip>
                  <PopoverContent side="bottom" align="start" sideOffset={6} className="w-44 p-1.5 rounded-xl border-border shadow-lg">
                    <div className="flex flex-col gap-0.5">
                      {!replyTo && (
                        <button
                          type="button"
                          onClick={() => { setMode((m) => m === 'poll' ? 'post' : 'poll'); setTrayOpen(false); expand(); }}
                          className={cn('flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors', mode === 'poll' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60')}
                        >
                          <BarChart3 className="size-4" /><span className="font-medium">Poll</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setCwEnabled((v) => !v); setTrayOpen(false); expand(); }}
                        className={cn('flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors', cwEnabled ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60')}
                      >
                        <AlertTriangle className="size-4" /><span className="font-medium">Spoiler</span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Right: char count + post/poll button */}
              <div className="flex items-center gap-3">
                {mode === 'post' && charCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <CharRing count={charCount} max={MAX_CHARS} />
                    <span className={cn(
                      'text-xs tabular-nums',
                      remaining < 0 ? 'text-destructive font-semibold' : remaining < 500 ? 'text-amber-500' : 'text-muted-foreground',
                    )}>
                      {remaining}
                    </span>
                  </div>
                )}

                {mode === 'poll' ? (
                  <Button
                    onClick={handlePollSubmit}
                    disabled={!isPollValid || isPollPending || !user}
                    className="rounded-full px-5 font-bold"
                    size="sm"
                  >
                    {isPollPending ? 'Publishing...' : 'Publish poll'}
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!content.trim() || isPending || isCommentPending || !user || charCount > MAX_CHARS}
                    className="rounded-full px-5 font-bold"
                    size="sm"
                  >
                    {isPending || isCommentPending ? 'Posting...' : 'Post!'}
                  </Button>
                )}
              </div>
            </div>
          )
        )}
        </div>
      </div>
    </div>
  );
}
