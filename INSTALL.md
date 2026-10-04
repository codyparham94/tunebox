# Installing Tunebox

Tunebox runs on **Windows 10 and 11** (64-bit) and on **macOS 12 Monterey or newer** (Apple Silicon and Intel Macs). You don’t need to install anything else first.

**On a Mac?** Skip to [Installing on a Mac](#installing-on-a-mac).

## 1. Download

**[⬇ Download the latest Tunebox installer](https://github.com/codyparham94/tunebox/releases/latest)**

On that page, under **Assets**, click **`Tunebox-Setup-x.y.z.exe`** (about 140 MB).

## 2. Run the installer

1. Open the downloaded `Tunebox-Setup-x.y.z.exe`.
2. **If Windows shows “Windows protected your PC”**, click **More info**, then **Run anyway**.
   The installer isn’t code-signed (signing certificates cost money), so Windows warns about every unsigned app. Tunebox is open source; you can read every line in this repository.
3. Choose whether to install for just you or everyone, and pick a folder (the default is fine).
4. Click **Install**, then **Finish**.

Tunebox opens, and you’ll find it in the Start menu and on your desktop.

## Installing on a Mac

1. Open the [latest release](https://github.com/codyparham94/tunebox/releases/latest) and, under **Assets**, download **`Tunebox-x.y.z-mac.dmg`**. It works on both Apple Silicon and Intel Macs.
2. Open the `.dmg` and drag **Tunebox** into **Applications**.
3. Open Tunebox from Applications. The first time, macOS says it **can’t verify the app** (Tunebox isn’t signed with a paid Apple developer certificate). Click **Done**, then:
   - open **System Settings → Privacy & Security**, scroll down to the message about Tunebox, and click **Open Anyway**;
   - confirm with your password or Touch ID, then click **Open**.

   You only do this once. If macOS instead says the app **“is damaged”**, run this in Terminal and open it again:
   ```bash
   xattr -cr /Applications/Tunebox.app
   ```

Closing the window keeps the music playing; Tunebox stays in the Dock and the menu bar (the bars icon). Press <kbd>⌘</kbd><kbd>Q</kbd> to quit.

## 3. First steps

- **Search** (or press <kbd>/</kbd>) to find a song, then click it to play.
- **Start a station**: use the ⋯ menu on any song and choose **Start radio**, or open the **Radio** tab and start one from an artist, genre or playlist. Use 👍 and 👎 to teach it what you like. On the Radio tab, **+ Artists** adds more artists to a station for a wider mix.
- **Import a YouTube playlist**: **Library → Import from YouTube**, then paste a public playlist link.
- **Play your own files**: open the **Local files** tab. The first time, Tunebox asks you to pick your music folder (you can change it later). It reads MP3, M4A, FLAC, WAV, OGG and Opus files, including subfolders.
- **Find new music**: the **Discover** tab suggests songs and artists you haven’t heard, based on what you like, search for and save. Press **Refresh** for a new batch.
- **See what’s popular**: the **Charts** tab has the Top 40 (for any genre), top albums and artists, and your own most-played songs.
- **Shape the sound**: **Settings → Equalizer** (or the sliders button next to the volume) has 26 presets, per-band sliders and your own saved presets. **Pop out** opens it in its own window.
- **Change the look**: **Settings → Appearance** has 26 themes, with a Light/Dark filter.

### Optional: better radio with a free Last.fm key

Radio works out of the box, but it’s much better with a Last.fm key (free, takes a minute):

1. Sign in or sign up at **https://www.last.fm/api/account/create**.
2. Fill in any application name (for example “Tunebox”) and click **Submit**.
3. Copy the **API key** it shows you.
4. In Tunebox, open **Settings → Last.fm**, paste the key, and click **Save**.

The key stays on your computer.

## Updating

From version 0.5.0 on, Tunebox tells you when a new version is out and installs it for you if you click **Update and restart** (or use **Settings → Updates → Check for updates**). On older versions, download the newest installer from the [releases page](https://github.com/codyparham94/tunebox/releases/latest) and run it. It installs over the old version, and your playlists, likes and stations are kept.

**On a Mac**, Tunebox tells you when a new version is out, but macOS doesn’t let unsigned apps update themselves: click **Open download page**, download the new `.dmg`, and drag Tunebox into Applications again (choose **Replace**). Your library is kept.

## Uninstalling

**Windows Settings → Apps → Installed apps → Tunebox → Uninstall.**

Your library is stored separately in `%APPDATA%\tunebox`. Delete that folder too if you want to remove all your data.

**Mac:** quit Tunebox and drag it from Applications to the Trash. Your library is in `~/Library/Application Support/tunebox`; delete that folder too to remove all your data.

## Troubleshooting

| Problem | Fix |
|---|---|
| Songs won’t play or keep skipping | YouTube changes often. Open **Settings → Playback engine** and click **Update yt-dlp**. If that doesn’t help, install the latest Tunebox release. |
| “Windows protected your PC” | Click **More info → Run anyway** (see step 2 above). |
| Antivirus blocks the installer | Some antivirus tools flag unsigned apps. Allow it, or build from source (below). |
| Closing the window doesn’t quit | That’s on purpose: music keeps playing from the tray icon near the clock. Right-click it and choose **Quit**, or turn this off in **Settings**. |
| Media keys don’t work | Turn on **Settings → Global media keys**. On a Mac, also allow Tunebox in **System Settings → Privacy & Security → Accessibility**. |
| Mac: “can’t verify” or “damaged” | See [Installing on a Mac](#installing-on-a-mac), step 3. |

Still stuck? [Open an issue](https://github.com/codyparham94/tunebox/issues) and describe what happened.

## Building from source (developers)

Requires [Node.js](https://nodejs.org) 22.12 or newer and Git.

```bash
git clone https://github.com/codyparham94/tunebox.git
cd tunebox
npm install
npm run fetch:ytdlp   # downloads yt-dlp for your platform
npm run dev           # run it
npm run build:win     # Windows installer into release/  (on a Mac: npm run build:mac)
```

---

Tunebox is for personal use. It streams audio from YouTube, which is against YouTube’s Terms of Service, and may stop working when YouTube changes things.
