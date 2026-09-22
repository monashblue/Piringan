(() => {
  "use strict";

  function updateShuffleButton() {
  btnShuffle.classList.toggle(
    "active",
    playerState.shuffle
  );

     btnShuffle.title = playerState.shuffle
    ? "Shuffle: aktif"
    : "Shuffle: mati";
}

  function updateRepeatButton() {
  btnRepeat.classList.remove("active");

  if (playerState.repeat === "off") {
    btnRepeat.textContent = "🔁";
    btnRepeat.title = "Repeat: mati";
    return;
  }

  if (playerState.repeat === "all") {
    btnRepeat.textContent = "🔁";
    btnRepeat.classList.add("active");
    btnRepeat.title = "Repeat: semua lagu";
    return;
  }

  if (playerState.repeat === "one") {
    btnRepeat.textContent = "🔂";
    btnRepeat.classList.add("active");
    btnRepeat.title = "Repeat: satu lagu";
  }
}

  const PLAYLIST_STORAGE_KEY = "piringan_playlists";

  function getPlaylists() {
  try {
    return JSON.parse(
      localStorage.getItem(PLAYLIST_STORAGE_KEY)
    ) || [];
  } catch (error) {
    console.error("Failed to read playlists:", error);
    return [];
  }
}

  function savePlaylists(playlists) {
  localStorage.setItem(
    PLAYLIST_STORAGE_KEY,
    JSON.stringify(playlists)
  );
}
  
  // ---------- state ----------
  let currentResults = [];   // hasil pencarian, BUKAN queue player
  let ytPlayer = null;
  let ytReady = false;
  let progressTimer = null;
  let historyLoggedForCurrentTrack = false;
  let historyThresholdTimer = null;
  
  const playerState = {
  queue: [],
  currentIndex: -1,

  shuffle: false,
  shuffleQueue: [],
  shuffleHistory: [],
  shuffleHistoryIndex: -1,

  repeat: "off",
  context: "none",
  playlistId: null
};

  // ---------- dom ----------
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("results");

  const nowTitle = document.getElementById("now-title");
  const nowArtist = document.getElementById("now-artist");
  const timeElapsed = document.getElementById("time-elapsed");
  const timeDuration = document.getElementById("time-duration");
  const progressEl = document.getElementById("progress");
  const progressFill = document.getElementById("progress-fill");
  const vuEl = document.getElementById("vu");

  const btnRepeat = document.getElementById("btn-repeat");
  const btnPrev = document.getElementById("btn-prev");
  const btnPlay = document.getElementById("btn-play");
  const btnNext = document.getElementById("btn-next");
  const volumeEl = document.getElementById("volume");
  const btnShuffle = document.getElementById("btn-shuffle");
  const playlistList = document.getElementById("playlist-list");
  const btnCreatePlaylist =
  document.getElementById("btn-create-playlist");
  const recommendListEl = document.getElementById("recommend-list");
  const similarDeckEl = document.getElementById("similar-deck");
  const similarListEl = document.getElementById("similar-list");
  const similarSubtitleEl = document.getElementById("similar-subtitle");

  // ---------- helpers ----------
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  // ---------- pencarian video YouTube yang lebih akurat ----------
  // Dipakai bareng oleh playTrackAt() dan playCurrentQueueTrack() supaya
  // logikanya konsisten di satu tempat (lihat catatan di README soal
  // menambah penyaringan tambahan di sini).
  const NOISE_WORDS = [
    "reaction",
    "cover",
    "karaoke",
    "8d audio",
    "sped up",
    "nightcore",
    "slowed",
    "tutorial",
    "lirik",
    "lyrics only",
  ];

  function cleanTrackTitle(name) {
    // Buang embel-embel dalam kurung yang sering bikin hasil pencarian
    // meleset (mis. "(Remastered 2011)", "(2009 Remaster)", "(Radio Edit)")
    // tapi biarkan embel-embel penting seperti "(feat. ...)" atau
    // "(Live)" tetap ada karena itu bagian dari identitas lagunya.
    return name
      .replace(/\s*[([][^)\]]*\b(remaster(ed)?|radio edit|mono|stereo)\b[^)\]]*[)\]]/gi, "")
      .trim();
  }

  function buildYoutubeQuery(track) {
    const title = cleanTrackTitle(track.name);
    return `${track.artists} - ${title} official audio`;
  }

  // Kalau suatu saat /api/youtube-search dikembangkan untuk mengirim
  // beberapa kandidat (data.items, bukan cuma satu videoId), fungsi ini
  // bisa dipakai buat milih yang paling cocok dan menghindari video
  // reaction/cover/karaoke dsb.
  function pickBestVideoMatch(items, track) {
    if (!Array.isArray(items) || !items.length) return null;

    const wantedName = track.name.toLowerCase();
    const wantedArtist = (track.artists || "").split(",")[0].trim().toLowerCase();

    function score(item) {
      const t = (item.title || "").toLowerCase();
      const channel = (item.channelTitle || "").toLowerCase();
      let s = 0;

      if (t.includes(wantedName)) s += 3;
      if (wantedArtist && (t.includes(wantedArtist) || channel.includes(wantedArtist))) s += 2;
      if (t.includes("official audio") || t.includes("official video")) s += 2;
      if (channel.includes("- topic")) s += 2; // channel resmi otomatis YouTube Music

      NOISE_WORDS.forEach((word) => {
        if (t.includes(word) && !wantedName.includes(word)) s -= 3;
      });

      return s;
    }

    return items.reduce((best, item) =>
      score(item) > score(best) ? item : best
    , items[0]);
  }

  // ---------- riwayat, genre, rekomendasi & lagu mirip ----------
  const HISTORY_STORAGE_KEY = "piringan_history";
  const HISTORY_LIMIT = 300;
  const GENRE_CACHE_KEY = "piringan_genre_cache";

