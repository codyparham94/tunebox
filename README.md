# Tunebox

A desktop music player for Windows. Search a big catalog, stream audio from YouTube, build playlists, and start **radio stations** that keep playing similar songs and learn from your 👍, 👎, skips and full listens.

## Download

**[⬇ Download Tunebox for Windows](https://github.com/codyparham94/tunebox/releases/latest)**: run `Tunebox-Setup-x.y.z.exe`. Step-by-step instructions are in **[INSTALL.md](INSTALL.md)**.

> **Personal use only.** Tunebox extracts audio streams from YouTube, which breaks YouTube’s Terms of Service. It can stop working whenever YouTube changes something (see [When playback breaks](#when-playback-breaks)).

## Features

- **Search & browse:** songs, artists, albums and playlists from YouTube Music; artist pages. Song titles open their album and artist names open the artist page.
- **Local files:** pick a music folder and play your own MP3, M4A, FLAC, WAV, OGG and Opus files, browsable by song, album or artist, with embedded cover art. Rescans only re-read changed files.
- **Charts:** Top 40 for any genre, top albums and artists (from Deezer), and your own most-played songs.
- **Playback:** audio-only streams, seeking, queue with drag-reorder, shuffle and repeat. Shows up in the Windows media flyout and responds to hardware media keys.
- **Library:** local playlists (create, rename, reorder, delete), liked songs, listening history. Everything is stored in a local SQLite file, with no account and no login.
- **Radio:** seed a station from a song, artist, playlist or genre. Candidates come from Last.fm (similar tracks and artists, tag charts) and YouTube Music’s own radio, and a local scoring model ranks them. 👎 bans the track from that station and pushes the artist out; 👍 pulls in more like it. The player shows why each song was picked.
- **Import:** paste a public YouTube or YouTube Music playlist URL.
- **Themes:** 26 light and dark themes adapted from design skills and [awesome-design-md](https://github.com/VoltAgent/awesome-design-md), with a Light/Dark filter.
- **System:** tray menu (play/pause, next, 👍/👎), close to tray, optional global media-key fallback, remembered window position.

## Development setup

Just want to use the app? See [INSTALL.md](INSTALL.md). To work on the code you need Windows 10/11 and Node.js 22.12 or newer.

```bash
npm install
npm run fetch:ytdlp      # downloads yt-dlp.exe into resources/bin (gitignored)
npm run dev
```

### Last.fm API key (recommended)

Radio works best with a free Last.fm key. Without one, stations only use YouTube Music’s radio, and the genre list is a fixed default.

1. Create a key at https://www.last.fm/api/account/create (no app review needed).
2. Paste it into **Settings → Last.fm**. It’s saved in the local database only.

For development you can instead copy `.env.example` to `.env` and set `LASTFM_API_KEY`. `.env` is gitignored and never bundled into the app.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm test` | Unit tests (matcher, radio scorer, playlist URL parser, database) |
| `npm run smoke` | Resolves 5 known videos with youtubei.js **and** yt-dlp and reports which works. Run it when playback breaks. |
| `npm run typecheck` | Type-check main and renderer |
| `npm run build:win` | Download yt-dlp, build, and package an NSIS installer into `release/` |
| `npm run icon` | Regenerate `resources/icon.png` |

Set `TUNEBOX_USER_DATA=<folder>` to run against a throwaway profile.

> If you launch from inside VS Code’s extension host or another Electron app, make sure `ELECTRON_RUN_AS_NODE` is not set, or Electron will start as plain Node.

## How it works

```
Renderer (React + Zustand + TanStack Query, Bento UI)
  └─ window.api.*  typed contextBridge preload (sandboxed, no nodeIntegration)
Main process
  ├─ sources/   ytmusic.ts (youtubei.js), lastfm.ts, deezer.ts, matcher.ts
  ├─ stream/    resolver.ts (youtubei.js → yt-dlp), protocol.ts (tunebox-audio://)
  ├─ radio/     candidates.ts, scorer.ts, station.ts, affinity.ts
  ├─ db/        node:sqlite schema, migrations, repositories
  └─ os/        tray, media-key fallback, window state
```

- **Audio** plays through one `<audio>` element pointed at `tunebox-audio://track/<videoId>`. The main process resolves a stream URL and proxies it in small range chunks, because googlevideo rejects large range requests. Seeking works through HTTP Range.
- **Stream resolving** tries youtubei.js clients first. Each URL is checked by reading the *end* of the file, since without a PO token YouTube often serves only the first ~1 MB. If that fails it uses yt-dlp. After repeated youtubei.js misses, yt-dlp goes first for 15 minutes.
- **Matching:** Last.fm and Deezer tracks are matched to YouTube videos by title and artist similarity, duration (±5 s), and penalties for live, cover and remix versions. Results are cached in `match_cache`.
- **Radio scoring:** `0.45·similarity + 0.25·artistAffinity + 0.15·tagAffinity + 0.15·sourceAgreement − repeat penalties`. Affinities come from feedback (👍 +1, full listen +0.3, skip under 30 s −0.5, 👎 −1), decay with a 30-day half-life, and station feedback counts double. 15% of picks come from the lower-scoring half so stations don’t loop.
- **Data** lives in `%APPDATA%/tunebox/tunebox.sqlite`.

## When playback breaks

YouTube changes often. In order:

1. **Settings → Playback engine → Update yt-dlp** (runs `yt-dlp -U` on the app’s own copy).
2. `npm update youtubei.js`. All youtubei.js parsing lives in `src/main/sources/ytmusic.ts` and `src/main/stream/resolver.ts`.
3. `npm run smoke` to see which resolver works.

## Not included (v1)

Lyrics, Spotify import, sign-in (so no private playlists or YouTube liked songs), macOS and Linux packaging.

## License

MIT
