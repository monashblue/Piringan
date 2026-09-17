const { getSpotifyToken } = require("../lib/spotify-token");

// GET /api/spotify-search?q=<query>
// Returns simplified track metadata from Spotify's public catalog search.
// No user data, no OAuth — just title/artist/album/art/duration for display.
module.exports = async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "Parameter q (kata kunci pencarian) wajib diisi." });
    return;
  }

  try {
    const token = await getSpotifyToken();

    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "12");

    const spotifyRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!spotifyRes.ok) {
      const text = await spotifyRes.text();
      res.status(spotifyRes.status).json({ error: `Spotify API error: ${text}` });
      return;
    }

    const data = await spotifyRes.json();
    const tracks = (data.tracks?.items || []).map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => a.name).join(", "),
      album: t.album.name,
      albumArt: t.album.images?.[1]?.url || t.album.images?.[0]?.url || null,
      durationMs: t.duration_ms,
      spotifyUrl: t.external_urls?.spotify || null,
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
