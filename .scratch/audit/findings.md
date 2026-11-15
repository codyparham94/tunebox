# Tunebox audit — 2026-11-15

Branch: `fix/charts-crash-and-audit`. "Verified" = confirmed by reading the code or reproducing it; "review" = reported by a code-review pass, not yet independently confirmed.

## Fixed on this branch

- **Charts crash on play** — `AddToPlaylistButton` called `usePlaylistTrackIds()` behind `!!track.id &&`. Chart songs start with `id: ''`, so the hook ran only after the YouTube match landed → "Rendered more hooks" → whole window blank. Reproduced and confirmed fixed in the running app.
- **Error boundaries** — one at the root, one around the routes (keyed by path). A page crash now shows "Try again" while the nav and player keep working; navigating away recovers.
- **Chart songs could play the wrong video** — `catalog.match` returned the top search hit at any confidence (covers, karaoke). It now requires `PLAY_CONFIDENCE` (0.45, the radio/Discover threshold, now one shared constant).
- **Old song kept playing while a chart song was being matched** (and could auto-advance past it).
- **Shuffle off reverted chart songs to unmatched copies** → 👍/👎, likes and "+" silently stopped working for the playing song.
- **"Couldn't find… Skipping" chain** when matching is down (40 toasts for Play all) → stops after 3 in a row.
- **Stuck "Tuning in…"** when starting a station while another refill was in flight, or leaving a station while it tuned in.
- **Pending refill cut off a song the user picked**; the **error auto-skip timer skipped the user's pick**.
- **Repeat-one leaked into stations** (repeat button is disabled there, so the first song looped for good).
- **Plays were recorded under the wrong station** when switching stations.
- **Play button resumed the previous song's audio** when the current song wasn't loaded yet.
- **Station rename** removed every "s" (`/s+/` instead of `/\s+/`).
- **Search box wrote the old query back** after clicking the Search tab or pressing "/".
- **"1 hr 60 min"** playlist durations.
- **Artist pages showed at most 10 albums and 10 singles** — see "Artist data" below.

## Open bugs

Main process
1. Radio stations "run out of new songs" after ~55 songs until restart: the per-station `used` set never resets, and each refill marks 10 picks used. `src/main/radio/station.ts:23,72` — verified
2. yt-dlp never refreshes: the userData copy is made once and kept forever; `fetch:ytdlp` skips without `--force`, so release builds ship a stale binary. `src/main/stream/ytdlp.ts:16`, `scripts/fetch-ytdlp.mjs:17` — verified
3. Unliking subtracts the full, undecayed like weight, so an artist liked long ago and then unliked drops below the Discover ban cutoff. `src/main/db/feedback.ts:100` — verified
4. Picking a new music folder during a scan returns the old folder's in-flight scan; the new folder is never scanned. `src/main/local/library.ts:68` — verified
5. `mapLimit` turns every error into `undefined`: a bad Last.fm key shows as "no similar tracks"; import network errors count as "not found on YouTube". `src/main/util/async.ts:10` — verified
6. Windows background update checks have no `.catch` (macOS branch does) → unhandled rejection whenever offline. `src/main/os/updater.ts:120` — verified
7. No fetch timeouts anywhere (Last.fm, Deezer, stream resolver, imports, updater): a stalled server holds refills/Discover/playback ~5 min. Fix: `signal: AbortSignal.timeout(…)` — review
8. `match_cache` stores misses and low-confidence picks forever (`at` is never read); a temporary search outage poisons those songs permanently. `src/main/sources/matcher.ts:86` — review
9. Playlist-seeded stations break for good once the playlist is deleted. `src/main/radio/candidates.ts:102` — review
10. An in-flight pool build overwrites `retuneStation`/👍 resets, so a just-added artist is ignored for up to an hour. `src/main/radio/station.ts:46,129` — review
11. Apple Music developer token cached for the app's lifetime, never cleared on 401 → Apple imports silently truncate to 100 songs. `src/main/import/external.ts:77` — review
12. `bannedArtists` groups by the raw artist string, not `artistKey`, so "A" and "A, B" feedback never nets out. `src/main/db/feedback.ts:138` — review
13. `deleteStation` runs 4 DELETEs outside `tx()`. `src/main/db/stations.ts:64` — review
14. IPC `setLiked`/`recordPlay`/`radio.feedback` throw for `id: ''` tracks; only renderer guards prevent it. `src/main/ipc/index.ts:89,94` — review
15. `getSettings` loads every `state:*` blob (incl. the cached Discover feed) on every audio request. Add `WHERE key NOT LIKE 'state:%'`. `src/main/db/settings.ts:17` — review

