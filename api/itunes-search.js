// GET /api/itunes-search?q=<query>
// Returns simplified track metadata from Apple's public iTunes Search API.
// No API key, no auth. Used as a fallback source when Deezer's search
// comes back empty or errors out.
module.exports = async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "Parameter q (kata kunci pencarian) wajib diisi." });
    return;
  }

  try {
    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", q);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", "12");

    const itunesRes = await fetch(url);
    if (!itunesRes.ok) {
      const text = await itunesRes.text();
      res.status(itunesRes.status).json({ error: `iTunes API error: ${text}` });
      return;
    }

    const data = await itunesRes.json();
    const tracks = (data.results || []).map((t) => ({
      id: String(t.trackId),
      name: t.trackName,
      artists: t.artistName || "Tidak diketahui",
      album: t.collectionName || "",
      // artworkUrl100 -> minta versi lebih besar (600x600) dengan mengganti ukurannya di URL
      albumArt: t.artworkUrl100 ? t.artworkUrl100.replace("100x100", "600x600") : null,
      durationMs: t.trackTimeMillis || 0,
      sourceUrl: t.trackViewUrl || null,
      // iTunes sudah menyertakan genre langsung di hasil pencarian, tidak
      // perlu request tambahan seperti di jalur Deezer (lihat deezer-genre.js).
      genre: t.primaryGenreName || null,
      artistId: null,
      albumId: null,
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
