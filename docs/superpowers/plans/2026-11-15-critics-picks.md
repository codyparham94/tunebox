# Critics' Picks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "Critics' Picks" tab with two modes. "Newly acclaimed" shows recent well-reviewed albums from Pitchfork, The Needle Drop, Bandcamp Daily and Stereogum. "Best of" shows Pitchfork and Needle Drop best-of lists. Clicking an album opens it on YouTube Music.

**Architecture:**
- Each site has a reader in `src/main/sources/critics/`: pure parsers, tested against saved fixtures, plus a fetch wrapper.
- `critics/index.ts` runs scans and stores the results with `getState`/`setState`. It scans once at app start and again on Refresh, then pushes the result to the renderer with a new `EVENT.critics`.
- The renderer page reuses Charts' album-lookup card, which moves to `Cards.tsx`. The lookup itself gets stricter.

**Tech Stack:** Electron main (Node fetch, `node:sqlite`), youtubei.js, React 19 + TanStack Query v5, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-critics-picks-design.md` (read it; it has the source URLs and markup notes).

## Global Constraints

- **No new dependencies.** Parse with regexes and string handling, the way `src/main/sources/deezer.ts` and `src/main/import/external.ts` do.
- **Every critics fetch:**
  - Passes `signal: AbortSignal.timeout(15_000)`.
  - Sends `user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36`. Node's default user agent may be refused.
- **No review text, excerpts or summaries** are stored, shown or kept in fixtures: only title, artist, art, verdict, date, rank and link. Trim fixtures to the markup the parser reads and delete review prose.
- **A reader skips a bad entry** and never throws because of one. It throws only when the whole fetch or page fails.
- **Example entries in the tests** (Donwill & The Expert, Krill, Sharp Pins, Aesop Rock, brakence) were checked live on 2026-11-15. If a freshly captured fixture no longer contains one, replace it with an entry that is in the fixture. Keep the assertion's shape.
- **Scan schedule (the user's decision):**
  - Once, 10 s after the main window's `did-finish-load`.
  - Again only when the user clicks Refresh.
  - No timers and no refetch on age. TanStack queries use `staleTime: Infinity`.
- **What counts:**
  - The Needle Drop counts only at **8/10 or higher**.
  - At most **20** newest items per source in the feed.
- **Source names** (UI copy): `pitchfork` → "Pitchfork", `needledrop` → "The Needle Drop", `bandcamp` → "Bandcamp", `stereogum` → "Stereogum".
- **Verdicts:**
  - Pitchfork: `"Best New Music"`.
  - The Needle Drop: `"<n>/10"`.
  - Bandcamp: `"Album of the Day"`.
  - Stereogum: `"Album of the Week"`.
  - The card badge reads `"<Source name> · <verdict>"`.
- **Storage keys** (all via `getState`/`setState`): `critics:feed`, `critics:needledrop` (parsed reviews by URL), `critics:lists`, `critics:list:<id>`.
- **List ids:** `pitchfork:<slug>` (e.g. `pitchfork:best-albums-2025`) and `needledrop:top50-<year>`.
- **Copy:**
  - Failure note: `Couldn’t update <Source name> just now.`
  - Album fallback toast: `Couldn’t find “<Album>” on YouTube Music, so here’s <Artist>.`
  - Nothing-found toast: keep the existing `Couldn’t find “<Album>” on YouTube Music.` (Charts' current wording).

## Review Focus

1. **HTML entities and curly quotes** in titles (`&amp;`, `&#8217;`, `“…”`) must show as text, so "Snakes &amp; Ladders" displays as "Snakes & Ladders". Tests: Task 2 Step 1 and Task 4 Step 1.
2. **A 200 response that parses to zero entries** (bot check, consent page, redesign) must count as a failed reader. It must never replace the stored albums with nothing. Tests: Task 2 Step 1 (`requireSome`) and Task 5 Step 1.
3. **Offline at startup:** every reader fails, the stored feed stays, `failed` lists all four sources, and a later Refresh works. Test: Task 5 Step 1.
4. **Refresh during the startup scan** joins the running scan and doesn't start a second one. Test: Task 5 Step 1.
5. **Multi-artist names and " - " inside album titles** ("Donwill & The Expert"; a Fantano line like "Artist - Album - Deluxe") must split and match correctly. Tests: Task 1 Step 1 and Task 3 Step 1.

