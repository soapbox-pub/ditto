// ── PGN parsing ──────────────────────────────────────────────────────────────

export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(pgn)) !== null) headers[m[1]] = m[2];
  return headers;
}

export function extractMoveText(pgn: string): string {
  return pgn
    .replace(/\[.*?\]\s*/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\$\d+/g, '')
    .trim();
}

export function parseMoves(pgn: string): string[] {
  return extractMoveText(pgn)
    .replace(/\d+\.(\.\.)?/g, '')
    .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '')
    .trim()
    .split(/\s+/)
    .map(m => m.trim())
    .filter(m => m.length > 0 && !/^\d/.test(m));
}

export function formatResult(result: string | undefined): { text: string; color: 'white' | 'black' | 'draw' | null } {
  if (!result || result === '*') return { text: 'In progress', color: null };
  if (result === '1-0') return { text: 'White wins', color: 'white' };
  if (result === '0-1') return { text: 'Black wins', color: 'black' };
  if (result === '1/2-1/2') return { text: 'Draw', color: 'draw' };
  return { text: result, color: null };
}

export function isGameInProgress(result: string | undefined): boolean {
  return !result || result === '*';
}

// ── Board types ───────────────────────────────────────────────────────────────

export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
export type Color = 'w' | 'b';
export interface Piece { type: PieceType; color: Color; }
export type Board = (Piece | null)[][];

export function initialBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back: PieceType[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    b[0][f] = { type: back[f], color: 'b' };
    b[1][f] = { type: 'P', color: 'b' };
    b[6][f] = { type: 'P', color: 'w' };
    b[7][f] = { type: back[f], color: 'w' };
  }
  return b;
}

const fileToCol = (f: string) => f.charCodeAt(0) - 97;
const rankToRow = (r: string) => 8 - parseInt(r, 10);

function cloneBoard(b: Board): Board {
  return b.map(r => r.map(s => s ? { ...s } : null));
}

function isDiagClear(b: Board, r1: number, c1: number, r2: number, c2: number) {
  const dr = r2 > r1 ? 1 : -1, dc = c2 > c1 ? 1 : -1;
  let r = r1 + dr, c = c1 + dc;
  while (r !== r2 || c !== c2) { if (b[r][c]) return false; r += dr; c += dc; }
  return true;
}

function isStraightClear(b: Board, r1: number, c1: number, r2: number, c2: number) {
  const dr = r2 === r1 ? 0 : r2 > r1 ? 1 : -1;
  const dc = c2 === c1 ? 0 : c2 > c1 ? 1 : -1;
  let r = r1 + dr, c = c1 + dc;
  while (r !== r2 || c !== c2) { if (b[r][c]) return false; r += dr; c += dc; }
  return true;
}

function canReach(b: Board, fr: number, fc: number, tr: number, tc: number, p: Piece, color: Color): boolean {
  const dr = tr - fr, dc = tc - fc;
  switch (p.type) {
    case 'P': {
      const dir = color === 'w' ? -1 : 1, start = color === 'w' ? 6 : 1;
      if (dc === 0 && dr === dir && !b[tr][tc]) return true;
      if (dc === 0 && dr === 2 * dir && fr === start && !b[tr][tc] && !b[fr + dir][fc]) return true;
      // Diagonal capture: target must have an enemy piece (en passant handled separately in applyMove)
      if (Math.abs(dc) === 1 && dr === dir && b[tr][tc] !== null && b[tr][tc]!.color !== color) return true;
      return false;
    }
    case 'N': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
    case 'B': return Math.abs(dr) === Math.abs(dc) && isDiagClear(b, fr, fc, tr, tc);
    case 'R': return (dr === 0 || dc === 0) && isStraightClear(b, fr, fc, tr, tc);
    case 'Q':
      if (Math.abs(dr) === Math.abs(dc)) return isDiagClear(b, fr, fc, tr, tc);
      if (dr === 0 || dc === 0) return isStraightClear(b, fr, fc, tr, tc);
      return false;
    case 'K': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
    default: return false;
  }
}

