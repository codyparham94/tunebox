import { AlbumCard, CardGrid } from '../components/Cards'
import { PlayIcon, ShuffleIcon } from '../components/Icons'
import { Empty, QueryView } from '../components/States'
import { TrackList } from '../components/TrackList'
import { plural, totalDuration } from '../lib/format'
import { useLiked, useLikedAlbums } from '../lib/queries'
import { player } from '../store/player'

/** Liked albums (only when there are some), then liked songs. */
export function Liked() {
  const albums = useLikedAlbums()
  const songs = useLiked()

  return (
    <div className="page">
      <h1 className="page-title">Liked</h1>

      {!!albums.data?.length && (
        <section className="section" style={{ marginTop: 0 }} aria-labelledby="liked-albums">
          <div className="section-head">
            <h2 id="liked-albums" className="section-title">
              Albums
            </h2>
            <span className="tile-sub">{plural(albums.data.length, 'album')}</span>
          </div>
          <CardGrid>
            {albums.data.map((a) => (
              <AlbumCard key={a.id} album={a} />
            ))}
          </CardGrid>
        </section>
      )}

      <section className="section" style={albums.data?.length ? undefined : { marginTop: 0 }} aria-labelledby="liked-songs">
        <QueryView query={songs} rows={8}>
          {(tracks) => (
            <>
              <div className="section-head">
                <div>
                  <h2 id="liked-songs" className="section-title">
                    Songs
                  </h2>
                  {tracks.length > 0 && (
                    <p className="tile-sub">
                      {plural(tracks.length, 'song')}, {totalDuration(tracks)}
                    </p>
                  )}
                </div>
                {tracks.length > 0 && (
                  <div className="row">
                    <button className="btn btn-primary" onClick={() => player.playList(tracks, 0, { shuffle: false })}>
                      <PlayIcon size={16} /> Play
                    </button>
                    <button className="btn" onClick={() => player.playList(tracks, 0, { shuffle: true })}>
                      <ShuffleIcon size={16} /> Shuffle
                    </button>
                  </div>
                )}
              </div>
              {tracks.length === 0 ? (
                <Empty>Tap the ♥ on any song (or 👍 in the player) and it lands here. Like a whole album from its page.</Empty>
              ) : (
                <TrackList label="Liked songs" tracks={tracks} />
              )}
            </>
          )}
        </QueryView>
      </section>
    </div>
  )
}
