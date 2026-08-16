/**
 * Tracking-parameter stripping — link canonicalization for outgoing and
 * incoming note content.
 *
 * A share sheet rarely hands out a clean URL. YouTube's appends `?si=…`, a
 * per-share identifier that ties the click back to the account that shared it;
 * every ad network appends its own click id (`fbclid`, `gclid`, `ttclid`), and
 * campaign tooling appends `utm_*`. Posting one to a relay forwards that
 * identifier to everyone who reads the note, and to everything that fetches
 * the link on their behalf — the link-preview unfurler included. Stripping is
 * applied on BOTH sides on purpose: on publish so what lands on the relay is
 * clean for every client and every future reader, and on view so a link that
 * arrived from elsewhere (another client, a repost, an old note) is cleaned
 * before this client renders or fetches it.
 *
 * Two rules keep this conservative enough to run unattended:
 *
 * - **A parameter is removed only if it is named**, either globally (click ids
 *   and campaign tags, which mean the same thing everywhere) or by a rule for
 *   that host. There is no heuristic — guessing wrong silently breaks a link,
 *   and a broken link is worse than a tracked one.
 * - **Nothing else about the URL is touched.** When no rule fires the input
 *   string is returned by identity, and the surviving parameters keep their
 *   original spelling and order rather than being re-encoded by
 *   `URLSearchParams`, whose round-trip is not the identity (`%20` becomes
 *   `+`, reserved characters are re-escaped). That matters beyond tidiness:
 *   attachment URLs are matched against their NIP-92 `imeta` tags by exact
 *   string, so a URL this function rewrites gratuitously is an attachment that
 *   loses its metadata.
 */

/**
 * Click and campaign identifiers stripped on every host.
 *
 * Everything here identifies the click, the campaign or the sharer, and is
 * inert as far as the destination page's content goes. Parameters that some
 * sites use for tracking but others use meaningfully — `ref`, `source`, `s`,
 * `t` — are deliberately NOT here; they belong to a host rule.
 */
const GLOBAL_PARAMS: ReadonlySet<string> = new Set([
  // Ad-network click ids.
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'gad_source',
  'gad_campaignid',
  'srsltid',
  'msclkid',
  'twclid',
  'ttclid',
  'yclid',
  'ymclid',
  'ysclid',
  'igshid',
  'igsh',
  'epik',
  'irclickid',
  'cjevent',
  'rdt_cid',
  'sc_cid',
  'wickedid',
  's_kwcid',
  'ef_id',
  'mkwid',
  'pcrid',
  'zanpid',
  'ranmid',
  'raneaid',
  'ransiteid',
  // Email / marketing-automation campaign ids.
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  '__s',
  '_hsenc',
  '_hsmi',
  '__hsfp',
  '__hssc',
  '__hstc',
  'hsctatracking',
  'trk_contact',
  'trk_msg',
  'trk_module',
  'trk_sid',
  // Analytics platforms.
  '_openstat',
  'icid',
  'ncid',
  'cmpid',
  'campid',
  // Consent-wall round-trip, added by Yahoo/AOL properties.
  'guccounter',
  'guce_referrer',
  'guce_referrer_sig',
]);

/**
 * Parameter-name prefixes stripped on every host: the campaign conventions of
 * Google Analytics (`utm_`), Matomo/Piwik (`pk_`, `mtm_`, `piwik_`, `matomo_`),
 * HubSpot (`hsa_`), Vero (`vero_`) and Omeda (`oly_`).
 */
const GLOBAL_PREFIXES: readonly string[] = [
  'utm_',
  'pk_',
  'piwik_',
  'matomo_',
  'mtm_',
  'hsa_',
  'vero_',
  'oly_',
];

interface HostRule {
  /**
   * Host suffixes the rule applies to. A rule matches `example.com` and every
   * subdomain of it, so one entry covers `www.`, `m.` and `music.` spellings.
   */
  hosts: readonly string[];
  /** Parameter names removed on these hosts, in addition to the global set. */
  params?: readonly string[];
  /** Parameter-name prefixes removed on these hosts. */
  prefixes?: readonly string[];
  /**
   * Match by shape instead of by suffix, for a site whose host is not a fixed
   * list. Only Google needs it — see {@link isGoogleHost}.
   */
  matchHost?: (host: string) => boolean;
  /**
   * Canonicalize the path. Returns a replacement `pathname` and/or sets
   * `dropQuery`, and is the one thing here that may rewrite a URL beyond
   * deleting parameters — used where a site encodes tracking in the path
   * itself.
   */
  canonical?: (u: URL) => { pathname?: string; dropQuery?: boolean } | void;
}

