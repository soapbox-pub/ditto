import { ffprobe } from './ffprobe.ts';

interface AnalyzeResult {
  streams: Stream[];
  format: Format;
}

interface Stream {
  index: number;
  codec_tag_string: string;
  codec_tag: string;
  codec_name?: string;
  codec_long_name?: string;
  profile?: string;
  codec_type?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  closed_captions?: number;
  has_b_frames?: number;
  sample_aspect_ratio?: string;
  display_aspect_ratio?: string;
  pix_fmt?: string;
  level?: number;
  color_range?: string;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
  chroma_location?: string;
  field_order?: string;
  refs?: number;
  sample_fmt?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bits_per_sample?: number;
  id?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  time_base?: string;
  start_pts?: number;
  start_time?: string;
  duration_ts?: number;
  duration?: string;
  bit_rate?: string;
  max_bit_rate?: string;
  bits_per_raw_sample?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  nb_read_packets?: string;
  disposition?: Disposition;
  tags?: Record<string, string>;
}

interface Format {
  filename: string;
  nb_streams: number;
  nb_programs: number;
  format_name: string;
  probe_score: number;
  format_long_name?: string;
  start_time?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
}

interface Disposition {
  default: number;
  dub: number;
  original: number;
  comment: number;
  lyrics: number;
  karaoke: number;
  forced: number;
  hearing_impaired: number;
  visual_impaired: number;
  clean_effects: number;
  attached_pic: number;
  timed_thumbnails: number;
  captions: number;
  descriptions: number;
  metadata: number;
  dependent: number;
  still_image: number;
}

export function analyzeFile(
  input: URL | ReadableStream<Uint8Array>,
  opts?: { ffprobePath?: string | URL },
): Promise<AnalyzeResult> {
  const stream = ffprobe(input, {
    'loglevel': 'fatal',
    'show_streams': '',
    'show_format': '',
    'of': 'json',
  }, opts);

  return new Response(stream).json();
}