---

### Task 1: Stricter album lookup + shared lookup card

**Files:**
- Modify: `src/main/sources/matcher.ts` (add `pickAlbum`)
- Modify: `src/main/sources/ytmusic.ts`:
  - Replace `findAlbumId` (around line 300) with `findAlbum`.
  - Add a `strict` flag to `findArtistId`.
- Modify: `src/shared/api.ts:54` (`findAlbum` return type), `src/main/ipc/index.ts:77`
- Modify: `src/renderer/src/components/Cards.tsx`, `src/renderer/src/pages/Charts.tsx:125-199`
- Test: `tests/matcher.test.ts`

**Interfaces:**
- Produces:
  - `pickAlbum(albums: { id: string; title: string; artist: string }[], title: string, artist: string): string | undefined` in `matcher.ts`.
  - `findArtistId(name: string, strict = false): Promise<string | undefined>`. In strict mode it returns an id only when the `normalizeArtist` names are exactly equal; otherwise it behaves as today.
  - `ytm.findAlbum(title: string, artist: string): Promise<{ albumId?: string; artistId?: string }>`.
  - `TuneboxApi.catalog.findAlbum(title, artist): Promise<{ albumId?: string; artistId?: string }>`.
  - In `Cards.tsx`:
    - `useBusy(): { busy: string | null; run(key: string, task: () => Promise<void>): Promise<void> }`. `run` sets busy, toasts `errorMessage(err)` on a throw, then clears busy.
    - `LookupAlbumCard(props: { title: string; artist: string; artUrl?: string; rank?: number; badge?: string; date?: number; reviewUrl?: string })`.

- [ ] **Step 1: Write the failing tests** in `tests/matcher.test.ts`:

```ts
describe('pickAlbum', () => {
  const yt = [
    { id: 'A1', title: 'Older Record', artist: 'Krill' },
    { id: 'A2', title: 'Secret Language', artist: 'Krill' },
    { id: 'A3', title: 'Secret Language', artist: 'Someone Else' },
    { id: 'A4', title: 'EXPERTISE (Deluxe Edition)', artist: 'Donwill & The Expert' }
  ]
  it('needs artist and title', () => expect(pickAlbum(yt, 'Secret Language', 'Krill')).toBe('A2'))
  it('never falls back to another album by the artist', () => expect(pickAlbum(yt, 'Brand New Album', 'Krill')).toBeUndefined())
  it('never takes the same title by a different artist', () => expect(pickAlbum(yt.slice(2, 3), 'Secret Language', 'Krill')).toBeUndefined())
  it('ignores edition noise and multi-artist credits', () => expect(pickAlbum(yt, 'EXPERTISE', 'Donwill & The Expert')).toBe('A4'))
  it('accepts a near title (similarity ≥ 0.8)', () => expect(pickAlbum(yt, 'Secret Languages', 'Krill')).toBe('A2'))
})
```

- [ ] **Step 2: Run** `npx vitest run tests/matcher.test.ts`. Expected: FAIL, because `pickAlbum` is not exported.
- [ ] **Step 3: Implement `pickAlbum`.**
  - The artist must be equal by `normalizeArtist`.
  - The title must be equal by `normalizeTitle`, or `similarity(normalizeTitle(a), normalizeTitle(b)) >= 0.8`.
  - Prefer the exact title, then the best similarity.
- [ ] **Step 4: Run** `npx vitest run tests/matcher.test.ts`. Expected: PASS.
- [ ] **Step 5: Implement `ytm.findAlbum`.**
  - Search albums for `${artist} ${title}` and map the results with `toAlbum`.
  - `albumId = pickAlbum(...)`.
  - If there's no album, set `artistId = await findArtistId(artist, true)`.
  - Delete `findAlbumId`. Update the IPC handler and the `TuneboxApi` type.
