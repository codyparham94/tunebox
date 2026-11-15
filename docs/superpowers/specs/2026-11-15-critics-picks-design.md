# Critics' Picks tab — design

Date: 2026-11-15 · Status: approved

## Why

The user wants new, varied, currently talked-about music beyond the mainstream Deezer charts on the Charts tab: albums critics are praising right now, plus the critics' best-of lists. They pick an album from the tab, open it on YouTube Music, and play it.

## Goals

- A new nav tab, **Critics' Picks** (name is Claude's proposal; route `/critics`), placed right after Charts in `src/renderer/src/components/NavRail.tsx`.
- A switch at the top of the page between two modes (user's decision):
  - **Newly acclaimed:** one merged feed of recent, well-reviewed albums from several publications, newest first.
  - **Best of:** the publications' ranked or curated best-of lists, chosen from a picker.
- Every album shows its cover, title, artist, which publication picked it, and that publication's verdict (score or badge). Each album also links to the original review.
- Clicking an album opens its YouTube Music album page, the same way Charts' "Top albums" does today.
- Results show instantly from cache. A source that fails to update keeps its last good results and shows a small "couldn't update" note.

## Non-goals

- No review text, excerpts or summaries inside the app. Show the title, artist, score or badge and a link only (copyright; the link sends readers to the publication).
- No sign-in to any publication.
- Not in v1: Album of the Year / aoty.org (returns HTTP 403 to automated requests), Rate Your Music (bot-protected), and Metacritic (readable, but a later addition).
- No server or GitHub-built feed (see Approaches).

## Anti-goals (would make this a failure even if it technically works)

- The tab is empty or slow on open because it waits on a scrape.
- One site's redesign breaks the tab, or anything outside it.
- It turns into one publication's taste. The point is variety, so several sources and Pitchfork's genre lists are in from the start.
- It quietly plays the wrong album. A weak YouTube Music match should say "couldn't find" instead.

## Approaches

1. **Readers inside the app (picked by the user).** One small reader per site runs in the Electron main process, the way Tunebox already reads YouTube Music, Deezer, Last.fm and Spotify/Apple playlist pages. Results are cached in SQLite.
   - Pros: no new setup, and YouTube answers reliably from the user's machine.
   - Cons: a site redesign breaks that reader until the next app update, though auto-update makes a fix quick to ship.
2. **A feed built on GitHub.** A scheduled Action scrapes the sites and publishes one JSON file, and the app downloads it.
   - Pros: instant loads, and reader fixes don't need an app release.
   - Cons: YouTube often blocks GitHub's machines (the Mac workflow already notes this), so The Needle Drop's best-of list would fail. It also adds a scheduled job to look after.
3. **Hybrid:** Newly acclaimed in-app, Best of from GitHub. It has the downsides of both, so it was rejected.

## Sources (checked live on 2026-11-15)

### Newly acclaimed

| Source | Where | What counts | Fields available | Verdict shown |
|---|---|---|---|---|
| Pitchfork Best New Albums | `https://pitchfork.com/reviews/best/albums/` (HTML) | Every entry (the page is Pitchfork's "Best New Music" selection) | Album = `summary-item__hed` (`<em>` text), artist = `summary-item__sub-hed`, image, review link. No score on the list page. | "Best New Music". Adding the numeric score would take one fetch per review page; that's the builder's call. |
| The Needle Drop (Anthony Fantano) | List: `https://www.theneedledrop.com/album-reviews/` (Ghost site). Each review page, e.g. `/album-reviews/brakence-marrow-album-review-ihaqnk-d6ny/` | Score **8/10 or higher** (Claude's call) | Review page `<title>` is "Artist - Album", the score appears as `N/10` in the page, and the YouTube embed id is in the page | "Fantano 9/10" |
| Bandcamp Daily, Album of the Day | RSS `https://daily.bandcamp.com/feed` | Items whose `<category>` is "Album of the Day" | Title is `Artist, “Album”`, plus link and date | "Album of the Day" |
| Stereogum, Album of the Week | RSS `https://www.stereogum.com/category/reviews/album-of-the-week/feed/` | Every item | Title is "Album Of The Week: Artist Album" with **no separator**. Split it using the italicized album title in the article body. | "Album of the Week" |

Notes:
- **The Needle Drop** needs one page fetch per review. Fetch only the newest ~24 reviews, and cache each parsed review by URL permanently, since reviews don't change. Confirm where the score lives in the page markup: the brakence page shows `2/10` three times, so pick the element that holds the verdict, not stray text.
- **Stereogum:** if the artist/album split turns out unreliable, drop the source rather than guess.
- **Bandcamp** releases often aren't on YouTube Music. Expect more "couldn't find" results from it. That's acceptable.

### Best of

| Source | How to find lists | Entry format | Ranked? |
|---|---|---|---|
| Pitchfork | Links on `https://pitchfork.com/features/lists-and-guides/` matching `/features/lists-and-guides/best-(<genre>-)?albums-<year>/`. Seen on 2026-11-15: `best-albums-2022…2025`, `best-rock-albums-2022…2025`, `best-rap-albums-2024`, `best-pop-albums-2025`, `best-electronic-albums-2025`. Mid-year lists use a different slug (`best-albums-2026-so-far` is a 404), so match any lists-and-guides link with "best" and "albums" in the slug and a year. | `<h2>Artist: <em>Album</em></h2>`, about 50 per page | Yes. Confirm whether the page counts down (50→1) or up. |
| The Needle Drop | YouTube video "Top 50 Albums of <year>" on channel `theneedledrop` (UCt7fwAhXDy3oNFTAzF2o8Pw), found with youtubei.js search (already in the app) | Description lines: `Artist - Album`, then a YouTube link | No: the description is alphabetical. Show it unnumbered. |

- Show the lists for the current and previous year: the 2025 lists now, and the 2026 ones once they're published (year-end lists come out in December).
- The picker shows "Source · List title". The default is the newest general (non-genre) Pitchfork list.

## Design

### Main process

- **New module `src/main/sources/critics.ts`.** Split it into `src/main/sources/critics/<source>.ts` if it grows past about 250 lines.
- **Parsing:** use regexes and string handling, the same as `src/main/sources/deezer.ts` and `src/main/import/external.ts` / `playlistUrl.ts` do. Don't add an HTML-parser dependency.
- **Readers:** each one returns `CriticAlbum[]` and throws on failure. A reader never throws because of a single bad entry; it skips that entry.
- **Fetch timeouts:** every fetch in the critics code passes `signal: AbortSignal.timeout(15_000)`. This covers the new code only. The app-wide fix for audit item #7 stays out of this branch: in `stream/protocol.ts` a whole-body timeout could cut off audio on slow connections, so it needs its own change.
- **Shared types** in `src/shared/types.ts`:

```ts
export type CriticSource = 'pitchfork' | 'needledrop' | 'bandcamp' | 'stereogum'
export interface CriticAlbum {
  title: string
  artist: string
  artUrl?: string
  source: CriticSource
  /** what the publication said: "Best New Music", "9/10", "Album of the Day" */
  verdict: string
  reviewUrl: string
  /** ms epoch of the review, when known */
  date?: number
  /** position in a ranked best-of list */
  rank?: number
}
export interface CriticFeed { albums: CriticAlbum[]; failed: CriticSource[]; builtAt: number }
export interface CriticListSummary { id: string; source: CriticSource; title: string; year: number; ranked: boolean }
export interface CriticList extends CriticListSummary { albums: CriticAlbum[] }
```

- **IPC:** a new group `critics` with:
  - `feed(refresh?: boolean): CriticFeed`
  - `lists(): CriticListSummary[]`
  - `list(id: string): CriticList`

  Wire it through `API_METHODS`, the handler map in `src/main/ipc/index.ts`, and the preload/`TuneboxApi` types, like the existing groups.
- **Caching:** use the existing `getState`/`setState` from `src/main/db/settings.ts` for storage, the way the Discover feed does. Unlike Discover, the tab never waits on a rebuild when it already has a cache (show what's cached, then refresh behind it):
  - The feed is stored under key `critics`.
  - Cache younger than 6 hours: return it.
  - Cache older than that: return it **immediately** and start a rebuild in the background. When the rebuild finishes, push a new event `EVENT.critics` (`'event:critics'`, added beside the existing events in `src/shared/api.ts`) carrying the new `CriticFeed`. The renderer writes it into the query cache with `queryClient.setQueryData`, the same pattern `App.tsx` uses for `EVENT.health`.
  - No cache at all (first open): wait for the build and show skeletons meanwhile. Nothing is fetched at startup or in the background before the user first opens the tab, so there's no network traffic for a tab they never use.
  - `refresh: true` (a "Refresh" button on the page) waits for a full rebuild and returns it.
  - Readers run in parallel. A failed reader keeps its previous albums and is listed in `failed`.
  - List index: 1 day. Each list's contents: 7 days, with the same "return stale, refresh behind it" rule.
  - Fix audit item #15 at the same time: `getSettings` reads every `state:*` row on every audio request, and a large critics blob would make that worse. Change it to `WHERE key NOT LIKE 'state:%'`.
- **Feed order (All):** interleave the sources in turn: the newest from each source, then the second-newest from each, and so on. Within a source, newest first.
  - Strict newest-first across sources would let Bandcamp (daily) swamp Stereogum (weekly), which works against the variety goal.
  - Each source chip shows that source alone, newest first.
- **Pitchfork dates:** take them from Pitchfork's album-review RSS (`https://pitchfork.com/feed/feed-album-reviews/rss`, which has `pubDate` and the review link). Match by review URL; a Best New Albums entry missing from the RSS has no date. Don't fetch review pages just for dates.
- **Duplicates:** an album picked by two publications (same normalized artist and title) appears once, under the source it came from first in the interleave. Multiple badges on one card are out.
- **Feed length:** about 20 newest items per source.

### Renderer

- **New page `src/renderer/src/pages/Critics.tsx`** on route `/critics`, with a NavRail entry right after Charts. Pick or add an icon in `Icons.tsx`.
- **Mode switch:** the existing `role="tab" className="tab"` pattern from `pages/Radio.tsx:186`. Default mode: Newly acclaimed.
- **Newly acclaimed view:**
  - Source filter chips: All, Pitchfork, The Needle Drop, Bandcamp, Stereogum.
  - A card grid using the existing `.card` / `.card-grid` styles.
  - Each card has a verdict badge, a relative date via `timeAgo` in `lib/format.ts`, and a "Read review" link that opens externally. `https://` links already go to the system browser via `setWindowOpenHandler` in `src/main/index.ts`.
  - Any reader listed in `failed` shows a quiet note: "Couldn't update Pitchfork just now."
- **Best of view:**
  - A list picker using the same `<select className="input">` pattern as Charts' genre picker.
  - Ranked lists show the rank on each card with the existing `.rank-badge`. Unranked lists show none.
- **Opening an album:** reuse Charts' `useOpen` + `AlbumCardFromChart` (`pages/Charts.tsx:125-199`). Move them to `components/Cards.tsx` as one shared album-lookup card, with optional rank, verdict and review link, so both pages use one component instead of a copy.
  - The lookup is `api.catalog.findAlbum(title, artist)`, which calls `findAlbumId` in `src/main/sources/ytmusic.ts`. That function currently falls back to any album by the artist, then to the first search result. Either fallback opens the wrong album, which is exactly the "quietly plays the wrong album" anti-goal, and it would be common for new, little-known releases.
  - **Change the album lookup to need both artist and title.** The artist must match by `normalizeArtist`. The title must match by `normalizeTitle`, or score at least 0.8 with `similarity()` from `src/main/util/text.ts`. Tune that threshold against real chart and critic entries.
  - **When only the artist is found**, open the artist's page and show a toast: "Couldn't find “Album” on YouTube Music, so here's Artist". This copies the existing fallback in `lib/nav.ts` `album()`.
  - **When nothing matches**, show the existing "Couldn't find … on YouTube Music" toast.
  - To do this, `findAlbum` returns `{ albumId?: string; artistId?: string }` instead of a bare id.
  - Charts' "Top albums" shares this lookup, so it gets the same stricter, more honest behavior. That's intended.
- **Data loading:** TanStack Query with keys `['critics','feed']`, `['critics','lists']` and `['critics','list',id]`, and `staleTime` matched to the cache times above.

### Testing

- **Parser unit tests** in `tests/critics.test.ts`, run against trimmed saved copies of each page or feed in `tests/fixtures/critics/`. Use one fixture per reader. When a site redesigns, refreshing its fixture shows exactly what broke.
- **Live check in the dev build** over the remote-debugging port: open the tab in both modes, filter by each source, open three albums from different sources, and confirm one shows the "couldn't find" toast instead of a wrong album.

## Claude's calls (correctable)

- The name "Critics' Picks".
- The Needle Drop counts at 8/10 and up.
- Variety comes from the four sources plus Pitchfork's genre lists.
- "All" interleaves the sources instead of going strictly newest-first.
- Stale results show instantly while fresh ones load behind them, and nothing is fetched before the tab is first opened.
- Stereogum gets dropped if its title split is unreliable.
- The album lookup needs both artist and title, with a fallback to the artist page. Charts gets this too.
- Audit item #15 is fixed alongside. The app-wide timeouts (audit item #7) are left for their own change.

## Left to the builder

- The exact selectors and regexes.
- Where the Needle Drop score sits in the page.
- Pitchfork's list order.
- Whether to fetch Pitchfork's numeric scores.
- The icon.
- Exact cache keys.
- How the empty state and per-source failure notes look, within the existing styles.
