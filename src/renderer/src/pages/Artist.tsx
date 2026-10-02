import { useParams } from 'react-router'
import { Art } from '../components/Art'
import { AlbumCard, ArtistCard, CardGrid } from '../components/Cards'
import { PlayIcon, RadioIcon } from '../components/Icons'
import { QueryView } from '../components/States'
import { TrackList } from '../components/TrackList'
import { startArtistRadio } from '../lib/actions'
import { useArtist } from '../lib/queries'
import { player } from '../store/player'

export function Artist() {
  const { id = '' } = useParams()
  const artist = useArtist(id)

  return (
    <div className="page">
      <QueryView query={artist}>
        {(a) => (
          <>
            <section className="tile tile-primary hero" aria-labelledby="artist-name">
              <Art src={a.artUrl} round size={220} />
              <div className="min-w-0">
                <span className="eyebrow">Artist</span>
                <h1 id="artist-name" className="hero-title">
                  {a.name}
                </h1>
                {a.description && <p className="tile-sub clamp-3" style={{ maxWidth: 720 }}>{a.description}</p>}
                <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                  <button className="btn btn-dark" onClick={() => player.playList(a.topSongs)} disabled={!a.topSongs.length}>
                    <PlayIcon size={16} /> Play top songs
                  </button>
                  <button className="btn" onClick={() => void startArtistRadio(a.name, a.artUrl)}>
                    <RadioIcon size={16} /> Start artist radio
                  </button>
                </div>
              </div>
            </section>

            {a.topSongs.length > 0 && (
              <section className="section" aria-labelledby="top-songs">
                <h2 id="top-songs" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
                  Top songs
                </h2>
                <TrackList label="Top songs" tracks={a.topSongs} numbered />
              </section>
            )}
            {a.albums.length > 0 && (
              <section className="section" aria-labelledby="albums">
                <h2 id="albums" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
                  Albums
                </h2>
                <CardGrid>
                  {a.albums.map((al) => (
                    <AlbumCard key={al.id} album={al} />
                  ))}
                </CardGrid>
              </section>
            )}
            {a.singles.length > 0 && (
              <section className="section" aria-labelledby="singles">
                <h2 id="singles" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
                  Singles &amp; EPs
                </h2>
                <CardGrid>
                  {a.singles.map((al) => (
                    <AlbumCard key={al.id} album={al} />
                  ))}
                </CardGrid>
              </section>
            )}
            {a.related.length > 0 && (
              <section className="section" aria-labelledby="related">
                <h2 id="related" className="section-title" style={{ marginBottom: 'var(--space-3)' }}>
                  Fans also like
                </h2>
                <CardGrid>
                  {a.related.map((r) => (
                    <ArtistCard key={r.id} artist={r} />
                  ))}
                </CardGrid>
              </section>
            )}
          </>
        )}
      </QueryView>
    </div>
  )
}
