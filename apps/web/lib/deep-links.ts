/**
 * Per-book deep-link builders for place-trade.
 *
 * Each book has its own URL schema for pre-filling the bet slip. Where
 * we know the format it returns a URL ready to open in a new tab. Where
 * we don't, it returns null and the Chrome extension takes over: the
 * extension opens the event page and simulates clicking the outcome.
 *
 * Every builder is pure and never throws — the caller renders a disabled
 * button when the return value is null.
 */

export interface DeepLinkContext {
  readonly bookKey: string;
  readonly eventSlug?: string | null;
  readonly marketId?: string | null;
  readonly selectionId?: string | null;
  readonly stake?: number | null;
}

export interface DeepLink {
  readonly url: string;
  readonly method: "url" | "extension";
}

type Builder = (ctx: DeepLinkContext) => DeepLink | null;

const builders: Record<string, Builder> = {
  // FanDuel accepts marketId/selectionId on /addToBetslip — known-good.
  fanduel: (ctx) => {
    if (!ctx.marketId || !ctx.selectionId) return null;
    const qs = new URLSearchParams({
      marketId: ctx.marketId,
      selectionId: ctx.selectionId,
    });
    if (ctx.stake && ctx.stake > 0) qs.set("stake", ctx.stake.toFixed(2));
    return {
      url: `https://sportsbook.fanduel.com/addToBetslip?${qs.toString()}`,
      method: "url",
    };
  },

  // DraftKings event-level URL. The extension content script finishes the
  // job by clicking the outcome once the page renders.
  draftkings: (ctx) => {
    if (!ctx.eventSlug) return null;
    return {
      url: `https://sportsbook.draftkings.com/event/${encodeURIComponent(ctx.eventSlug)}`,
      method: "extension",
    };
  },

  // BetMGM uses a deep-link scheme via their mobile app fallback, but on
  // web the best we can do is land on the event page — extension fills it.
  betmgm: (ctx) => {
    if (!ctx.eventSlug) return null;
    return {
      url: `https://sports.ny.betmgm.com/en/sports/events/${encodeURIComponent(ctx.eventSlug)}`,
      method: "extension",
    };
  },

  caesars: (ctx) => {
    if (!ctx.eventSlug) return null;
    return {
      url: `https://sportsbook.caesars.com/us/ny/bet/event/${encodeURIComponent(ctx.eventSlug)}`,
      method: "extension",
    };
  },

  betrivers: (ctx) => {
    if (!ctx.eventSlug) return null;
    return {
      url: `https://ny.betrivers.com/?page=sportsbook#event/${encodeURIComponent(ctx.eventSlug)}`,
      method: "extension",
    };
  },

  bet365: () => null,
  fanatics: () => null,
  espnbet: () => null,
};

export function buildDeepLink(ctx: DeepLinkContext): DeepLink | null {
  const builder = builders[ctx.bookKey];
  return builder ? builder(ctx) : null;
}

/**
 * Returns true if at least a URL-level link can be built for this book.
 * Used by the UI to pick between "Open bet slip" and "Open via extension".
 */
export function hasDeepLink(bookKey: string): boolean {
  return bookKey in builders;
}
