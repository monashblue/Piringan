// GET /api/deezer-genre?albumId=<id>
// Given a Deezer album id (returned by /api/deezer-search as track.albumId),
// returns the album's genre. Deezer's search endpoint doesn't include genre
// per track, but its album endpoint does — this is a small, cacheable
// lookup the client calls lazily (only for tracks it actually plays), not
// for every search result row.
module.exports = async (req, res) => {
  const albumId = (req.query.albumId || "").trim();
  if (!albumId) {
    res.status(400).json({ error: "Parameter albumId wajib diisi." });
    return;
  }

  try {
    const url = `https://api.deezer.com/album/${encodeURIComponent(albumId)}`;
    const deezerRes = await fetch(url);
    if (!deezerRes.ok) {
      const text = await deezerRes.text();
      res.status(deezerRes.status).json({ error: `Deezer API error: ${text}` });
      return;
    }

    const data = await deezerRes.json();
    if (data.error) {
      res.status(404).json({ error: data.error.message || "Album tidak ditemukan." });
      return;
    }

    const primaryGenre = data.genres?.data?.[0] || null;

    // Cache lama karena genre album praktis tidak pernah berubah.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    res.status(200).json({
      genre: primaryGenre?.name || null,
      genreId: primaryGenre?.id ?? data.genre_id ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
