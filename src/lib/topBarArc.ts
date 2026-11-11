/**
 * The mobile top bar's background shape. Over a page with a tab bar of its
 * own the bar is flat, and the tab bar's arc closes the two off together;
 * elsewhere the bar ends in an arc with a border line along it.
 *
 * Both are drawn from one function of how flat the bar is (0 arc, 1 flat),
 * so a swipe back between the two kinds of page can draw the steps between
 * them (see `BackSwipe`) rather than the bar switching when the swipe lands.
 */

/** The bar's content height in px (`h-10` in MobileTopBar). */
const BAR_HEIGHT_PX = 40;

/** How far the SVG hangs below the bar to fit the arc. */
export const TOP_BAR_ARC_OVERHANG_PX = 20;

/** The SVG's viewBox is 100 wide and this tall, stretched over the bar plus its overhang. */
const VIEW_HEIGHT = 64;

/** Where the arc meets the bar's sides, and how low its middle dips, in viewBox units. */
const ARC_SIDE_Y = 44;
const ARC_DIP_Y = 64;

/** The bar's own bottom edge in viewBox units. */
const FLAT_Y = (VIEW_HEIGHT * BAR_HEIGHT_PX) / (BAR_HEIGHT_PX + TOP_BAR_ARC_OVERHANG_PX);

/** On the bar's SVG (MobileTopBar), with the shape React last rendered: `arc` or `flat`. */
const TOP_BAR_ARC_ATTRIBUTE = 'data-top-bar-arc';

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The filled shape and its border line, `flatness` of the way from the arc to flat. */
export function topBarArcPaths(flatness: number): { fill: string; edge: string; edgeOpacity: number } {
  const side = round(ARC_SIDE_Y + (FLAT_Y - ARC_SIDE_Y) * flatness);
  const dip = round(ARC_DIP_Y + (FLAT_Y - ARC_DIP_Y) * flatness);
  return {
    fill: `M0,0 L100,0 L100,${side} Q50,${dip} 0,${side} Z`,
    edge: `M0,${side} Q50,${dip} 100,${side}`,
    edgeOpacity: round(1 - flatness),
  };
}

/** How flat the bar on screen is rendered: 0 or 1, or undefined when the page has no top bar. */
export function getTopBarFlatness(): number | undefined {
  const shape = document.querySelector(`[${TOP_BAR_ARC_ATTRIBUTE}]`)?.getAttribute(TOP_BAR_ARC_ATTRIBUTE);
  return shape === 'flat' ? 1 : shape === 'arc' ? 0 : undefined;
}

/** Draw the bar on screen at `flatness`, over what React rendered. */
export function paintTopBarArc(flatness: number): void {
  const paths = document.querySelectorAll(`[${TOP_BAR_ARC_ATTRIBUTE}] path`);
  const [fill, edge] = paths;
  if (!fill || !edge) return;
  const next = topBarArcPaths(Math.min(1, Math.max(0, flatness)));
  fill.setAttribute('d', next.fill);
  edge.setAttribute('d', next.edge);
  edge.setAttribute('stroke-opacity', String(next.edgeOpacity));
}

/** Put the bar back to the shape React rendered. */
export function resetTopBarArc(): void {
  const flatness = getTopBarFlatness();
  if (flatness !== undefined) paintTopBarArc(flatness);
}
