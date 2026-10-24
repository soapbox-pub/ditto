/**
 * Repair for malformed `AVCDecoderConfigurationRecord`s (ISO 14496-15 §5.3.3.1)
 * emitted by some WebCodecs H.264 encoders: each SPS/PPS carries its NAL header
 * byte twice (`67 67 64 …`) and the reserved bits are zeroed. Chrome and ffmpeg
 * recover from the in-band parameter sets, but iOS trusts only `avcC` and
 * refuses to play the file.
 */

const NAL_SPS = 7;
const NAL_PPS = 8;

/**
 * Returns a corrected copy of `record`, or `null` when it is already
 * well-formed or too unfamiliar to fix safely.
 */
export function repairAvcDecoderConfig(record: Uint8Array): Uint8Array | null {
  const parsed = parse(record);
  if (!parsed) return null;

  // A doubled SPS header reads as profile_idc 0x67 (103), which no profile uses.
  const doubled = parsed.sps.some((nal) => isDoubled(nal, NAL_SPS));
  const badReserved = (record[4] & 0xFC) !== 0xFC || (record[5] & 0xE0) !== 0xE0;
  if (!doubled && !badReserved) return null;

  const sps = parsed.sps.map((nal) => (isDoubled(nal, NAL_SPS) ? nal.subarray(1) : nal));
  const pps = doubled
    ? parsed.pps.map((nal) => (isDoubled(nal, NAL_PPS) ? nal.subarray(1) : nal))
    : parsed.pps;

  const first = sps[0];
  if (!first || first.length < 4 || (first[0] & 0x1F) !== NAL_SPS) return null;

  const bytes: number[] = [
    1,
    first[1], // profile_idc
    first[2], // constraint flags
    first[3], // level_idc
    0xFC | (record[4] & 0x03),
    0xE0 | sps.length,
  ];
  for (const nal of sps) pushNal(bytes, nal);
  bytes.push(pps.length);
  for (const nal of pps) pushNal(bytes, nal);
  for (const byte of parsed.rest) bytes.push(byte);

  return new Uint8Array(bytes);
}

interface ParsedRecord {
  sps: Uint8Array[];
  pps: Uint8Array[];
  /** Trailing bytes (High-profile chroma/bit-depth extension), copied verbatim. */
  rest: Uint8Array;
}

function parse(record: Uint8Array): ParsedRecord | null {
  if (record.length < 7 || record[0] !== 1) return null;

  let offset = 5;
  const readNals = (count: number): Uint8Array[] | null => {
    const nals: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      if (offset + 2 > record.length) return null;
      const length = (record[offset] << 8) | record[offset + 1];
      offset += 2;
      if (length === 0 || offset + length > record.length) return null;
      nals.push(record.subarray(offset, offset + length));
      offset += length;
    }
    return nals;
  };

  const sps = readNals(record[offset++] & 0x1F);
  if (!sps || sps.length === 0 || offset >= record.length) return null;

  const pps = readNals(record[offset++]);
  if (!pps) return null;

  return { sps, pps, rest: record.subarray(offset) };
}

function isDoubled(nal: Uint8Array, type: number): boolean {
  return nal.length > 1 && nal[0] === nal[1] && (nal[0] & 0x1F) === type;
}

function pushNal(bytes: number[], nal: Uint8Array): void {
  bytes.push(nal.length >> 8, nal.length & 0xFF);
  for (const byte of nal) bytes.push(byte);
}
