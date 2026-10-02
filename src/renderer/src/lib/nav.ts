import { useNavigate } from 'react-router'
import type { Track } from '@shared/types'
import { toast } from '../store/toast'
import { api } from './queries'

type Ids = { artistId?: string; albumId?: string }
const located = new Map<string, Promise<Ids>>()

/** Known ids, or a (cached) lookup for tracks that arrived without them. */
function idsFor(t: Track): Promise<Ids> {
  if (t.artistId && t.albumId) return Promise.resolve({ artistId: t.artistId, albumId: t.albumId })
  const key = t.id || `${t.artist}|${t.title}`
  let p = located.get(key)
  if (!p) {
    p = api.catalog.locate(t).catch(() => ({}))
    located.set(key, p)
  }
  return p.then((found) => ({ artistId: t.artistId ?? found.artistId, albumId: t.albumId ?? found.albumId }))
}

const primaryArtist = (t: Track) => t.artist.split(',')[0].trim()

/** Artist name → artist page; song title → its album (or the artist if no album is found). */
export function useTrackNav() {
  const navigate = useNavigate()
  return {
    async artist(t: Track) {
      const { artistId } = await idsFor(t)
      if (artistId) navigate(`/artist/${artistId}`)
      else toast.error(`Couldn’t find ${primaryArtist(t)} on YouTube Music.`)
    },
    async album(t: Track) {
      const { albumId, artistId } = await idsFor(t)
      if (albumId) navigate(`/album/${albumId}`)
      else if (artistId) {
        navigate(`/artist/${artistId}`)
        toast.info(`No album found for “${t.title}”, so here’s ${primaryArtist(t)}.`)
      } else toast.error(`Couldn’t find the album for “${t.title}”.`)
    }
  }
}