function getGenreCache() {
  try {
    return JSON.parse(
      localStorage.getItem(GENRE_CACHE_KEY)
    ) || {};
  } catch (error) {
    console.warn("Gagal membaca genre cache:", error);
    return {};
  }
}

function saveGenreCache(cache) {
  try {
    localStorage.setItem(
      GENRE_CACHE_KEY,
      JSON.stringify(cache)
    );
  } catch (error) {
    console.warn("Gagal menyimpan genre cache:", error);
  }
}

const genreCache = getGenreCache(); // albumId -> nama genre (string) atau null

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    } catch (err) {
      console.error("Failed to read history:", err);
      return [];
    }
  }

	function getHistoryStats() {
		const history = getHistory();
		
		const stats = {
			totalPlays: history.length,
			tracks: {},
			artists: {},
			genres: {}
		};
		
		for (const track of history) {
			if (!track) continue;
			
			const trackId = [
				track.provider || "unknown",
				track.providerId || track.id || ""
			].join(":");
			
			const artist = track.artist || track.artists;
			const genre = track.genre;
			
			// Statistik lagu
			if (trackId) {
				if (!stats.tracks[trackId]) {
					stats.tracks[trackId] = {
						id: track.id || null,
						provider: track.provider || null,
						providerId: track.providerId || null,
						title: track.title || track.name || "",
						artist: artist || "",
						plays: 0,
						lastPlayedAt: null
					};
				}

      stats.tracks[trackId].plays++;

      if (
        !stats.tracks[trackId].lastPlayedAt ||
        track.playedAt > stats.tracks[trackId].lastPlayedAt
      ) {
        stats.tracks[trackId].lastPlayedAt = track.playedAt;
      }
    }

    // Statistik artis
    if (artist) {
      if (!stats.artists[artist]) {
        stats.artists[artist] = {
          name: artist,
          plays: 0,
          lastPlayedAt: null
        };
      }

      stats.artists[artist].plays++;

      if (
        !stats.artists[artist].lastPlayedAt ||
        track.playedAt > stats.artists[artist].lastPlayedAt
      ) {
        stats.artists[artist].lastPlayedAt = track.playedAt;
      }
    }

    // Statistik genre
    if (genre) {
      if (!stats.genres[genre]) {
        stats.genres[genre] = {
          name: genre,
          plays: 0,
          lastPlayedAt: null
        };
      }

      stats.genres[genre].plays++;

      if (
        !stats.genres[genre].lastPlayedAt ||
        track.playedAt > stats.genres[genre].lastPlayedAt
      ) {
        stats.genres[genre].lastPlayedAt = track.playedAt;
	  }
	}
		}
		
		return stats;
	}
	
	function getGenrePreferences() {
		const stats = getHistoryStats();
		
		return Object.values(stats.genres)
			.sort((a, b) => b.plays - a.plays);
	}
	
	function getArtistPreferences() {
		const stats = getHistoryStats();
		
		return Object.values(stats.artists)
			.sort((a, b) => b.plays - a.plays);
	}

	function getRecencyWeight(lastPlayedAt, halfLifeDays = 7) {
		if (!lastPlayedAt) return 0;
		
		const lastPlayed = new Date(lastPlayedAt).getTime();
		const now = Date.now();
		
		if (Number.isNaN(lastPlayed)) return 0;
		
		const ageInDays = Math.max(
			0,
			(now - lastPlayed) / (1000 * 60 * 60 * 24)
		);
		
		return Math.pow(0.5, ageInDays / halfLifeDays);
	}

	function getWeightedGenrePreferences() {
		const stats = getHistoryStats();
		
		return Object.values(stats.genres)
			.map(genre => ({
				...genre,
				recencyWeight: getRecencyWeight(genre.lastPlayedAt),
				score: genre.plays * getRecencyWeight(genre.lastPlayedAt)
			}))
			.sort((a, b) => b.score - a.score);
	}

	function getWeightedArtistPreferences() {
		const stats = getHistoryStats();
		
		return Object.values(stats.artists)
			.map(artist => ({
				...artist,
				recencyWeight: getRecencyWeight(artist.lastPlayedAt),
				score: artist.plays * getRecencyWeight(artist.lastPlayedAt)
			}))
			.sort((a, b) => b.score - a.score);
	}

	function getRepetitionFactor(track) {
		if (!track) return 1;
		
		const stats = getHistoryStats();
		
		const trackId = [
			track.provider || "unknown",
			track.providerId || track.id || ""
		].join(":");
		
		const trackStats = stats.tracks[trackId];
		
		if (!trackStats) return 1;
		
		const plays = trackStats.plays || 0;
		
		return 1 / (1 + plays);
	}

	function getCandidateScore(track) {
		if (!track) return 0;
		
		const genrePreferences = getWeightedGenrePreferences();
		const artistPreferences = getWeightedArtistPreferences();
		
		const genre = track.genre;
		const artist = track.artist || track.artists;
		
		const genrePreference = genrePreferences.find(
			item => item.name === genre
		);
		
		const artistPreference = artistPreferences.find(
			item => item.name === artist
		);
		
		const genreScore = genrePreference
			? genrePreference.score
			: 0;
		
		const artistScore = artistPreference
			? artistPreference.score
			: 0;
		
		const repetitionFactor = getRepetitionFactor(track);
		
		const baseScore =
			genreScore +
			artistScore;
		
		return baseScore * repetitionFactor;
	}
	
	function saveHistory(history) {
		localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
	}

  // Genre lagu dari Deezer tidak ikut di hasil pencarian (lihat catatan di
  // api/deezer-genre.js), jadi baru diambil pas lagunya benar-benar diputar,
  // bukan buat semua baris hasil pencarian sekaligus. Hasilnya di-cache per
  // albumId biar lagu dari album yang sama tidak nge-hit API berkali-kali.

