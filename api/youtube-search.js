// GET /api/youtube-search?q=<query>
// Finds the best-matching YouTube video for a track so the browser can load
// it in the official YouTube IFrame Player (embedded playback only — this
// endpoint never downloads or extracts audio/video, it only returns a
// video id + basic public info for the embed to use).
module.exports = async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ error: "Parameter q (kata kunci pencarian) wajib diisi." });
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "YOUTUBE_API_KEY belum diatur di environment variables." });
    return;
  }

  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "video");
    url.searchParams.set("videoCategoryId", "10"); // Music
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", apiKey);

    const ytRes = await fetch(url);
    if (!ytRes.ok) {
      const text = await ytRes.text();
      res.status(ytRes.status).json({ error: `YouTube API error: ${text}` });
      return;
    }

    const data = await ytRes.json();
    const item = data.items?.[0];
    if (!item) {
      res.status(404).json({ error: "Video yang cocok tidak ditemukan." });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