export function applyMove(board: Board, san: string, color: Color): Board {
  const b = cloneBoard(board);
  const move = san.replace(/[+#!?]/g, '');

  if (move === 'O-O' || move === '0-0') {
    const row = color === 'w' ? 7 : 0;
    b[row][6] = { type: 'K', color }; b[row][4] = null;
    b[row][5] = { type: 'R', color }; b[row][7] = null;
    return b;
  }
  if (move === 'O-O-O' || move === '0-0-0') {
    const row = color === 'w' ? 7 : 0;
    b[row][2] = { type: 'K', color }; b[row][4] = null;
    b[row][3] = { type: 'R', color }; b[row][0] = null;
    return b;
  }

  const promoM = move.match(/=([QRBN])$/);
  const promo = promoM ? promoM[1] as PieceType : null;
  const clean = promoM ? move.slice(0, -2) : move;
  let type: PieceType = 'P';
  let rest = clean;
  if (/^[KQRBN]/.test(clean)) { type = clean[0] as PieceType; rest = clean.slice(1); }
  rest = rest.replace('x', '');

  const df = rest[rest.length - 2], dr = rest[rest.length - 1];
  if (!df || !dr || !/[a-h]/.test(df) || !/[1-8]/.test(dr)) return b;

  const tc = fileToCol(df), tr = rankToRow(dr);
  const hint = rest.slice(0, rest.length - 2);

  let fromRow = -1, fromCol = -1;
  outer: for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = b[r][c];
      if (!sq || sq.color !== color || sq.type !== type) continue;
      if (hint.length > 0) {
        if (/^[a-h]$/.test(hint) && fileToCol(hint) !== c) continue;
        if (/^[1-8]$/.test(hint) && rankToRow(hint) !== r) continue;
        if (/^[a-h][1-8]$/.test(hint) && (fileToCol(hint[0]) !== c || rankToRow(hint[1]) !== r)) continue;
      }
      // En passant: pawn diagonal to empty square
      const isEnPassant = type === 'P' && Math.abs(tc - c) === 1 && !b[tr][tc] &&
        (color === 'w' ? tr - r === -1 : tr - r === 1);
      if (isEnPassant || canReach(b, r, c, tr, tc, sq, color)) { fromRow = r; fromCol = c; break outer; }
    }
  }
  if (fromRow === -1) return b;

  // En passant capture: remove the bypassed pawn
  if (type === 'P' && !b[tr][tc] && fromCol !== tc) {
    b[color === 'w' ? tr + 1 : tr - 1][tc] = null;
  }
  b[tr][tc] = promo ? { type: promo, color } : { ...b[fromRow][fromCol]! };
  b[fromRow][fromCol] = null;
  return b;
}

export function buildPositions(moves: string[]): Board[] {
  const positions: Board[] = [initialBoard()];
  let board = initialBoard();
  for (let i = 0; i < moves.length; i++) {
    try { board = applyMove(board, moves[i], i % 2 === 0 ? 'w' : 'b'); } catch { /* skip */ }
    positions.push(cloneBoard(board));
  }
  return positions;
}

/** Try to apply a SAN move to the current position. Returns the new board or null if invalid. */
export function tryApplyMove(board: Board, san: string, color: Color): Board | null {
  try {
    const next = applyMove(board, san, color);
    const changed = next.some((row, r) => row.some((sq, c) => {
      const orig = board[r][c];
      if (!sq && !orig) return false;
      if (!sq || !orig) return true;
      return sq.type !== orig.type || sq.color !== orig.color;
    }));
    return changed ? next : null;
  } catch {
    return null;
  }
}

