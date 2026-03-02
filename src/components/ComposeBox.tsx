import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Paperclip, Smile, AlertTriangle, X, Loader2, ImagePlay, Mic, Square } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { encode as blurhashEncode } from 'blurhash';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPicker } from '@/components/EmojiPicker';
import { GifPicker } from '@/components/GifPicker';
import type { CustomEmojiEntry } from '@/hooks/useUserEmojiPacks';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { MentionAutocomplete } from '@/components/MentionAutocomplete';
import { EmojiShortcodeAutocomplete } from '@/components/EmojiShortcodeAutocomplete';

import { NoteContent } from '@/components/NoteContent';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { usePostComment } from '@/hooks/usePostComment';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { extractWebxdcMeta } from '@/lib/webxdcMeta';
import { extractVideoUrls, extractAudioUrls, IMETA_MEDIA_URL_REGEX, mimeFromExt } from '@/lib/mediaUrls';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { formatTime } from '@/lib/formatTime';
import { DITTO_RELAY } from '@/lib/appRelays';

const MAX_CHARS = 5000;

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
}: ComposeBoxProps) {
  const { user, metadata, isLoading: isProfileLoading } = useCurrentUser();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const { mutateAsync: postComment, isPending: isCommentPending } = usePostComment();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [content, setContent] = useState(initialContent);
  const [expanded, setExpanded] = useState(false);
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cwText, setCwText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  /** Tracks custom NIP-30 emojis used in the current compose content. */
  const [customEmojiTags, setCustomEmojiTags] = useState<Map<string, string>>(new Map());
  const [internalPreviewMode, setInternalPreviewMode] = useState(false);
  const [removedEmbeds, setRemovedEmbeds] = useState<Set<string>>(new Set());
  const [_uploadedFileTags, setUploadedFileTags] = useState<string[][]>([]);
  /** Maps uploaded file URLs to their NIP-94 tags (grouped per upload). */
  const [uploadedFileGroups, setUploadedFileGroups] = useState<Map<string, string[][]>>(new Map());
  /** Maps .xdc URLs to their generated webxdc UUIDs. */
  const [webxdcUuids, setWebxdcUuids] = useState<Map<string, string>>(new Map());
  /** Maps .xdc URLs to extracted metadata (name + icon URL). */
  const [webxdcMetas, setWebxdcMetas] = useState<Map<string, { name?: string; iconUrl?: string }>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording
  const voiceRecorder = useVoiceRecorder();
  const [isPublishingVoice, setIsPublishingVoice] = useState(false);

  // Use controlled preview mode if provided, otherwise use internal state
  const previewMode = controlledPreviewMode !== undefined ? controlledPreviewMode : internalPreviewMode;

  // Auto-expand when quotedEvent is provided
  useEffect(() => {
    if (quotedEvent) {
      setExpanded(true);
    }
  }, [quotedEvent]);

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

  // Check if content has any previewable content (link previews, images, videos, audio, or mentions)
  const hasPreviewableContent = useMemo(() => {
    return visibleEmbeds.length > 0 || hasPreviewImages || previewVideos.length > 0 || previewAudios.length > 0 || hasMentions;
  }, [visibleEmbeds, hasPreviewImages, previewVideos, previewAudios, hasMentions]);

  // Notify parent of previewable content changes
  useEffect(() => {
    if (onHasPreviewableContentChange) {
      onHasPreviewableContentChange(hasPreviewableContent);
    }
  }, [hasPreviewableContent, onHasPreviewableContentChange]);

  // Include quoted event if provided and not removed
  const quotedEventId = quotedEvent ? nip19.neventEncode({ id: quotedEvent.id, author: quotedEvent.pubkey }) : null;
  const quotedEventKey = quotedEventId ? `nostr:${quotedEventId}` : null;
  const showQuotedEvent = quotedEvent && quotedEventKey && !removedEmbeds.has(quotedEventKey);

  // Create mock event for preview
  const mockEvent = useMemo(() => {
    if (!user || !content) return null;
    
    const hashtags = content.match(/#\w+/g)?.map((t) => t.slice(1)) || [];
    const tags: string[][] = hashtags.map((t) => ['t', t.toLowerCase()]);
    
    return {
      id: 'preview',
      pubkey: user.pubkey,
      content: content.trim(),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags,
      sig: '',
    };
  }, [user, content]);

  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + emoji + content.slice(end);
      setContent(newContent);
      // Restore cursor position after the inserted emoji
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + emoji.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      setContent((prev) => prev + emoji);
    }
    expand();
  }, [content, expand]);

  const handleInsertMention = useCallback(({ start, end, replacement }: { start: number; end: number; replacement: string }) => {
    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        const pos = start + replacement.length;
        textarea.setSelectionRange(pos, pos);
      }
    });
  }, [content]);

  const insertCustomEmoji = useCallback((emoji: CustomEmojiEntry) => {
    // Insert `:shortcode:` into content
    const shortcodeText = `:${emoji.shortcode}: `;
    insertEmoji(shortcodeText);
    // Track the emoji tag for inclusion when publishing
    setCustomEmojiTags((prev) => {
      const next = new Map(prev);
      next.set(emoji.shortcode, emoji.url);
      return next;
    });
  }, [insertEmoji]);

  const handleInsertShortcodeEmoji = useCallback(({ start, end, replacement }: { start: number; end: number; replacement: string }) => {
    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        const pos = start + replacement.length;
        textarea.setSelectionRange(pos, pos);
      }
    });
  }, [content]);

  const handleFileUpload = useCallback(async (file: File) => {
    try {
      // .xdc files are ZIP archives; browsers don't know their MIME type so file.type is ''.
      // Blossom servers may reject uploads with an empty Content-Type, so we re-wrap the file
      // with the correct MIME type before uploading.
      const isXdc = file.name.endsWith('.xdc');
      const uploadableFile = isXdc && !file.type
        ? new File([file], file.name, { type: 'application/x-webxdc' })
        : file;

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

      // Compute dim + blurhash from the original file and inject into NIP-94 tags
      if (!isXdc) {
        const { dim, blurhash } = await getImageMeta(uploadableFile);
        if (dim) tags.push(['dim', dim]);
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
  }, [uploadFile, expand, toast]);

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
      const hashtags = content.match(/#\w+/g)?.map((t) => t.slice(1)) || [];
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
      // Per NIP-18, quotes should use the q tag and include the nostr: URI in content
      let finalContent = content.trim();
      if (showQuotedEvent && quotedEvent) {
        tags.push(['q', quotedEvent.id, DITTO_RELAY, quotedEvent.pubkey]);
        // Add the nostr: URI to the content if not already present
        const neventUri = `nostr:${nip19.neventEncode({ id: quotedEvent.id, author: quotedEvent.pubkey })}`;
        if (!finalContent.includes(neventUri)) {
          finalContent = finalContent + '\n\n' + neventUri;
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



      // NIP-30: Add custom emoji tags for any `:shortcode:` patterns used in content
      for (const [shortcode, url] of customEmojiTags) {
        if (finalContent.includes(`:${shortcode}:`)) {
          tags.push(['emoji', shortcode, url]);
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

      setContent('');
      setCwEnabled(false);
      setCwText('');
      setExpanded(false);
      setRemovedEmbeds(new Set());
      setUploadedFileTags([]);
      setUploadedFileGroups(new Map());
      setWebxdcUuids(new Map());
      setWebxdcMetas(new Map());
      setCustomEmojiTags(new Map());
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      if (replyTo) {
        if (replyTo instanceof URL) {
          queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] });
        } else {
          queryClient.invalidateQueries({ queryKey: ['replies', replyTo.id] });
          // Also invalidate NIP-22 comments cache for non-kind-1 events
          if (replyTo.kind !== 1) {
            queryClient.invalidateQueries({ queryKey: ['nostr', 'comments'] });
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

  const isExpanded = forceExpanded || expanded || content.length > 0 || !compact;

  // Early return after all hooks to avoid violating Rules of Hooks
  if (!user && compact) return null;

  return (
    <div className={cn("px-4 py-3", !forceExpanded && "border-b border-border")}>
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
              <Avatar className="size-12 shrink-0 mt-0.5">
                <AvatarImage src={metadata?.picture} alt={metadata?.name} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {(metadata?.name?.[0] || '?').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          )
        )}

        <div className="flex-1 min-w-0">
          {!previewMode ? (
          /* Edit mode - Textarea */
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={expand}
              onPaste={handlePaste}
              placeholder={placeholder}
              className={cn(
                'w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg pt-2.5 pb-2 opacity-85 break-words',
                isExpanded ? 'min-h-[100px]' : 'min-h-[44px]',
              )}
              rows={isExpanded ? 4 : 1}
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
              onCustomEmojiInsert={(emoji) => {
                setCustomEmojiTags((prev) => {
                  const next = new Map(prev);
                  next.set(emoji.shortcode, emoji.url);
                  return next;
                });
              }}
            />
          </div>
        ) : (
          /* Preview mode - Show how post will look */
          mockEvent && (
            <div className="pt-2.5 pb-2 min-h-[100px]">
              <div className="text-lg opacity-85">
                <NoteContent event={mockEvent} className="text-foreground" />
              </div>
              {/* Render videos */}
              {previewVideos.map((url, i) => (
                <div key={i} className="mt-3 rounded-2xl overflow-hidden border border-border">
                  <video
                    src={url}
                    controls
                    className="w-full h-auto max-h-[500px] bg-muted"
                  />
                </div>
              ))}

              {/* Render audio as visualizer */}
              {previewAudios.map((url, i) => (
                <AudioVisualizer
                  key={`audio-${i}`}
                  src={url}
                  avatarUrl={metadata?.picture}
                  avatarFallback={(metadata?.name ?? metadata?.display_name ?? '?')[0]?.toUpperCase() ?? '?'}
                />
              ))}
            </div>
          )
        )}

        {/* Content warning input */}
        {cwEnabled && (
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-500 shrink-0" />
            <Input
              value={cwText}
              onChange={(e) => setCwText(e.target.value)}
              placeholder="Content warning reason (optional)"
              className="h-8 text-sm bg-secondary/50 border-0 rounded-lg"
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
            <EmbeddedNote eventId={quotedEvent.id} />
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
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
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

                {/* Emoji picker */}
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'p-2 rounded-full transition-colors',
                            emojiOpen
                              ? 'text-primary bg-primary/10'
                              : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                          )}
                        >
                          <Smile className="size-[18px]" />
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    {!emojiOpen && <TooltipContent>Emoji</TooltipContent>}
                  </Tooltip>
                  <PopoverContent
                    align="start"
                    sideOffset={8}
                    className="w-auto p-0 border-border"
                  >
                    <EmojiPicker onSelect={(emoji) => {
                      insertEmoji(emoji);
                    }} onCustomEmojiSelect={(emoji) => {
                      insertCustomEmoji(emoji);
                      setEmojiOpen(false);
                    }} />
                  </PopoverContent>
                </Popover>

                {/* GIF picker */}
                <Popover open={gifOpen} onOpenChange={setGifOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'p-2 rounded-full transition-colors',
                            gifOpen
                              ? 'text-primary bg-primary/10'
                              : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                          )}
                        >
                          <ImagePlay className="size-[18px]" />
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    {!gifOpen && <TooltipContent>GIF</TooltipContent>}
                  </Tooltip>
                  <PopoverContent
                    align="start"
                    sideOffset={8}
                    className="w-auto p-0 border-border"
                  >
                    <GifPicker onSelect={(gif) => {
                      setContent((prev) => (prev ? prev + '\n' + gif.url : gif.url));
                      setGifOpen(false);
                      expand();
                    }} />
                  </PopoverContent>
                </Popover>

                {/* Content warning (NIP-36) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setCwEnabled(!cwEnabled)}
                      className={cn(
                        'p-2 rounded-full transition-colors',
                        cwEnabled
                          ? 'text-amber-500 bg-amber-500/10'
                          : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10',
                      )}
                    >
                      <AlertTriangle className="size-[18px]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Content warning (NIP-36)</TooltipContent>
                </Tooltip>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Right: char count + post button */}
              <div className="flex items-center gap-3">
                {charCount > 0 && (
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

                <Button
                  onClick={handleSubmit}
                  disabled={!content.trim() || isPending || isCommentPending || !user || charCount > MAX_CHARS}
                  className="rounded-full px-5 font-bold"
                  size="sm"
                >
                  {isPending || isCommentPending ? 'Posting...' : 'Post!'}
                </Button>
              </div>
            </div>
          )
        )}
        </div>
      </div>
    </div>
  );
}
