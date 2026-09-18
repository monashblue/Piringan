// GET /api/youtube-search?q=<query>
// Finds candidate YouTube videos for a track so the browser can load the
// best-matching one in the official YouTube IFrame Player (embedded
// playback only — this endpoint never downloads or extracts audio/video,
// it only returns video ids + basic public info for the embed to use).
//
// It returns up to MAX_RESULTS candidates in `items` (plus the top one
// duplicated at the top level for backward compatibility as
// videoId/title/channelTitle), so the client can pick the best match
// itself instead of blindly trusting YouTube's #1 result — see
// pickBestVideoMatch() in script.js.
const MAX_RESULTS = 8;

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
    url.searchParams.set("maxResults", String(MAX_RESULTS));
    url.searchParams.set("key", apiKey);

    const ytRes = await fetch(url);
    if (!ytRes.ok) {
      const text = await ytRes.text();
      res.status(ytRes.status).json({ error: `YouTube API error: ${text}` });
      return;
    }

    const data = await ytRes.json();

    const items = (data.items || [])
      .filter((item) => item.id && item.id.videoId)
      .map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
      }));

    if (!items.length) {
      res.status(404).json({ error: "Video yang cocok tidak ditemukan." });
      return;
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    res.status(200).json({
      // top pick duplicated here so any existing/older client still works
      videoId: items[0].videoId,
      title: items[0].title,
      channelTitle: items[0].channelTitle,
      items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Terjadi kesalahan di server." });
  }
};