- [ ] **Step 6: Move Charts' `useOpen` + `AlbumCardFromChart` into `Cards.tsx`** as `useBusy` + `LookupAlbumCard`.
  - On click:
    - With an `albumId`, navigate to `/album/:id`.
    - With only an `artistId`, navigate to `/artist/:id` and show `toast.info` with the fallback copy.
    - Otherwise, show `toast.error` with the nothing-found copy.
  - The card renders:
    - `.rank-badge` when `rank` is set.
    - The badge text and `timeAgo(date)` in `.card-sub` when given.
    - When `reviewUrl` is set, `<a href={reviewUrl} target="_blank" rel="noreferrer">Read review</a>` as a sibling of the card button, not nested inside it.
  - Charts uses `LookupAlbumCard` for Top albums. `ArtistCardFromChart` stays in Charts on top of `useBusy`.
- [ ] **Step 7: Verify.**
  - Run `npm run typecheck && npx vitest run`. Expected: no type errors; all tests pass.
  - Live check: launch the dev build (memory `tunebox-live-debugging`). On Charts, open one Top album; expect the album page. Then search-and-open an album that YouTube Music lacks; expect the artist page and the fallback toast, or the nothing-found toast.
- [ ] **Step 8: Commit** `git commit -m "Album lookup needs artist and title; shared lookup card"`

### Task 2: Critics types, fetch helper, Pitchfork reader