/**
 * Per-host rules, most-used sites first. Anything listed has been checked
 * against what the site's own share sheet emits; when in doubt a parameter is
 * left alone, because a stripped-but-meaningful parameter is a link that
 * silently goes somewhere else.
 */
const HOST_RULES: readonly HostRule[] = [
  {
    // `si` is the per-share identifier the YouTube share sheet appends; `pp`
    // is the opaque player blob on Shorts shares. `v`, `list`, `index`, `t`,
    // `start` and `end` all change what is played, and stay.
    hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'youtubekids.com'],
    params: [
      'si',
      'pp',
      'feature',
      'ab_channel',
      'kw',
      'source_ve_path',
      'embeds_referring_euri',
      'embeds_referring_origin',
      'embeds_euri',
      'embeds_origin',
      'themerefresh',
      'app',
    ],
  },
  {
    // `s` and `t` are the tweet share sheet's pair; `s` alone is also what the
    // "Copy link" button adds.
    hosts: ['x.com', 'twitter.com'],
    params: ['s', 't', 'src', 'ref_src', 'ref_url', 'cxt', 'tw_p'],
  },
  {
    hosts: ['facebook.com', 'fb.watch', 'fb.com'],
    params: [
      'ref',
      'refsrc',
      'hrc',
      '_rdr',
      'dti',
      'app',
      'sfnsn',
      'idorvanity',
      'wtsid',
      'rdid',
      'paipv',
      'eid',
      'comment_tracking',
      'action_history',
      'tracking',
      'video_source',
      'referral_code',
      'referral_story_type',
    ],
    prefixes: ['__tn__', '__cft__', '_ft_', '_nc_'],
  },
  {
    hosts: ['instagram.com'],
    params: ['source'],
  },
  {
    hosts: ['tiktok.com'],
    params: [
      'is_from_webapp',
      'sender_device',
      'sender_web_id',
      'web_id',
      '_r',
      '_t',
      'u_code',
      'preview_pb',
      'share_app_id',
      'share_item_id',
      'share_link_id',
      'share_author_id',
      'social_share_type',
      'tt_from',
      'source',
      'timestamp',
      'enter_from',
      'enter_method',
      'checksum',
      'sec_user_id',
      'ug_btm',
    ],
  },
  {
    // `context` and `sort` change which comments a permalink shows, so they
    // stay; everything below is share-sheet or app-attribution bookkeeping.
    hosts: ['reddit.com', 'redd.it'],
    params: [
      'share_id',
      'correlation_id',
      'ref',
      'ref_source',
      'rdt',
      'chainedposts',
      'post_fullname',
      '$deep_link',
      '$original_url',
      '_branch_match_id',
      '_branch_referrer',
    ],
  },
  {
    // Amazon encodes the search result a product was reached from in the PATH
    // (`/dp/B0…/ref=sr_1_3`) as well as the query, so a product link
    // canonicalizes to the bare ASIN. Non-product paths (search, lists) keep
    // their query — `k=` there IS the search.
    hosts: [
      'amazon.com',
      'amazon.co.uk',
      'amazon.ca',
      'amazon.de',
      'amazon.fr',
      'amazon.it',
      'amazon.es',
      'amazon.nl',
      'amazon.se',
      'amazon.pl',
      'amazon.in',
      'amazon.co.jp',
      'amazon.com.au',
      'amazon.com.br',
      'amazon.com.mx',
      'amazon.ae',
      'amazon.sg',
    ],
    params: [
      'ref',
      'psc',
      'qid',
      'sr',
      'sprefix',
      'crid',
      'th',
      '_encoding',
      'smid',
      'dib',
      'dib_tag',
      'content-id',
      'linkcode',
      'tag',
      'ascsubtag',
      'creative',
      'creativeasin',
      'linkid',
      'camp',
    ],
    prefixes: ['pd_rd_', 'pf_rd_', 'ref_'],
    canonical: (u) => {
      const m = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Za-z0-9]{10})(?:[/?]|$)/.exec(u.pathname);
      if (m) return { pathname: `/dp/${m[1]}`, dropQuery: true };
    },
  },
  {
    hosts: ['spotify.com', 'spotify.link'],
    params: ['si', 'nd', '_branch_match_id', '_branch_referrer'],
  },
  {
    // `i` names the track/episode within an album or show and must survive;
    // `at`/`itsct`/`itscg` are the affiliate and campaign tokens.
    hosts: ['apple.com'],
    params: ['at', 'ct', 'uo', 'ls', 'itscg', 'itsct', 'app'],
  },
  {
    hosts: ['soundcloud.com'],
    params: ['si', 'ref'],
  },
  {
    hosts: ['twitch.tv'],
    params: ['tt_content', 'tt_medium', 'sr'],
  },
  {
    hosts: ['bilibili.com', 'b23.tv'],
    params: [
      'spm_id_from',
      'from_source',
      'from_spmid',
      'share_source',
      'share_medium',
      'share_plat',
      'share_session_id',
      'share_tag',
      'unique_k',
      'vd_source',
      'buvid',
      'is_story_h5',
      'plat_id',
      'bbid',
      'ts',
      'timestamp',
      'mid',
    ],
  },
  {
    hosts: ['linkedin.com'],
    params: [
      'trk',
      'trkinfo',
      'traceid',
      'trackingid',
      'originalsubdomain',
      'refid',
      'midtoken',
      'midsig',
      'ebp',
      'li_fat_id',
      'licu',
      'lipi',
      'lici',
    ],
  },
  {
    hosts: ['medium.com'],
    params: ['source', 'sk', 'gi'],
  },
  {
    hosts: ['substack.com'],
    params: [
      'r',
      'showwelcome',
      'triedredirect',
      'triggershare',
      'isfreemail',
      'post_id',
      'publication_id',
    ],
  },
  {
    // A Google result URL carries the whole session: `ved`/`ei` identify the
    // click, `sxsrf` the search session. `q`, `tbm`, `tbs` and `hl` are the
    // query itself and stay.
    hosts: ['google.com'],
    matchHost: isGoogleHost,
    params: [
      'ved',
      'ei',
      'usg',
      'sa',
      'source',
      'oq',
      'aqs',
      'sourceid',
      'client',
      'sclient',
      'uact',
      'sxsrf',
      'iflsig',
      'gws_rd',
      'bih',
      'biw',
      'dpr',
    ],
    prefixes: ['gs_'],
  },
  {
    hosts: ['ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.fr', 'ebay.it', 'ebay.es', 'ebay.ca', 'ebay.com.au'],
    params: [
      '_trkparms',
      '_trksid',
      'hash',
      'amdata',
      'mkevt',
      'mkcid',
      'mkrid',
      'campid',
      'customid',
      'toolid',
      'ul_noapp',
    ],
  },
  {
    hosts: ['aliexpress.com', 'aliexpress.us'],
    params: ['spm', 'scm', 'scm_id', 'scm-url', 'pvid', 'btsid', 'ws_ab_test', 'gatewayadapt', 'srcsns', 'businesstype', 'curpageloguid'],
    prefixes: ['aff_', 'pdp_', 'algo_'],
  },
  {
    hosts: ['etsy.com'],
    params: ['click_key', 'click_sum', 'ref', 'frs', 'sts', 'organic_search_click', 'plkey'],
    prefixes: ['ga_'],
  },
  {
    hosts: ['walmart.com'],
    params: ['from', 'sid', 'adsredirect', 'classtype'],
    prefixes: ['ath'],
  },
  {
    hosts: ['target.com'],
    params: ['preselect', 'lnk', 'clkid', 'afid', 'ref'],
  },
  {
    hosts: ['imdb.com'],
    params: ['ref_', 'pf_rd_p', 'pf_rd_r'],
  },
  {
    hosts: ['steampowered.com', 'steamcommunity.com'],
    params: ['snr'],
  },
  {
    hosts: ['bandcamp.com'],
    params: ['from', 'search_item_id', 'search_page_id', 'search_rank', 'search_sig', 'label'],
  },
  {
    hosts: ['pinterest.com'],
    params: ['nic_v1', 'nic_v2', 'nic_v3', 'sender'],
  },
];