/** Returns all squares [row, col] that the piece at [fromRow, fromCol] can legally move to. */
export function getLegalTargets(board: Board, fromRow: number, fromCol: number): [number, number][] {
  const piece = board[fromRow][fromCol];
  if (!piece) return [];
  const targets: [number, number][] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === fromRow && c === fromCol) continue;
      // Can't capture own piece
      const target = board[r][c];
      if (target && target.color === piece.color) continue;
      if (canReach(board, fromRow, fromCol, r, c, piece, piece.color)) {
        targets.push([r, c]);
      }
    }
  }

  // Castling targets for king
  if (piece.type === 'K') {
    const row = piece.color === 'w' ? 7 : 0;
    if (fromRow === row && fromCol === 4) {
      // Kingside
      if (!board[row][5] && !board[row][6] && board[row][7]?.type === 'R' && board[row][7]?.color === piece.color) {
        targets.push([row, 6]);
      }
      // Queenside
      if (!board[row][3] && !board[row][2] && !board[row][1] && board[row][0]?.type === 'R' && board[row][0]?.color === piece.color) {
        targets.push([row, 2]);
      }
    }
  }

  return targets;
}

/** Convert a board move ([fromRow,fromCol] -> [toRow,toCol]) to SAN notation (simplified). */
export function moveToSan(board: Board, fromRow: number, fromCol: number, toRow: number, toCol: number, promotion?: PieceType): string {
  const piece = board[fromRow][fromCol];
  if (!piece) return '';

  const files = 'abcdefgh';
  const toFile = files[toCol];
  const toRank = String(8 - toRow);
  const fromFile = files[fromCol];
  const isCapture = !!board[toRow][toCol];

  // Castling
  if (piece.type === 'K') {
    if (fromCol === 4 && toCol === 6) return 'O-O';
    if (fromCol === 4 && toCol === 2) return 'O-O-O';
  }

  // Pawn
  if (piece.type === 'P') {
    const base = isCapture ? `${fromFile}x${toFile}${toRank}` : `${toFile}${toRank}`;
    const promoSuffix = promotion ? `=${promotion}` : '';
    return base + promoSuffix;
  }

  // For other pieces, check disambiguation
  const ambiguous: [number, number][] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (r === fromRow && c === fromCol) continue;
      const sq = board[r][c];
      if (sq && sq.type === piece.type && sq.color === piece.color && canReach(board, r, c, toRow, toCol, sq, piece.color)) {
        ambiguous.push([r, c]);
      }
    }
  }

  let disambig = '';
  if (ambiguous.length > 0) {
    const sameFile = ambiguous.some(([, c]) => c === fromCol);
    const sameRank = ambiguous.some(([r]) => r === fromRow);
    if (!sameFile) disambig = fromFile;
    else if (!sameRank) disambig = String(8 - fromRow);
    else disambig = `${fromFile}${8 - fromRow}`;
  }

  return `${piece.type}${disambig}${isCapture ? 'x' : ''}${toFile}${toRank}`;
}

/** Append a SAN move to a PGN string and return the updated PGN. */
export function appendMoveToPgn(pgn: string, san: string): string {
  const moves = parseMoves(pgn);
  const newMoveNum = moves.length;
  const color: Color = newMoveNum % 2 === 0 ? 'w' : 'b';
  const fullMoveNum = Math.floor(newMoveNum / 2) + 1;

  // Strip old result marker from the end of move text
  const moveText = extractMoveText(pgn).replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '').trim();
  const prefix = color === 'w' ? `${fullMoveNum}. ` : `${fullMoveNum}... `;
  const newMoveText = moveText ? `${moveText} ${prefix}${san} *` : `${prefix}${san} *`;

  // Rebuild: extract only the header lines, then append moves
  const headerLines = pgn.match(/^\[.*?\].*$/gm)?.join('\n') ?? '';
  return `${headerLines}\n\n${newMoveText}`.trim();
}

// ── Piece symbols ─────────────────────────────────────────────────────────────

export const PIECES: Record<Color, Record<PieceType, string>> = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
};
