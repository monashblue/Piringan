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

  function getRandomNextIndex() {
  const queue = playerState.queue;

  if (queue.length <= 1) {
    return playerState.currentIndex;
  }

  let nextIndex;

  do {
    nextIndex = Math.floor(Math.random() * queue.length);
  } while (nextIndex === playerState.currentIndex);

  return nextIndex;
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
  
  const playerState = {
  queue: [],
  currentIndex: -1,
  shuffle: false,
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

  function setQueue(tracks, startIndex = 0, context = "search") {
  playerState.queue = [...tracks];
  playerState.currentIndex = startIndex;
  playerState.context = context;
  playerState.playlistId = null;
}

function getCurrentTrack() {
  return playerState.queue[playerState.currentIndex] || null;
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
      const row = document.createElement("div");
      row.className = "track-row";
      row.dataset.index = String(idx);

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
      meta.textContent = `${track.artists} · ${track.album}`;
      info.append(name, meta);

      const duration = document.createElement("div");
      duration.className = "track-duration";
      duration.textContent = formatTime(track.durationMs / 1000);

      const playBtn = document.createElement("button");
      playBtn.className = "track-play";
      playBtn.type = "button";
      playBtn.textContent = "Putar";
      playBtn.addEventListener("click", () => playTrackAt(idx));

      row.append(art, info, duration, playBtn);
      resultsEl.appendChild(row);
    });
  }

  function highlightActiveRow() {
  document.querySelectorAll(".track-row").forEach((row) => {
    row.classList.toggle(
      "is-active",
      Number(row.dataset.index) === playerState.currentIndex
    );
  });
}

  // ---------- search ----------
  async function fetchTracks(source, query) {
    const res = await fetch(`/api/${source}?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Pencarian ${source} gagal.`);
    return data.tracks || [];
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
      const query = `${track.artists} ${track.name} audio`;
      const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video tidak ditemukan.");
      loadIntoPlayer(data.videoId);
      setStatus(`memutar dari YouTube · ${data.channelTitle}`);
    } catch (err) {
      setStatus(err.message || "Gagal memuat audio dari YouTube.");
    }
  }

  function loadIntoPlayer(videoId) {
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

  function onPlayerStateChange(event) {
    const playing = event.data === YT.PlayerState.PLAYING;
    updatePlayIcon(playing);
    vuEl.classList.toggle("is-playing", playing);
    if (playing) {
      startProgressLoop();
    } else {
      stopProgressLoop();
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

  // REPEAT ONE
  if (playerState.repeat === "one") {
    playCurrentQueueTrack();
    return;
  }

  // SHUFFLE
  if (playerState.shuffle) {
    const nextIndex = getRandomNextIndex();

    // Kalau hanya ada satu lagu
    if (nextIndex === playerState.currentIndex) {
      if (playerState.repeat === "all") {
        playCurrentQueueTrack();
      } else {
        stopPlaybackAtEnd();
      }
      return;
    }

    playerState.currentIndex = nextIndex;

    highlightActiveRow();
    playCurrentQueueTrack();
    return;
  }

  // PLAY NORMAL / REPEAT ALL
  if (playerState.currentIndex >= queue.length - 1) {

    // Repeat ALL → kembali ke lagu pertama
    if (playerState.repeat === "all") {
      playerState.currentIndex = 0;

      highlightActiveRow();
      playCurrentQueueTrack();
      return;
    }

    // Repeat OFF → berhenti
    stopPlaybackAtEnd();
    return;
  }

  // Lagu berikutnya
  playerState.currentIndex++;

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

  const query = `${track.artists} ${track.name} audio`;

  fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`)
    .then(async (res) => {
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Video tidak ditemukan.");
      }

      loadIntoPlayer(data.videoId);
      setStatus(`memutar dari YouTube · ${data.channelTitle}`);
    })
    .catch((err) => {
      setStatus(err.message || "Gagal memuat audio dari YouTube.");
    });
}

  function playPrev() {
  const queue = playerState.queue;

  if (!queue.length) return;

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

  updateShuffleButton();

  console.log(
    playerState.shuffle
      ? "Shuffle ON"
      : "Shuffle OFF"
  );
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
})();