function normalizeTrack(track) {
  if (!track) return null;

  const provider = track.provider || null;

  const providerId =
    track.providerId ||
    track.id ||
    track.trackId ||
    null;

  return {
    ...track,

    // Identitas internal Piringan
    id: provider && providerId
      ? `${provider}:${providerId}`
      : providerId,

    provider,
    providerId,

    title:
      track.title ||
      track.name ||
      track.trackName ||
      "",

    artist:
      track.artist ||
      track.artists ||
      track.artistName ||
      "",

    album:
      track.album ||
      track.collectionName ||
      "",

    albumId: track.albumId || null,
    artistId: track.artistId || null,

    genre:
      track.genre ||
      track.primaryGenreName ||
      null
  };
}
  
  async function resolveGenre(track) {
  track = normalizeTrack(track);

  if (track.genre) return track.genre; // sudah ada langsung, mis. dari iTunes
  if (!track.albumId) return null;

  const cacheKey = `${track.provider}:${track.albumId}`;

  if (genreCache[cacheKey]) {
    return genreCache[cacheKey];
  }

  try {
    const res = await fetch(
      `/api/deezer-genre?albumId=${encodeURIComponent(track.albumId)}`
    );

    const data = await res.json();
    const genre = res.ok ? data.genre || null : null;

    genreCache[cacheKey] = genre;
    saveGenreCache(genreCache);

    return genre;
  } catch (err) {
    genreCache[cacheKey] = null;
    saveGenreCache(genreCache);

    return null;
  }
}
  
  async function recordHistory(track) {
    if (!track) return;
    const genre = await resolveGenre(track);
    track.genre = track.genre || genre; // biar langsung kepakai di tampilan juga

    const history = getHistory();
    history.push({
		id: track.id,
		provider: track.provider || null,
		providerId: track.providerId || null,
		
		name: track.name || track.title || "",
		title: track.title || track.name || "",
		
		artists: track.artists || track.artist || "",
		artist: track.artist || track.artists || "",
		
		album: track.album || "",
		albumArt: track.albumArt || "",
		
		artistId: track.artistId || null,
		albumId: track.albumId || null,
		
		genre: genre || track.genre || null,
		
		playedAt: new Date().toISOString(),
	});
    
    if (history.length > HISTORY_LIMIT) {
      history.splice(0, history.length - HISTORY_LIMIT);
    }

    saveHistory(history);
    loadRecommendations();
  }

  function getTopArtistIds(limit = 3) {
    const counts = new Map(); // artistId -> jumlah diputar

    getHistory().forEach((entry) => {
      if (!entry.artistId) return; // lagu dari iTunes tidak punya artistId Deezer
      counts.set(entry.artistId, (counts.get(entry.artistId) || 0) + 1);
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([artistId]) => artistId);
  }

  async function fetchRelated(artistId) {
    const res = await fetch(`/api/deezer-related?artistId=${encodeURIComponent(artistId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengambil rekomendasi.");
    return data;
  }

  function renderTrackList(container, tracks, context) {
    container.innerHTML = "";

    if (!tracks.length) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Belum ada yang bisa ditampilkan di sini.";
      container.appendChild(p);
      return;
    }

    tracks.forEach((track, idx) => {
      const row = buildTrackRow(track, {
        onPlay: () => {
          setQueue(tracks, idx, context);
          playCurrentQueueTrack();
        },
        onSecondary: (t) => openAddToPlaylistMenu(t),
        secondaryLabel: "+",
        secondaryClass: "track-add",
        secondaryTitle: "Tambahkan ke playlist",
        secondaryAriaLabel: `Tambahkan ${track.name} ke playlist`,
      });
      container.appendChild(row);
    });
  }

  async function loadRecommendations() {
    const topArtistIds = getTopArtistIds(3);

    if (!topArtistIds.length) {
      recommendListEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Putar beberapa lagu dari hasil pencarian dulu, nanti rekomendasi muncul di sini.";
      recommendListEl.appendChild(p);
      return;
    }

    try {
      const historyIds = new Set(getHistory().map((entry) => entry.id));
      const results = await Promise.all(
        topArtistIds.map((id) => fetchRelated(id).catch(() => null))
      );

      const seen = new Set();
      const combined = [];
      results.filter(Boolean).forEach((data) => {
        (data.tracks || []).forEach((t) => {
          if (historyIds.has(t.id) || seen.has(t.id)) return;
          seen.add(t.id);
          combined.push(t);
        });
      });

      renderTrackList(recommendListEl, combined.slice(0, 10), "recommend");
    } catch (err) {
      recommendListEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Gagal memuat rekomendasi.";
      recommendListEl.appendChild(p);
    }
  }

  async function loadSimilarSongs(track) {
    if (!track || !track.artistId) {
      // Lagu dari iTunes (fallback) tidak punya artistId Deezer, jadi tidak
      // ada cara mencari yang "mirip" — sembunyikan saja panelnya.
      similarDeckEl.hidden = true;
      return;
    }

    similarDeckEl.hidden = false;
    similarSubtitleEl.textContent = `berdasarkan "${track.name}"`;
    similarListEl.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "empty-note";
    loading.textContent = "memuat…";
    similarListEl.appendChild(loading);

    try {
		const data = await fetchRelated(track.artistId);
		
		const candidates = (data.tracks || [])
			.filter((t) => t.id !== track.id)
			.map(normalizeTrack);
      renderTrackList(similarListEl, combined, "similar");
    } catch (err) {
      similarListEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Gagal memuat lagu mirip.";
      similarListEl.appendChild(p);
    }
  }

  function setQueue(tracks, startIndex = 0, context = "search") {
  playerState.queue = [...tracks];
  playerState.currentIndex = startIndex;
  playerState.context = context;
  playerState.playlistId = null;

  playerState.shuffleQueue = [];

  playerState.shuffleHistory = [startIndex];
  playerState.shuffleHistoryIndex = 0;

  if (playerState.shuffle) {
    buildShuffleQueue();
  }
}

function getCurrentTrack() {
  return playerState.queue[playerState.currentIndex] || null;
}

  function buildShuffleQueue() {
  const queue = playerState.queue;

  if (!queue.length) {
    playerState.shuffleQueue = [];
    return;
  }

  const indexes = queue.map((_, index) => index);

  // Jangan langsung memainkan lagu yang sedang berjalan
  const remaining = indexes.filter(
    (index) => index !== playerState.currentIndex
  );

  // Fisher-Yates shuffle
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [
      remaining[j],
      remaining[i]
    ];
  }

  playerState.shuffleQueue = remaining;
}

  function startNewShuffleCycle() {
  buildShuffleQueue();
}

  // Baris lagu yang dipakai bareng oleh hasil pencarian, detail playlist,
  // rekomendasi, dan lagu mirip — supaya tampilannya konsisten dan tidak
  // ada 4 salinan kode yang mirip-mirip.
  function buildTrackRow(track, options = {}) {
    const { onPlay, secondaryLabel, secondaryClass, secondaryTitle, secondaryAriaLabel, onSecondary } = options;

    const row = document.createElement("div");
    row.className = "track-row";

    const art = document.createElement("img");
    art.className = "track-art";
    art.loading = "lazy";
    art.alt = "";
    art.src = track.albumArt || "";

    const info = document.createElement("div");
    info.className = "track-info";
    const name = document.createElement("div");
    name.className = "track-name";
    name.textContent = track.name;
    const meta = document.createElement("div");
    meta.className = "track-meta";
    // Tampilkan genre kalau sudah kebaca (lihat resolveGenre()), kalau
    // belum ya nama album seperti biasa.
    meta.textContent = track.genre
      ? `${track.artists} · ${track.genre}`
      : `${track.artists} · ${track.album}`;
    info.append(name, meta);

    const duration = document.createElement("div");
    duration.className = "track-duration";
    duration.textContent = formatTime(track.durationMs / 1000);

    const playBtn = document.createElement("button");
    playBtn.className = "track-play";
    playBtn.type = "button";
    playBtn.textContent = "Putar";
    if (onPlay) playBtn.addEventListener("click", () => onPlay(track));

    row.append(art, info, duration, playBtn);

    if (onSecondary) {
      const secondaryBtn = document.createElement("button");
      secondaryBtn.className = secondaryClass || "track-add";
      secondaryBtn.type = "button";
      secondaryBtn.textContent = secondaryLabel || "+";
      if (secondaryTitle) secondaryBtn.title = secondaryTitle;
      secondaryBtn.setAttribute("aria-label", secondaryAriaLabel || secondaryTitle || secondaryLabel || "");
      secondaryBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        onSecondary(track);
      });
      row.appendChild(secondaryBtn);
    }

    return row;
  }

  function renderResults(tracks) {
    resultsEl.innerHTML = "";
    if (!tracks.length) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Tidak ada hasil. Coba kata kunci lain.";
      resultsEl.appendChild(p);
      return;
    }

    tracks.forEach((track, idx) => {
      const row = buildTrackRow(track, {
        onPlay: () => playTrackAt(idx),
        onSecondary: (t) => openAddToPlaylistMenu(t),
        secondaryLabel: "+",
        secondaryClass: "track-add",
        secondaryTitle: "Tambahkan ke playlist",
        secondaryAriaLabel: `Tambahkan ${track.name} ke playlist`,
      });
      row.dataset.index = String(idx);
      resultsEl.appendChild(row);
    });
  }

  function openAddToPlaylistMenu(track) {
  const playlists = getPlaylists();

  if (!playlists.length) {
    alert("Buat playlist terlebih dahulu.");
    return;
  }

  const names = playlists
    .map((playlist, index) => `${index + 1}. ${playlist.name}`)
    .join("\n");

  const choice = prompt(
    `Tambahkan "${track.name}" ke playlist:\n\n${names}\n\nMasukkan nomor playlist:`
  );

  if (choice === null) return;

  const index = Number(choice) - 1;

  if (!Number.isInteger(index) || !playlists[index]) {
    alert("Pilihan playlist tidak valid.");
    return;
  }

  addTrackToPlaylist(
    playlists[index].id,
    track
  );
}

  function addTrackToPlaylist(playlistId, track) {
  const playlists = getPlaylists();

  const playlist = playlists.find(
    (item) => item.id === playlistId
  );

  if (!playlist) return;

  const alreadyExists = playlist.tracks.some(
    (item) => item.id === track.id
  );

  if (alreadyExists) {
    alert("Lagu sudah ada di playlist.");
    return;
  }

  playlist.tracks.push(track);

  savePlaylists(playlists);
  renderPlaylists();
}

  
  
  function highlightActiveRow() {
  document.querySelectorAll(".track-row").forEach((row) => {
    row.classList.toggle(
      "is-active",
      Number(row.dataset.index) === playerState.currentIndex
    );
  });
}

  function createPlaylistId() {
  return `playlist-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

  function renderPlaylists() {
  const playlists = getPlaylists();

  playlistList.innerHTML = "";

  if (!playlists.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Belum ada playlist.";
    playlistList.appendChild(empty);
    return;
  }

  playlists.forEach((playlist) => {
    const item = document.createElement("div");
    item.className = "playlist-item";

    const info = document.createElement("div");
    info.className = "playlist-info";

    const name = document.createElement("div");
    name.className = "playlist-name";
    name.textContent = playlist.name;

    const count = document.createElement("div");
    count.className = "playlist-count";
    count.textContent = `${playlist.tracks.length} lagu`;

    info.append(name, count);

    item.appendChild(info);

    item.addEventListener("click", () => {
      openPlaylist(playlist.id);
    });

    playlistList.appendChild(item);
  });
}

  function openPlaylist(playlistId) {
  const playlists = getPlaylists();

  const playlist = playlists.find(
    (item) => item.id === playlistId
  );

  if (!playlist) return;

  renderPlaylistDetail(playlist);
}

  function renderPlaylistDetail(playlist) {
  resultsEl.innerHTML = "";

  const header = document.createElement("div");
    header.className = "playlist-detail-header";
    
    const headerInfo = document.createElement("div");
    
    const title = document.createElement("h2");
    title.textContent = playlist.name;
    
    const subtitle = document.createElement("p");
    subtitle.textContent = `${playlist.tracks.length} lagu`;
    
    headerInfo.append(title, subtitle);
    
    const actions = document.createElement("div");
    actions.className = "playlist-actions";
    
    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "playlist-action-btn";
    renameBtn.textContent = "Rename";
    
    renameBtn.addEventListener("click", () => {
      renamePlaylist(playlist.id);
    });

const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "playlist-action-btn";
deleteBtn.textContent = "Hapus";

deleteBtn.addEventListener("click", () => {
  deletePlaylist(playlist.id);
});

actions.append(renameBtn, deleteBtn);

header.append(headerInfo, actions);
    
    function renamePlaylist(playlistId) {
      const playlists = getPlaylists();
      
      const playlist = playlists.find(
    (item) => item.id === playlistId
  );
      
      if (!playlist) return;
      
      const newName = prompt(
        "Nama playlist baru:",
        playlist.name
      );
      
      if (newName === null) return;
      
      const trimmedName = newName.trim();
      
      if (!trimmedName) {
        alert("Nama playlist tidak boleh kosong.");
        return;
      }
      
      playlist.name = trimmedName;
      
      savePlaylists(playlists);
      
      renderPlaylists();
      renderPlaylistDetail(playlist);
    }

    function deletePlaylist(playlistId) {
      const playlists = getPlaylists();
      const playlist = playlists.find(
    (item) => item.id === playlistId
  );
      
      if (!playlist) return;
      
      const confirmed = confirm(
        `Hapus playlist "${playlist.name}"?`
  );

  if (!confirmed) return;

  const updatedPlaylists = playlists.filter(
    (item) => item.id !== playlistId
  );

  savePlaylists(updatedPlaylists);

  renderPlaylists();

  resultsEl.innerHTML = "";
}

  resultsEl.appendChild(header);

  if (!playlist.tracks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Playlist ini masih kosong.";
    resultsEl.appendChild(empty);
    return;
  }

  playlist.tracks.forEach((track, index) => {
    const row = buildTrackRow(track, {
      onPlay: () => playPlaylistTrack(playlist.id, index),
      onSecondary: (t) => removeTrackFromPlaylist(playlist.id, t.id),
      secondaryLabel: "−",
      secondaryClass: "track-remove",
      secondaryTitle: "Hapus dari playlist",
      secondaryAriaLabel: `Hapus ${track.name} dari playlist`,
    });

    resultsEl.appendChild(row);
  });
}

  function playPlaylistTrack(playlistId, index) {
  const playlists = getPlaylists();
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) return;

  setQueue(playlist.tracks, index, "playlist");
  playerState.playlistId = playlistId;
  highlightActiveRow();
  playCurrentQueueTrack();
}

  function removeTrackFromPlaylist(playlistId, trackId) {
  const playlists = getPlaylists();

  const playlist = playlists.find(
    (item) => item.id === playlistId
  );

  if (!playlist) return;

  playlist.tracks = playlist.tracks.filter(
    (track) => track.id !== trackId
  );

  savePlaylists(playlists);

  renderPlaylists();
  renderPlaylistDetail(playlist);
}

  function createPlaylist() {
  const name = prompt("Nama playlist:");

  if (name === null) return;

  const trimmedName = name.trim();

  if (!trimmedName) {
    alert("Nama playlist tidak boleh kosong.");
    return;
  }

  const playlists = getPlaylists();

  const newPlaylist = {
    id: createPlaylistId(),
    name: trimmedName,
    tracks: []
  };

  playlists.push(newPlaylist);

  savePlaylists(playlists);
  renderPlaylists();
}

  // ---------- playlist controls ----------

btnCreatePlaylist.addEventListener(
  "click",
  createPlaylist
);

  // ---------- search ----------
  async function fetchTracks(source, query) {
  const res = await fetch(
    `/api/${source}?q=${encodeURIComponent(query)}`
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.error || `Pencarian ${source} gagal.`
    );
  }

  const provider =
    source === "deezer-search"
      ? "deezer"
      : source === "itunes-search"
        ? "itunes"
        : null;

  return (data.tracks || []).map(track =>
    normalizeTrack({
      ...track,
      provider
    })
  );
}

  async function doSearch(query) {
    setStatus("mencari…");
    resultsEl.innerHTML = "";
    try {
      let tracks = [];
      let usedFallback = false;
      try {
        tracks = await fetchTracks("deezer-search", query);
      } catch (err) {
        // Deezer bermasalah -> lanjut ke fallback di bawah, jangan berhenti di sini
      }

      if (!tracks.length) {
        tracks = await fetchTracks("itunes-search", query);
        usedFallback = tracks.length > 0;
      }

      currentResults = tracks;
      playerState.currentIndex = -1;

      if (!tracks.length) {
        setStatus("");
      } else {
        setStatus(
          usedFallback
            ? `${tracks.length} hasil dari iTunes untuk "${query}"`
            : `${tracks.length} hasil untuk "${query}"`
        );
      }
      renderResults(currentResults);
    } catch (err) {
      setStatus(err.message || "Terjadi kesalahan saat mencari.");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) doSearch(q);
  });

  // ---------- playback ----------
  async function playTrackAt(index) {
  const track = currentResults[index];
  if (!track) return;

  setQueue(currentResults, index, "search");
    
    playerState.currentIndex = index;
    highlightActiveRow();
    nowTitle.textContent = track.name;
    nowArtist.textContent = track.artists;
    timeDuration.textContent = formatTime(track.durationMs / 1000);
    timeElapsed.textContent = "0:00";
    progressFill.style.width = "0%";
    setStatus(`memuat "${track.name}"…`);

    try {
      const query = buildYoutubeQuery(track);
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video tidak ditemukan.");
      const best = pickBestVideoMatch(data.items, track) || data;
      loadIntoPlayer(best.videoId);
      setStatus(`memutar dari YouTube · ${best.channelTitle}`);
    } catch (err) {
      setStatus(err.message || "Gagal memuat audio dari YouTube.");
    }
  }

  function loadIntoPlayer(videoId) {
    historyLoggedForCurrentTrack = false;
    if (!ytReady) {
      // player not ready yet; retry shortly once the IFrame API has loaded
      setTimeout(() => loadIntoPlayer(videoId), 300);
      return;
    }
    if (ytPlayer) {
      ytPlayer.loadVideoById(videoId);
    } else {
      ytPlayer = new YT.Player("yt-mount", {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            e.target.setVolume(Number(volumeEl.value));
            e.target.playVideo();
          },
          onStateChange: onPlayerStateChange,
        },
      });
    }
  }

  function checkHistoryThreshold() {
	  if (historyLoggedForCurrentTrack) return;
	  
	  const track = getCurrentTrack();
	  if (!track || !ytPlayer) return;
	  
	  const currentTime = ytPlayer.getCurrentTime();
	  const duration = ytPlayer.getDuration();
	  
	  if (!duration || duration <= 0) return;
	  
	  const reachedTimeThreshold = currentTime >= 30;
	  const reachedPercentageThreshold =
	  currentTime / duration >= 0.30;
	  
	  if (reachedTimeThreshold || reachedPercentageThreshold) {
		  historyLoggedForCurrentTrack = true;
		  
		  recordHistory(track);
		  loadSimilarSongs(track);
		  
		  if (historyThresholdTimer) {
			  clearInterval(historyThresholdTimer);
			  historyThresholdTimer = null;
			  }
			  }
			  }

  function onPlayerStateChange(event) {
  const playing = event.data === YT.PlayerState.PLAYING;

  updatePlayIcon(playing);
  vuEl.classList.toggle("is-playing", playing);

  if (playing) {
    startProgressLoop();

    if (!historyLoggedForCurrentTrack) {
      if (historyThresholdTimer) {
        clearInterval(historyThresholdTimer);
      }

      historyThresholdTimer = setInterval(
        checkHistoryThreshold,
        1000
      );
    }
  } else {
    stopProgressLoop();

    if (historyThresholdTimer) {
      clearInterval(historyThresholdTimer);
      historyThresholdTimer = null;
    }
  }

  if (event.data === YT.PlayerState.ENDED) {
    playNext();
  }
}

  function updatePlayIcon(playing) {
    btnPlay.textContent = playing ? "⏸" : "▶";
  }

  function startProgressLoop() {
    stopProgressLoop();
    progressTimer = setInterval(() => {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
      const current = ytPlayer.getCurrentTime() || 0;
      const duration = ytPlayer.getDuration() || 0;
      timeElapsed.textContent = formatTime(current);
      if (duration > 0) {
        progressFill.style.width = `${(current / duration) * 100}%`;
        progressEl.setAttribute("aria-valuenow", String(Math.round((current / duration) * 100)));
      }
    }, 500);
  }

  function stopProgressLoop() {
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = null;
  }
  
  function playNext() {
  const queue = playerState.queue;

  if (!queue.length) return;

  // =========================
  // REPEAT ONE
  // =========================
  if (playerState.repeat === "one") {
    playCurrentQueueTrack();
    return;
  }

  // =========================
  // SHUFFLE
  // =========================
  if (playerState.shuffle) {

    // ---------------------------------
    // Masih ada history di depan
    // ---------------------------------
    if (
      playerState.shuffleHistoryIndex <
      playerState.shuffleHistory.length - 1
    ) {
      playerState.shuffleHistoryIndex++;

      playerState.currentIndex =
        playerState.shuffleHistory[
          playerState.shuffleHistoryIndex
        ];

      highlightActiveRow();
      playCurrentQueueTrack();

      return;
    }

    // ---------------------------------
    // Ambil lagu baru dari shuffle queue
    // ---------------------------------
    if (playerState.shuffleQueue.length > 0) {
      const nextIndex =
        playerState.shuffleQueue.shift();

      playerState.currentIndex = nextIndex;

      playerState.shuffleHistory.push(nextIndex);

      playerState.shuffleHistoryIndex =
        playerState.shuffleHistory.length - 1;

      highlightActiveRow();
      playCurrentQueueTrack();

      return;
    }

    // ---------------------------------
    // SHUFFLE + REPEAT ALL
    // ---------------------------------
    if (playerState.repeat === "all") {
      startNewShuffleCycle();

      if (playerState.shuffleQueue.length > 0) {
        const nextIndex =
          playerState.shuffleQueue.shift();

        playerState.currentIndex = nextIndex;

        playerState.shuffleHistory.push(nextIndex);

        playerState.shuffleHistoryIndex =
          playerState.shuffleHistory.length - 1;

        highlightActiveRow();
        playCurrentQueueTrack();

        return;
      }
    }

    // ---------------------------------
    // SHUFFLE + REPEAT OFF
    // ---------------------------------
    stopPlaybackAtEnd();
    return;
  }

  // =========================
  // NORMAL PLAYBACK
  // =========================

  if (playerState.currentIndex >= queue.length - 1) {

    // Repeat ALL
    if (playerState.repeat === "all") {
      playerState.currentIndex = 0;

      playerState.shuffleHistory = [0];
      playerState.shuffleHistoryIndex = 0;

      highlightActiveRow();
      playCurrentQueueTrack();

      return;
    }

    // Repeat OFF
    stopPlaybackAtEnd();
    return;
  }

  // Lagu berikutnya
  playerState.currentIndex++;

  playerState.shuffleHistory.push(
    playerState.currentIndex
  );

  playerState.shuffleHistoryIndex =
    playerState.shuffleHistory.length - 1;

  highlightActiveRow();
  playCurrentQueueTrack();
}

  function stopPlaybackAtEnd() {
  console.log("Queue selesai.");

  if (ytPlayer) {
    ytPlayer.stopVideo();
  }

  updatePlayIcon(false);
  vuEl.classList.remove("is-playing");
  stopProgressLoop();
}

  function playCurrentQueueTrack() {
  const track = getCurrentTrack();
  if (!track) return;

  nowTitle.textContent = track.name;
  nowArtist.textContent = track.artists;
  timeDuration.textContent = formatTime(track.durationMs / 1000);
  timeElapsed.textContent = "0:00";
  progressFill.style.width = "0%";

  setStatus(`memuat "${track.name}"…`);

  const query = buildYoutubeQuery(track);

  fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`)
    .then(async (res) => {
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Video tidak ditemukan.");
      }

      const best = pickBestVideoMatch(data.items, track) || data;
      loadIntoPlayer(best.videoId);
      setStatus(`memutar dari YouTube · ${best.channelTitle}`);
    })
    .catch((err) => {
      setStatus(err.message || "Gagal memuat audio dari YouTube.");
    });
}

 function playPrev() {
  const queue = playerState.queue;

  if (!queue.length) return;

  // =========================
  // SHUFFLE PREVIOUS
  // =========================
  if (playerState.shuffle) {

    if (playerState.shuffleHistoryIndex <= 0) {
      return;
    }

    playerState.shuffleHistoryIndex--;

    playerState.currentIndex =
      playerState.shuffleHistory[
        playerState.shuffleHistoryIndex
      ];

    highlightActiveRow();
    playCurrentQueueTrack();

    return;
  }

  // =========================
  // NORMAL PREVIOUS
  // =========================
  if (playerState.currentIndex <= 0) {
    return;
  }

  playerState.currentIndex--;

  highlightActiveRow();
  playCurrentQueueTrack();
}
  

  // ---------- transport controls ----------
  btnShuffle.addEventListener("click", () => {
  playerState.shuffle = !playerState.shuffle;

  if (playerState.shuffle) {

    if (playerState.currentIndex >= 0) {
      playerState.shuffleHistory = [
        playerState.currentIndex
      ];

      playerState.shuffleHistoryIndex = 0;

      buildShuffleQueue();
    }

    console.log("Shuffle ON");

  } else {

    playerState.shuffleQueue = [];

    console.log("Shuffle OFF");
  }

  updateShuffleButton();
});

  btnRepeat.addEventListener("click", () => {
  if (playerState.repeat === "off") {
    playerState.repeat = "all";
  } else if (playerState.repeat === "all") {
    playerState.repeat = "one";
  } else {
    playerState.repeat = "off";
  }

  updateRepeatButton();

  console.log("Repeat:", playerState.repeat);
});
  
  btnPlay.addEventListener("click", () => {
    if (!ytPlayer) return;
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  });

  btnNext.addEventListener("click", playNext);
  btnPrev.addEventListener("click", playPrev);

  volumeEl.addEventListener("input", () => {
    if (ytPlayer) ytPlayer.setVolume(Number(volumeEl.value));
  });

  progressEl.addEventListener("click", (e) => {
    if (!ytPlayer) return;
    const rect = progressEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const duration = ytPlayer.getDuration() || 0;
    if (duration > 0) ytPlayer.seekTo(duration * ratio, true);
  });

  progressEl.addEventListener("keydown", (e) => {
    if (!ytPlayer) return;
    const duration = ytPlayer.getDuration() || 0;
    const current = ytPlayer.getCurrentTime() || 0;
    if (e.key === "ArrowRight") ytPlayer.seekTo(Math.min(duration, current + 5), true);
    if (e.key === "ArrowLeft") ytPlayer.seekTo(Math.max(0, current - 5), true);
  });

  // ---------- YouTube IFrame API bootstrap ----------
  // Called automatically by the youtube.com/iframe_api script once loaded.
  window.onYouTubeIframeAPIReady = () => {
    ytReady = true;
  };

  // ---------- PWA service worker ----------
  // Enables "installable" status (needed later for TWA/APK packaging) and
  // basic offline shell caching. Safe to keep even if you never wrap it as
  // an APK — it only improves repeat-visit loading in the browser.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore — app still works fully without the service worker */
      });
    });
  }
  renderPlaylists();
  loadRecommendations();
})();