**Files:**
- Modify: `src/shared/types.ts` (append the types from the spec's "Shared types" block exactly: `CriticSource`, `CriticAlbum`, `CriticFeed`, `CriticListSummary`, `CriticList`)
- Create: `src/main/sources/critics/http.ts`, `src/main/sources/critics/pitchfork.ts`
- Create fixtures in `tests/fixtures/critics/`, captured with curl and the Global UA, then trimmed:
  - `pitchfork-best-new.html` (from `https://pitchfork.com/reviews/best/albums/`)
  - `pitchfork-reviews.xml` (from `https://pitchfork.com/feed/feed-album-reviews/rss`)
  - `pitchfork-lists.html` (from `https://pitchfork.com/features/lists-and-guides/`)
  - `pitchfork-best-albums-2025.html` (from `https://pitchfork.com/features/lists-and-guides/best-albums-2025/`)
- Test: `tests/critics.test.ts`

**Interfaces:**
- Produces, in `http.ts`:
  - `fetchText(url: string): Promise<string>`. Uses the Global UA and timeout; throws `Error('<host>: HTTP <status>')` when the response isn't ok.
  - `decodeEntities(s: string): string`. Handles named (`&amp; &quot; &#39; &apos; &lt; &gt; &nbsp;`), decimal and hex entities.
  - `requireSome<T>(items: T[], what: string): T[]`. Throws `Error('<what>: nothing found')` when `items` is empty.
- Produces, in `pitchfork.ts`:
  - `parseBestNew(html: string): CriticAlbum[]`. Sets `source: 'pitchfork'` and `verdict: 'Best New Music'`; `reviewUrl` is absolute.
  - `parseReviewDates(xml: string): Map<string, number>`, keyed by review URL with the RSS `pubDate` in ms.
  - `parseListIndex(html: string): CriticListSummary[]`. Matches `/features/lists-and-guides/` slugs that contain `best`, `albums` and a 4-digit year. `id = 'pitchfork:<slug>'`, `ranked: true`, and a title made from the slug ("Best Rock Albums 2025").
  - `parseList(html: string): CriticAlbum[]`. Reads `<h2>Artist: <em>Album</em></h2>`. `rank` follows the page's numbering; check whether the fixture counts down from 50.
  - `readBestNew(): Promise<CriticAlbum[]>`. Fetches both URLs, attaches dates by URL, and returns `requireSome(...).slice(0, 20)`.
  - `readListIndex(): Promise<CriticListSummary[]>`. Keeps only lists from this year and last year, newest year first, with general (non-genre) lists before genre lists within a year.
  - `readList(id: string): Promise<CriticList>`.

- [ ] **Step 1: Write failing tests** in `tests/critics.test.ts`, reading fixtures with `readFileSync(new URL('./fixtures/critics/<file>', import.meta.url), 'utf8')`.
  - `parseBestNew`:
    - Returns more than 5 albums.
    - Every album has a non-empty `title` and `artist`, a `reviewUrl` matching `^https://pitchfork\.com/reviews/albums/`, and `verdict === 'Best New Music'`.
    - The entry whose album is "Snakes & Ladders" has that exact title, decoded from `&amp;`.
  - `parseReviewDates`: more than 5 entries; every value is a finite number greater than `Date.UTC(2026, 0, 1)`.
  - `parseListIndex`: includes `{ id: 'pitchfork:best-albums-2025', year: 2025, ranked: true }` and `pitchfork:best-rock-albums-2025`.
  - `parseList` on the 2025 fixture:
    - Returns 50 albums.
    - The ranks are exactly 1 through 50.
    - It contains `{ artist: 'Sharp Pins', title: 'Radio DDR' }`.
  - `requireSome([], 'Pitchfork')` throws `/Pitchfork: nothing found/`.
  - `decodeEntities('Snakes &amp; Ladders &#8217;&#x2019;')` equals `'Snakes & Ladders ’’'`.
- [ ] **Step 2: Run** `npx vitest run tests/critics.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement `http.ts` and `pitchfork.ts`** to those signatures.
- [ ] **Step 4: Run** `npx vitest run tests/critics.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Critics: types, fetch helper, Pitchfork reader"`

### Task 3: The Needle Drop reader

**Files:**
- Create: `src/main/sources/critics/needledrop.ts`
- Modify: `src/main/sources/ytmusic.ts`. Add `channelVideo`: all youtubei.js use stays in this file.
- Fixtures:
  - `needledrop-reviews.html`, from `https://www.theneedledrop.com/album-reviews/`.
  - `needledrop-review.html`, from `https://www.theneedledrop.com/album-reviews/brakence-marrow-album-review-ihaqnk-d6ny/`. Trim it to `<title>`, the verdict markup and the embed.
  - `needledrop-top50-2025.txt`: the description of the "Top 50 Albums of 2025" video. Capture it with a one-off script calling `channelVideo`.
- Test: `tests/critics.test.ts`

**Interfaces:**
- Consumes: `fetchText`, `decodeEntities`, `requireSome` (Task 2).
- Produces:
  - `channelVideo(channelId: string, query: string, title: RegExp): Promise<{ id: string; title: string; description: string } | undefined>` in `ytmusic.ts`.
    - Use `(await innertube()).search(query, { type: 'video' })` and keep the first result whose channel id equals `channelId` and whose title matches.
    - Then get the description from `getBasicInfo(id)` → `basic_info.short_description`.
  - `NEEDLEDROP_CHANNEL = 'UCt7fwAhXDy3oNFTAzF2o8Pw'`.
  - `parseReviewIndex(html: string): string[]`: absolute `/album-reviews/<slug>/` URLs, de-duplicated, in page order.
  - `parseReview(html: string, url: string): { album: CriticAlbum; score: number } | null`.
    - Read artist and album from `<title>` "Artist - Album", splitting on the **first** " - ".
    - Find the score in the element that carries the verdict; confirm which one in the fixture.
    - Take `date` from `<meta property="article:published_time">` when present.
    - Return `null` when no score is found.
  - `parseTop50(description: string, year: number): CriticAlbum[]`.
    - An album line is a non-URL line containing " - " whose next non-empty line is a YouTube URL. Every other line (header, links, footer) is skipped.
    - Each album line, split on the first " - ", becomes an album with `source: 'needledrop'`, `verdict: 'Top 50 of <year>'`, `reviewUrl` set to that YouTube URL, and no `rank`.
  - `readReviews(seen: Record<string, { album: CriticAlbum; score: number } | null>): Promise<{ albums: CriticAlbum[]; seen: typeof seen }>`.
    - Fetches the index, then only the URLs missing from `seen` (newest 24 only, 4 at a time, using `mapLimit` from `src/main/util/async.ts`).
    - Returns the albums scoring 8 or more, newest first (max 20), with `verdict: '<n>/10'`, plus the updated `seen`.
  - `readTop50Lists(years: number[]): Promise<CriticList[]>`.
    - One `channelVideo(NEEDLEDROP_CHANNEL, 'theneedledrop top 50 albums of <year>', /top 50 albums of <year>/i)` call per year.
    - A year with no video is skipped.
    - Each list is `id: 'needledrop:top50-<year>'`, `ranked: false`.

- [ ] **Step 1: Write failing tests:**
  - `parseReviewIndex` returns more than 5 URLs, all matching `^https://(www\.)?theneedledrop\.com/album-reviews/.+-album-review-`.
  - `parseReview(fixture, url)` returns `album.artist === 'brakence'`, `album.title === 'marroW'`, and an integer score between 0 and 10. Assert the exact value seen in the fixture.
  - `parseReview('<title>Nothing</title>', url)` returns `null`.
  - `parseTop50`:
    - Returns between 40 and 60 albums.
    - The first is `{ artist: 'Aesop Rock', title: 'Black Hole Superette' }`.
    - No album has a `rank`.
    - `parseTop50('X - Album - Deluxe\nhttps://www.youtube.com/watch?v=abc', 2025)[0].title === 'Album - Deluxe'`.
  - A `readReviews` test with `fetchText` mocked through `vi.mock('../src/main/sources/critics/http', ...)`:
    - With `seen` already containing every URL in the index, it makes exactly 1 fetch (the index page).
- [ ] **Step 2: Run** `npx vitest run tests/critics.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `needledrop.ts` and `channelVideo`.
- [ ] **Step 4: Run** `npx vitest run tests/critics.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Critics: The Needle Drop reviews and Top 50 lists"`

### Task 4: Bandcamp and Stereogum readers

**Files:**
- Create: `src/main/sources/critics/bandcamp.ts`, `src/main/sources/critics/stereogum.ts`
- Fixtures:
  - `bandcamp.xml`, from `https://daily.bandcamp.com/feed`.
  - `stereogum-aotw.xml`, from `https://www.stereogum.com/category/reviews/album-of-the-week/feed/`. Keep only `<title>`, `<link>`, `<pubDate>`, and the first italic album title in the `content:encoded` of each item.
- Test: `tests/critics.test.ts`

**Interfaces:**
- Consumes: `fetchText`, `decodeEntities`, `requireSome` (Task 2).
- Produces:
  - `parseAlbumOfTheDay(xml: string): CriticAlbum[]`.
    - Only items whose `<category>` is "Album of the Day".
    - The title `Artist, “Album”` is split on the last `, “`; the album has its quotes stripped.
    - `date` comes from `pubDate`.
  - `parseAlbumOfTheWeek(xml: string): CriticAlbum[]`.
    - The album is the first `<em>` text in the item's content. The artist is the title after `Album Of The Week: ` with the trailing album text removed.
    - An item where the album text isn't a suffix of the title is skipped.
  - `readBandcamp(): Promise<CriticAlbum[]>` and `readStereogum(): Promise<CriticAlbum[]>`. Each fetches, applies `requireSome`, and returns the newest 20.

- [ ] **Step 1: Write failing tests:**
  - `parseAlbumOfTheDay` includes `{ artist: 'Donwill & The Expert', title: 'EXPERTISE', verdict: 'Album of the Day' }`. Every result has a finite `date`, and none comes from the "Lists" or "Essential Releases" categories.
  - `parseAlbumOfTheWeek` includes `{ artist: 'Krill', title: 'Secret Language', verdict: 'Album of the Week' }`.
  - Every Stereogum result's title is non-empty, and its artist doesn't end with its title.
- [ ] **Step 2: Run** `npx vitest run tests/critics.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both readers.
  - If more than 1 in 5 Stereogum items in the fixture can't be split, drop Stereogum from `CriticSource` and from every later task. That's the spec's fallback.
- [ ] **Step 4: Run** `npx vitest run tests/critics.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Critics: Bandcamp Album of the Day and Stereogum Album of the Week"`

### Task 5: Scan engine, storage, IPC and startup scan

**Files:**
- Create: `src/main/sources/critics/index.ts`
- Modify:
  - `src/main/db/settings.ts:17`: `SELECT key, value FROM settings WHERE key NOT LIKE 'state:%'` (audit #15).
  - `src/shared/api.ts`: add a `critics` group, `EVENT.critics = 'event:critics'` and `TuneboxEvents.onCritics`.
  - `src/preload/index.ts`: `api.onCritics = listen(EVENT.critics)`.
  - `src/main/ipc/index.ts`: add `critics` handlers.
  - `src/main/index.ts:233`: the startup scan.
- Test: `tests/critics-engine.test.ts`. The `getSettings` change is a one-line query filter with no change in behavior, so it gets no test.

**Interfaces:**
- Consumes: every `read*` from Tasks 2–4.
- Produces:
  - `interface CriticsDeps`, with these members:
    - `readers: Record<CriticSource, (store: CriticsStore) => Promise<CriticAlbum[]>>`
    - `readListIndex(): Promise<CriticListSummary[]>`
    - `readList(id: string): Promise<CriticList>`
    - `store: CriticsStore`
    - `now(): number`
  - `interface CriticsStore`, with `get<T>(key: string): T | undefined` and `set(key: string, value: unknown): void`. Production uses `getState`/`setState` on `db()`.
  - `createCritics(deps: CriticsDeps)`, which returns:
    - `feed(): Promise<CriticFeed>`
    - `scan(): Promise<CriticFeed>`
    - `lists(): Promise<CriticListSummary[]>`
    - `list(id: string, refresh?: boolean): Promise<CriticList>`
    - `onScanned(cb: (f: CriticFeed) => void): void`
  - A module-level production instance with exports `criticsFeed`, `scanCritics`, `criticLists`, `criticList` and `onCriticsScanned`.
    - Its Needle Drop reader wraps `readReviews` and persists `seen` under `critics:needledrop`.
    - Its list index merges `pitchfork.readListIndex()` with `readTop50Lists([thisYear, thisYear - 1])`. The Top 50 lists' contents are stored under `critics:list:<id>` as they're found.
    - The merged index is sorted newest year first. Within a year, Pitchfork's own order comes first, then The Needle Drop.
  - `interleave(bySource: CriticAlbum[][]): CriticAlbum[]`: round-robin, dropping repeats by `trackKey(artist, title)` (first seen wins).
  - `TuneboxApi.critics`:
    - `feed(): Promise<CriticFeed>`
    - `scan(): Promise<CriticFeed>`
    - `lists(): Promise<CriticListSummary[]>`
    - `list(id: string, refresh?: boolean): Promise<CriticList>`
  - `API_METHODS.critics = ['feed', 'scan', 'lists', 'list']`.
  - Engine behavior:
    - `scan` is single-flight. A scan runs every reader with `Promise.allSettled`.
    - A rejected reader keeps its albums from the previous stored feed and is listed in `failed`.
    - The scan stores `critics:feed` with `albums = interleave(per-source lists)` and `builtAt = now()`, refreshes the list index (its failure keeps the old index), then calls every `onScanned` listener.
    - `feed()` returns the stored feed. If nothing is stored, it awaits the running scan, or starts one.
    - `list(id)` returns the stored list, or fetches and stores it. `refresh` forces a fetch.
  - In `src/main/index.ts`:
    - `win.webContents.once('did-finish-load', …)` also runs `setTimeout(() => void scanCritics(), 10_000)`.
    - `onCriticsScanned((f) => win?.webContents.send(EVENT.critics, f))` is registered once.

- [ ] **Step 1: Write failing tests** in `tests/critics-engine.test.ts`, using fake readers and an in-memory `Map` store:
  - **Round-robin:** `interleave([[p1, p2, p3], [n1], [b1, b2]])` gives `[p1, n1, b1, p2, b2, p3]`.
  - **Dedupe:** an album present in two sources appears once.
  - **Joining a scan:** two `scan()` calls made back-to-back, while the readers are pending, call each reader exactly once and resolve to the same object.
  - **Offline:** a stored feed with 3 Pitchfork albums, then a scan where every reader rejects, gives `failed` holding all four sources and still the 3 Pitchfork albums. `store.get('critics:feed')` still has them.
  - **Empty pages:** a reader that throws `requireSome`'s error keeps its previous albums.
  - **Stored feed:** `feed()` with a stored feed resolves without calling any reader.
  - **First run:** `feed()` with nothing stored triggers exactly one scan, even if `scan()` is also called during it.
  - **Push:** the `onScanned` listener is called once per completed scan, with the stored feed.
  - **Lists:** `list(id)` fetches once, then serves from the store. `list(id, true)` fetches again.
- [ ] **Step 2: Run** `npx vitest run tests/critics-engine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `critics/index.ts`, the `getSettings` change, and the API/preload/IPC wiring.
- [ ] **Step 4: Run** `npm run typecheck && npx vitest run`. Expected: no type errors; all tests pass.
- [ ] **Step 5: Live check of the startup scan.**
  - Launch the dev build with a fresh `TUNEBOX_USER_DATA`.
  - After about 20 s, call `await window.api.critics.feed()` over the remote-debugging port.
  - Expected: albums from at least 3 sources, and `failed` empty or naming a real outage.
  - Record the dev log line count of outgoing critics fetches (add a single `console.info('[critics] scan', ms)`) to confirm only one scan ran.
- [ ] **Step 6: Commit** `git commit -m "Critics: scan engine, storage, IPC, startup scan"`

### Task 6: Critics' Picks page

**Files:**
- Create: `src/renderer/src/pages/Critics.tsx`
- Modify:
  - `src/renderer/src/lib/queries.ts`: add `useCriticsFeed`, `useCriticLists` and `useCriticList(id)`, keyed `['critics','feed']`, `['critics','lists']` and `['critics','list',id]`, all with `staleTime: Infinity`.
  - `src/renderer/src/App.tsx`: add a `/critics` route. In `useOsEvents`, `window.api.onCritics((f) => queryClient.setQueryData(['critics','feed'], f))`.
  - `src/renderer/src/components/NavRail.tsx`: after Charts, `{ to: '/critics', label: "Critics' Picks", icon: <new icon> }`.
  - `src/renderer/src/components/Icons.tsx`: one new icon, built with the existing `make(...)` factory.
  - `README.md`: one **Critics' Picks** line in Features.
- Test: live check only. There's no renderer test setup in this repo.

**Interfaces:**
- Consumes: `LookupAlbumCard`, `useBusy` (Task 1); `api.critics.*` and `onCritics` (Task 5).

- [ ] **Step 1: Build `Critics.tsx`.**
  - **Header:** "Critics' Picks", the mode tabs `Newly acclaimed` / `Best of` (the `tabs`/`tab` markup from `Radio.tsx:184-189`), and a Refresh button.
  - **Refresh:**
    - Newly acclaimed: `api.critics.scan()`, with its result set into the feed query.
    - Best of: `api.critics.list(id, true)` and `api.critics.lists()`.
    - Shows the existing `.spinner` while it runs and is disabled meanwhile.
    - The startup scan runs quietly behind the stored feed; the spinner only shows for Refresh. On a first run with nothing stored, `QueryView`'s loading state covers the wait.
  - **Newly acclaimed:**
    - Source chips (All + the four sources) using the same `tabs`/`tab` markup.
    - A `card-grid` of `LookupAlbumCard`, with `badge` set to `"<Source name> · <verdict>"`, plus `date` and `reviewUrl`.
    - One muted line per source in `failed`, using the failure copy.
    - The empty state comes from `QueryView`.
  - **Best of:**
    - A `<select className="input">` of lists, labelled `"<Source name> · <title>"`. The default is the first Pitchfork entry in the index, which is the newest general list.
    - Cards with `rank` when the list is ranked.
  - The page remembers the last mode and chip in `sessionStorage`, wrapped in try/catch. Use the key `tunebox:critics-view`.
- [ ] **Step 2: Verify.**
  - Run `npm run typecheck`. Expected: no errors.
  - Live check in the dev build:
    - The tab is listed after Charts.
    - Both modes render.
    - Each chip filters.
    - Refresh spins and then updates.
    - Open three albums from different sources: each lands on an album page, the artist fallback, or the nothing-found toast, never a wrong album.
    - Open about 10 albums across sources. If a correct album is missed only because the 0.8 similarity bar is too high, lower it and add that pair to the `pickAlbum` tests.
    - "Read review" opens the system browser.
    - No console errors.
- [ ] **Step 3: Commit** `git commit -m "Critics' Picks tab: newly acclaimed and best-of lists"`
