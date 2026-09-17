// GET /api/deezer-search?q=<query>
// Returns simplified track metadata from Deezer's public catalog search.
// No API key, no OAuth, no Premium requirement — Deezer's search endpoint
// is open, but doesn't send CORS headers for browser calls, so it's proxied
// here (same pattern as the YouTube search route).
module.exports = async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "Parameter q (kata kunci pencarian) wajib diisi." });
    return;
  }

  try {
    const url = new URL("https://api.deezer.com/search");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "12");

    const deezerRes = await fetch(url);
    if (!deezerRes.ok) {
      const text = await deezerRes.text();
      res.status(deezerRes.status).json({ error: `Deezer API error: ${text}` });
      return;
    }

    const data = await deezerRes.json();
    if (data.error) {
      res.status(502).json({ error: data.error.message || "Deezer API error." });
      return;
    }

    const tracks = (data.data || []).map((t) => ({
      id: String(t.id),
      name: t.title,
      artists: t.artist?.name || "Tidak diketahui",
      album: t.album?.title || "",
      albumArt: t.album?.cover_medium || t.album?.cover || null,
      durationMs: (t.duration || 0) * 1000,
      sourceUrl: t.link || null,
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
