// GET /api/deezer-related?artistId=<id>
// Given a Deezer artist id (returned by /api/deezer-search as track.artistId),
// returns that artist's own top tracks plus a couple of related artists'
// top tracks. Used for two features on the client:
//   - "Rekomendasi buat kamu"  -> called with the top artist(s) from
//     listening history.
//   - "Mirip dengan ini"       -> called with the currently playing
//     track's artist.
// Both reuse the same track shape as /api/deezer-search so they can share
// rendering code on the client.
const RELATED_ARTIST_LIMIT = 3;
const TRACKS_PER_ARTIST = 6;

function mapTrack(t) {
  return {
    id: String(t.id),
    name: t.title,
    artists: t.artist?.name || "Tidak diketahui",
    album: t.album?.title || "",
    albumArt: t.album?.cover_medium || t.album?.cover || null,
    durationMs: (t.duration || 0) * 1000,
    sourceUrl: t.link || null,
    artistId: t.artist?.id ? String(t.artist.id) : null,
    albumId: t.album?.id ? String(t.album.id) : null,
  };
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  if (data.error) return null;
  return data;
}

module.exports = async (req, res) => {
  const artistId = (req.query.artistId || "").trim();
  if (!artistId) {
    res.status(400).json({ error: "Parameter artistId wajib diisi." });
    return;
  }

  try {
    const [topData, relatedData] = await Promise.all([
      fetchJson(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/top?limit=${TRACKS_PER_ARTIST}`),
      fetchJson(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/related?limit=${RELATED_ARTIST_LIMIT}`),
    ]);

    if (!topData && !relatedData) {
      res.status(404).json({ error: "Artis tidak ditemukan." });
      return;
    }

    const relatedArtists = (relatedData?.data || []).map((a) => ({
      id: String(a.id),
      name: a.name,
      picture: a.picture_medium || a.picture || null,
    }));

    const ownTracks = (topData?.data || []).map(mapTrack);

    const relatedTracksLists = await Promise.all(
      relatedArtists.map((artist) =>
        fetchJson(`https://api.deezer.com/artist/${artist.id}/top?limit=${TRACKS_PER_ARTIST}`)
      )
    );

    const seen = new Set(ownTracks.map((t) => t.id));
    const relatedTracks = [];
    relatedTracksLists.forEach((data) => {
      (data?.data || []).forEach((raw) => {
        const t = mapTrack(raw);
        if (seen.has(t.id)) return;
        seen.add(t.id);
        relatedTracks.push(t);
      });
    });

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    res.status(200).json({
      relatedArtists,
      tracks: [...ownTracks, ...relatedTracks],
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