/** Whether `host` is `suffix` or a subdomain of it. */
function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * Google's search UI lives on ~190 ccTLDs (`google.co.uk`, `google.de`, …) that
 * all emit the same parameters, so the rule matches the shape rather than
 * enumerating them.
 */
function isGoogleHost(host: string): boolean {
  return /(^|\.)google(\.[a-z]{2,3})+$/.test(host);
}

function ruleFor(host: string): HostRule | undefined {
  return HOST_RULES.find(
    (rule) =>
      rule.matchHost?.(host) || rule.hosts.some((suffix) => hostMatches(host, suffix)),
  );
}

/** Whether a parameter name is stripped, given the rule for its host. */
function isTracking(name: string, rule: HostRule | undefined): boolean {
  const lower = name.toLowerCase();
  if (GLOBAL_PARAMS.has(lower)) return true;
  if (GLOBAL_PREFIXES.some((p) => lower.startsWith(p))) return true;
  if (!rule) return false;
  if (rule.params?.includes(lower)) return true;
  if (rule.prefixes?.some((p) => lower.startsWith(p))) return true;
  return false;
}

/**
 * Remove tracking parameters from a single URL, returning it canonicalized.
 *
 * Returns the input **unchanged, by identity** when it is not an http(s) URL,
 * when it does not parse, or when no rule fires — so a caller can cheaply test
 * `cleaned !== url` to know whether anything happened.
 */