Renderer
16. Cancelling a drag (Esc / drop outside) still moves the row, and saves it in playlists. `components/TrackList.tsx:83` — review
17. Alt+↑/↓ in a playlist loses focus after one move (index-based keys + async refetch). `components/TrackList.tsx:61,139` — review
18. "Create" playlist can double-submit; a late `done()` closes a newer dialog. `components/AddToPlaylistDialog.tsx:40` — review
19. "Remove from queue" on the playing row does nothing, with no feedback. `components/QueuePanel.tsx:118` — review
20. A failed `locate` is cached forever, so Go to artist/album stays broken for that song all session. `lib/nav.ts:15` — review
21. "Start radio" replaces whatever the user started while it was loading. `lib/actions.ts:7` — review
22. `retuneStation` still appends in-flight picks for a removed artist, and drops songs queued from Discover (they carry a `reason`). `store/player.ts` retuneStation — review
23. A background update check overwrites the "available" status while the prompt is open → Install fails. `store/update.ts:17` — review
24. Two `useImporter` instances share one toast id; an old dismiss timer can hide a new import's progress. `pages/Playlists.tsx:99` — review
25. Widget and EQ windows ignore reduced motion (no `useMotion`, no media-query fallback). `Widget.tsx`, `EqWindow.tsx` — review
26. README says Node 22.12+, but `node:sqlite` (tests) needs 22.13+. — review

## Cleanup (irrelevant / redundant code)

27. Renderer-only packages (react, react-dom, react-router, react-query, zustand, 9 × @fontsource) are in `dependencies`, so ~1,800 unused files ship in `app.asar`. Move to `devDependencies`; the `!**/*.woff` rule in `electron-builder.yml` then goes too.
28. `eslint-disable` comments in 6 files, but ESLint isn't installed. Either delete them or add `eslint-plugin-react-hooks` — its `rules-of-hooks` check would have caught the Charts crash.
29. Unused CSS, ~70 lines: `.bento` + `.span-*`, `.recent-list`/`.recent-play`/`.recent-item.active`, `.discover-stack` (`styles/app.css`).
30. Duplicate helpers: "primary artist" split ×8 (main + renderer → one in `src/shared`); hand-rolled debounce ×3; dialog showModal/close effect ×3; `norm` ×2; tab arrow-key handler ×2; `['appVersion']` query ×2; Home runs two history queries for the same data.
31. `src/main/os/thumbar.ts:81-149` rasterizes icons and encodes PNGs (hand-rolled CRC32) at runtime; `scripts/make-icon.mjs` already has that code — pre-render the 8 PNGs like the tray icons (~70 lines out of main). Node also has `zlib.crc32`.
32. Dead props/exports: `Menu` `className`/`MenuItem.icon`, `HoldButton` `duration`, `AddToPlaylistButton` `size`, `Art` `alt`, `CardGrid` (one-line wrapper), the unreachable `/library` redirect, autoplay "reason" strings that are never displayed, ~20 exports only used in their own file.
33. Stale docs/config: README "Not included (v1)" lists Spotify import and macOS packaging (both ship); the Releasing paragraph breaks the Scripts table; `shared/types.ts:168` points at the wrong themes file; the dev-only `ws://localhost:*` CSP entry ships in production.
34. Biased shuffle `sort(() => Math.random() - 0.5)` in `src/main/radio/candidates.ts:103`; the renderer already has a Fisher–Yates `shuffled`.

## Artist data

Root cause of "missing albums": `ytmusic.artist()` read the artist page carousels, which YouTube Music caps at **10 items**. Each shelf's "More" link (`MPAD<channelId>` browse) returns the full grid. Now used for Albums and Singles & EPs (Discover skips it, since it only needs related artists).

| Artist | Albums before → after | Singles & EPs before → after |
|---|---|---|
| Taylor Swift | 10 → 32 | 10 → 92 |
| Radiohead | 10 → 15 | 10 → 29 |

Cross-check: Deezer lists Radiohead with 15 albums, 5 EPs and 25 singles, so YT's album count now matches.

Further options, not done:
- **Top songs shows 5.** `page.getAllSongs()` returns the artist's full songs playlist (101 for Radiohead). One extra call per artist page.
- **Edition clutter.** The full YT list includes deluxe/radio-special/track-by-track editions (most of Taylor Swift's 32). Could collapse by normalized title.
- **Deezer `/artist/{id}/albums`** (free, no key) has clean `record_type` and release dates if better sorting or dedupe is wanted. It's not needed for completeness, and playback still goes through YouTube.
- **Very large discographies:** only the first page of the grid is read (marked with a `ponytail:` comment in `fullShelf`).
