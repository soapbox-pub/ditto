import { useCallback, useMemo, useState } from 'react';
import {
  ChessBishop, ChessKing, ChessKnight, ChessPawn, ChessQueen, ChessRook,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  type Board, type Color, type PieceType,
  buildPositions, formatResult, initialBoard, isGameInProgress,
  parseMoves, parsePgnHeaders,
} from '@/lib/chess';
import { cn } from '@/lib/utils';
import type { LucideProps } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

// ── Piece icons ───────────────────────────────────────────────────────────────

type IconComp = React.ComponentType<LucideProps>;

const PIECE_ICONS: Record<PieceType, IconComp> = {
  K: ChessKing, Q: ChessQueen, R: ChessRook, B: ChessBishop, N: ChessKnight, P: ChessPawn,
};

function PieceIcon({ type, color, className }: { type: PieceType; color: Color; className?: string }) {
  const Icon = PIECE_ICONS[type];
  return (
    <Icon
      className={className}
      stroke={color === 'w' ? '#ffffff' : '#1c1917'}
      strokeWidth={2}
    />
  );
}

// ── Shared board ──────────────────────────────────────────────────────────────

function ChessBoard({ board, flipped = false }: { board: Board; flipped?: boolean }) {
  const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="w-full rounded-xl overflow-hidden shadow-sm">
      {ranks.map(rank => (
        <div key={rank} className="flex">
          {files.map(file => {
            const piece = board[7 - rank]?.[file] ?? null;
            const light = (rank + file) % 2 === 0;
            return (
              <div key={file} className={cn('flex items-center justify-center aspect-square flex-1', light ? 'bg-[#f0d9b5]' : 'bg-[#b58863]')}>
                {piece && <PieceIcon type={piece.type} color={piece.color} className="size-[76%]" />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Player row ────────────────────────────────────────────────────────────────

function PlayerRow({ name, elo, isWhite, isWinner }: {
  name: string; elo?: string; isWhite: boolean; isWinner?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className={cn(
        'w-3.5 h-3.5 rounded-sm border shrink-0',
        isWhite ? 'bg-white border-stone-300' : 'bg-stone-900 border-stone-600',
      )} />
      <span className="text-sm font-semibold truncate">{name}</span>
      {elo && <span className="text-xs text-muted-foreground shrink-0">({elo})</span>}
      {isWinner && <span className="ml-auto text-amber-400 text-xs font-bold shrink-0">★</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ChessGameContentProps {
  event: NostrEvent;
  mode?: 'fullCard' | 'detail';
}

export function ChessGameContent({ event, mode = 'detail' }: ChessGameContentProps) {
  const pgn = event.content.trim();
  const { user } = useCurrentUser();
  const headers = useMemo(() => parsePgnHeaders(pgn), [pgn]);
  const moves = useMemo(() => parseMoves(pgn), [pgn]);
  const positions = useMemo(() => buildPositions(moves), [moves]);

  const [moveIndex, setMoveIndex] = useState(positions.length - 1);
  const [flipped, setFlipped] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);

  const goFirst = useCallback(() => setMoveIndex(0), []);
  const goPrev  = useCallback(() => setMoveIndex(i => Math.max(0, i - 1)), []);
  const goNext  = useCallback(() => setMoveIndex(i => Math.min(positions.length - 1, i + 1)), [positions.length]);
  const goLast  = useCallback(() => setMoveIndex(positions.length - 1), []);

  const board = positions[moveIndex] ?? initialBoard();

  const white = headers['White'] ?? 'White';
  const black = headers['Black'] ?? 'Black';
  const eventName = headers['Event'];
  const site = headers['Site'];
  const date = headers['Date'];
  const result = headers['Result'];
  const whiteElo = headers['WhiteElo'];
  const blackElo = headers['BlackElo'];

  const { text: resultText, color: resultColor } = formatResult(result);
  const inProgress = isGameInProgress(result);
  const totalMoves = moves.length;

  const playerPubkeys = event.tags.filter(([t]) => t === 'p').map(([, v]) => v);
  const whoseTurn: Color = totalMoves % 2 === 0 ? 'w' : 'b';

  // Determine which color the current user is playing.
  // p-tags: first p-tag is Black (the challenged opponent), event author is White.
  // If no p-tags, event author is White by convention.
  const isWhitePlayer = user && event.pubkey === user.pubkey;
  const isBlackPlayer = user && playerPubkeys.length > 0 && playerPubkeys.includes(user.pubkey);
  const isPlayer = isWhitePlayer || isBlackPlayer;
  const myColor: Color | null = isWhitePlayer ? 'w' : isBlackPlayer ? 'b' : null;
  const isMyTurn = isPlayer && inProgress && myColor === whoseTurn;

  const lichessUrl = site?.includes('lichess.org') ? site : null;

  const moveGroups = useMemo(() => {
    const groups: { num: number; white: string; black?: string }[] = [];
    for (let i = 0; i < moves.length; i += 2)
      groups.push({ num: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] });
    return groups;
  }, [moves]);

  if (!pgn) return null;

  // Derived player order based on flip state
  const topPlayer   = flipped ? white : black;
  const topElo      = flipped ? whiteElo : blackElo;
  const topIsWhite  = flipped;
  const botPlayer   = flipped ? black : white;
  const botElo      = flipped ? blackElo : whiteElo;
  const botIsWhite  = !flipped;

  const continueModal = (
    <ReplyComposeModal
      event={event}
      open={continueOpen}
      onOpenChange={setContinueOpen}
      initialMode="chess"
      initialPgn={pgn}
    />
  );

  // ── Shared structure for both modes ──────────────────────────────────────
  const turnFooter = inProgress ? (
    isMyTurn ? (
      <button
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
        onClick={e => { e.stopPropagation(); setContinueOpen(true); }}
      >
        <ChessKnight className="size-4" />
        Your turn — make a move
      </button>
    ) : (
      <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
        <div className={cn('w-2.5 h-2.5 rounded-sm border border-border/60', whoseTurn === 'w' ? 'bg-white' : 'bg-stone-900')} />
        {whoseTurn === 'w' ? white : black}'s turn
      </div>
    )
  ) : (
    <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground">
      {resultColor === 'white' && <div className="w-2.5 h-2.5 rounded-sm bg-white border border-border/60" />}
      {resultColor === 'black' && <div className="w-2.5 h-2.5 rounded-sm bg-stone-900" />}
      {resultText}
    </div>
  );

  // ── Full-card mode ────────────────────────────────────────────────────────
  if (mode === 'fullCard') {
    return (
      <div className="w-full" onClick={e => e.stopPropagation()}>
        {/* Top player */}
        <div className="px-3 py-1.5">
          <PlayerRow name={topPlayer} elo={topElo} isWhite={topIsWhite} isWinner={resultColor === (topIsWhite ? 'white' : 'black')} />
        </div>

        {/* Board — full width square */}
        <div className="w-full aspect-square px-3 pb-1">
          <ChessBoard board={board} flipped={flipped} />
        </div>

        {/* Bottom player */}
        <div className="px-3 py-1.5">
          <PlayerRow name={botPlayer} elo={botElo} isWhite={botIsWhite} isWinner={resultColor === (botIsWhite ? 'white' : 'black')} />
        </div>

        {/* Turn / result footer */}
        {turnFooter}

        {continueModal}
      </div>
    );
  }

  // ── Detail mode ───────────────────────────────────────────────────────────
  return (
    <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
      {(eventName || date) && (
        <div className="text-[12px] text-muted-foreground px-1">
          {[eventName, date?.replace(/\./g, '-')].filter(Boolean).join(' · ')}
        </div>
      )}

      {/* Top player */}
      <PlayerRow name={topPlayer} elo={topElo} isWhite={topIsWhite} isWinner={resultColor === (topIsWhite ? 'white' : 'black')} />

      {/* Board */}
      <div className="px-1">
        <ChessBoard board={board} flipped={flipped} />
      </div>

      {/* Bottom player */}
      <PlayerRow name={botPlayer} elo={botElo} isWhite={botIsWhite} isWinner={resultColor === (botIsWhite ? 'white' : 'black')} />

      {/* Nav controls */}
      {totalMoves > 0 && (
        <div className="flex items-center justify-center gap-0.5 pt-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={goFirst} disabled={moveIndex === 0}><ChevronsLeft className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={goPrev}  disabled={moveIndex === 0}><ChevronLeft className="size-4" /></Button>
          <span className="text-xs text-muted-foreground tabular-nums w-20 text-center">
            {moveIndex === 0 ? 'Start' : `${moveIndex} / ${totalMoves}`}
          </span>
          <Button variant="ghost" size="icon" className="size-8" onClick={goNext} disabled={moveIndex === totalMoves}><ChevronRight className="size-4" /></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={goLast} disabled={moveIndex === totalMoves}><ChevronsRight className="size-4" /></Button>
        </div>
      )}

      {/* Turn / result */}
      {turnFooter}

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {totalMoves > 0 && <Badge variant="outline" className="text-[11px]">{Math.ceil(totalMoves / 2)} move{Math.ceil(totalMoves / 2) !== 1 ? 's' : ''}</Badge>}
        {headers['ECO'] && <Badge variant="outline" className="text-[11px] font-mono">{headers['ECO']}</Badge>}
        {headers['TimeControl'] && <Badge variant="outline" className="text-[11px]">{headers['TimeControl']}</Badge>}
        {lichessUrl && (
          <a href={lichessUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            <ExternalLink className="size-3" />Lichess
          </a>
        )}
      </div>

      {/* Move list */}
      {moveGroups.length > 0 && (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <div className="px-3 py-2 bg-secondary/30 border-b border-border/50 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Moves</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">{totalMoves} half-moves</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <table className="w-full text-[12px]">
              <tbody>
                {moveGroups.map(g => {
                  const wi = (g.num - 1) * 2 + 1;
                  const bi = (g.num - 1) * 2 + 2;
                  return (
                    <tr key={g.num} className="border-b border-border/30 last:border-0 hover:bg-secondary/20">
                      <td className="px-2 py-1.5 text-muted-foreground tabular-nums w-8 text-right">{g.num}.</td>
                      <td className={cn('px-2 py-1.5 font-mono cursor-pointer hover:text-primary transition-colors', moveIndex === wi && 'bg-primary/10 text-primary font-semibold')} onClick={() => setMoveIndex(wi)}>{g.white}</td>
                      <td className={cn('px-2 py-1.5 font-mono cursor-pointer hover:text-primary transition-colors', g.black && moveIndex === bi && 'bg-primary/10 text-primary font-semibold')} onClick={() => g.black && setMoveIndex(bi)}>{g.black ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CTA — only for players */}
      {isMyTurn && (
        <Button className="w-full gap-2" onClick={() => setContinueOpen(true)}>
          <ChessKnight className="size-4" />Make your move
        </Button>
      )}

      {continueModal}
    </div>
  );
}