export function stripTrackingParams(url: string): string {
  // Cheap rejection before the parser: the overwhelming majority of URLs in a
  // note carry no query at all, and this runs over every one of them.
  if (!url.includes('?') && !url.includes('/dp/') && !url.includes('/gp/')) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return url;

  const rule = ruleFor(parsed.hostname.toLowerCase());

  // Split the ORIGINAL string rather than working from the parsed URL, so
  // whatever survives keeps its exact original bytes (see the file comment).
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt);
  const queryAt = beforeHash.indexOf('?');
  let base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);

  let changed = false;
  let dropQuery = false;

  const canonical = rule?.canonical?.(parsed);
  if (canonical?.pathname && canonical.pathname !== parsed.pathname) {
    base = `${parsed.protocol}//${parsed.host}${canonical.pathname}`;
    changed = true;
    dropQuery = canonical.dropQuery ?? false;
  }

  let keptQuery = '';
  if (query && !dropQuery) {
    const kept = query.split('&').filter((pair) => {
      if (!pair) return false;
      const eq = pair.indexOf('=');
      const rawName = eq === -1 ? pair : pair.slice(0, eq);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        // A malformed escape is not a parameter name we know; keep it as-is.
      }
      return !isTracking(name, rule);
    });
    if (kept.length !== query.split('&').filter(Boolean).length) changed = true;
    keptQuery = kept.join('&');
  } else if (query && dropQuery) {
    changed = true;
  }

  if (!changed) return url;
  return `${base}${keptQuery ? `?${keptQuery}` : ''}${fragment}`;
}

/**
 * URLs inside note content. Matches the same scheme set `NoteContent`'s
 * tokenizer does, minus `wss?:` — a relay URL has no tracking to strip and is
 * rendered as an internal link rather than followed.
 */
const URL_IN_TEXT_RE = /https?:\/\/[^\s]+/gi;

/**
 * Trim trailing sentence punctuation that a URL matched greedily, re-attaching
 * a `)` that balances a `(` inside the URL (Wikipedia-style paths). Mirrors the
 * rule in `NoteContent`'s tokenizer, which has already applied it by the time
 * that renderer calls {@link stripTrackingParams} on a single URL — this copy
 * is for the publish path, which scans raw text.
 */
function splitTrailingPunctuation(url: string): [string, string] {
  const m = /^(.*?)([.,;:!?)\]]+)$/.exec(url);
  if (!m) return [url, ''];
  let [, head, punct] = m;
  while (punct.startsWith(')')) {
    const opens = (head.match(/\(/g) ?? []).length;
    const closes = (head.match(/\)/g) ?? []).length;
    if (opens <= closes) break;
    head += ')';
    punct = punct.slice(1);
  }
  if (!punct || !head || head.length <= 10) return [url, ''];
  return [head, punct];
}

/**
 * Strip tracking parameters from every URL in a block of text.
 *
 * Returns the input unchanged by identity when nothing was stripped. `skip`
 * holds URLs to leave alone verbatim — the publish path passes the uploaded
 * attachment URLs, which are matched to their `imeta` tags by exact string and
 * must never be rewritten.
 *
 * Used on the publish path, where the note body is still raw text; the render
 * path works from already-tokenized URLs and calls {@link stripTrackingParams}
 * directly.
 */
export function stripTrackingParamsInText(text: string, skip?: ReadonlySet<string>): string {
  if (!text.includes('http')) return text;
  let changed = false;
  const out = text.replace(URL_IN_TEXT_RE, (match) => {
    const [url, punct] = splitTrailingPunctuation(match);
    if (skip?.has(url)) return match;
    const cleaned = stripTrackingParams(url);
    if (cleaned === url) return match;
    changed = true;
    return `${cleaned}${punct}`;
  });
  return changed ? out : text;
}
