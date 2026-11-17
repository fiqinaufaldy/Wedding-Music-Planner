const ADMIN_PIN = "2707";
const GUEST_PIN = "0727";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const SONG_DATA_VERSION = "2026-11-13-46";
const PLAYED_SONGS_KEY = "bandGuidePlayedSongs";

// Google Sheets / Apps Script source for STAGING.
// Leave empty to use the bundled songs.js fallback.
const GOOGLE_SHEET_API_URL = "/api/songs";
const GOOGLE_SHEET_FETCH_TIMEOUT = 10000;
const GUEST_REQUESTS_API_URL = "/api/guest-requests";

let role = null;
let songs = loadSongs();
let requests = [];
let playedSongs = loadPlayedSongs();

function normalizeSheetSong(row, index) {
  const pick = (...keys) => {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
    }
    return "";
  };
  return {
    id: pick("id", "ID") || `song-${String(index + 1).padStart(3, "0")}`,
    title: pick("title", "Title", "Judul Lagu"),
    artist: pick("artist", "Artist", "Artis", "Artis / Band"),
    duration: pick("duration", "Duration", "Durasi"),
    personalNotes: pick("personalNotes", "Personal Notes", "PersonalNotes"),
    category: pick("category", "Category", "Kategori") || "Other",
    performer: pick("performer", "Performer") || "TBD",
    status: pick("status", "Status") || "So So",
    key: pick("key", "Key", "Chord", "Chord Dasar", "Nada Dasar Lagu (Chord Dasar)"),
    reference: pick("reference", "Reference", "Reference Arrangement", "Reference Aransement"),
    notes: pick("notes", "Notes"),
    section: pick("section", "Section", "Bagian") || "Main Event"
  };
}

function normalizeSheetResponse(payload) {
  const rows = Array.isArray(payload) ? payload : (payload?.data || payload?.songs || payload?.rows || []);
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeSheetSong).filter(s => s.title);
}

async function fetchGoogleSheetSongs() {
  if (!GOOGLE_SHEET_API_URL) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SHEET_FETCH_TIMEOUT);
  try {
    const res = await fetch(GOOGLE_SHEET_API_URL, { method: "GET", cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const remoteSongs = normalizeSheetResponse(payload);
    if (!remoteSongs.length) throw new Error("Google Sheet returned no song rows.");
    return remoteSongs;
  } catch (err) {
    console.warn("Google Sheet unavailable. Using bundled/local song data instead.", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeGuestRequest(row, index) {
  const pick = (...keys) => {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null) return String(row[key]).trim();
    }
    return "";
  };
  return {
    id: pick("id", "ID") || `req-${String(index + 1).padStart(3, "0")}`,
    title: pick("title", "Title", "Judul Lagu"),
    artist: pick("artist", "Artist", "Artis", "Band / Artis", "Artis / Band"),
    name: pick("name", "Name", "Requester", "Requestor"),
    note: pick("note", "Note", "Notes"),
    status: pick("status", "Status") || "Pending",
    key: pick("key", "Key", "Chord", "Chord Dasar"),
    reference: pick("reference", "Reference", "Reference Arrangement", "Reference Aransement"),
    duration: pick("duration", "Duration", "Durasi", "Durasi Aksi"),
    performer: pick("performer", "Performer")
  };
}

async function fetchGuestRequests() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_SHEET_FETCH_TIMEOUT);
  try {
    const res = await fetch(GUEST_REQUESTS_API_URL, { method: "GET", cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const rows = Array.isArray(payload) ? payload : (payload?.data || payload?.requests || payload?.rows || []);
    if (!Array.isArray(rows)) throw new Error("Guest Request response is not an array.");
    return rows.map(normalizeGuestRequest).filter(r => r.title);
  } finally {
    clearTimeout(timeout);
  }
}

async function guestRequestAction(action, payload) {
  const res = await fetch(GUEST_REQUESTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function refreshGuestRequests() {
  try {
    requests = await fetchGuestRequests();
    renderRequests();
    updateDashboard();
    return true;
  } catch (err) {
    console.error("Guest Request Google Sheet unavailable:", err);
    requests = [];
    renderRequests();
    updateDashboard();
    return false;
  }
}

function loadSongs() {
  // Google Sheet is now the primary source. Keep only a previously cached
  // copy as a temporary fallback; do not depend on DEFAULT_SONGS/songs.js.
  const saved = localStorage.getItem("weddingSongs");
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function load(key, fallback) {
  const saved = localStorage.getItem(key);
  if (!saved) return structuredClone(fallback);
  try { return JSON.parse(saved); } catch { return structuredClone(fallback); }
}
function save() {
  localStorage.setItem("weddingSongs", JSON.stringify(songs));
  localStorage.setItem(PLAYED_SONGS_KEY, JSON.stringify(playedSongs));
}
function loadPlayedSongs() {
  const saved = localStorage.getItem(PLAYED_SONGS_KEY);
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function isSongPlayed(songId) {
  return !!playedSongs[songId];
}
function toggleSongPlayed(songId) {
  if (!songId) return;
  if (playedSongs[songId]) delete playedSongs[songId];
  else playedSongs[songId] = true;
  localStorage.setItem(PLAYED_SONGS_KEY, JSON.stringify(playedSongs));
  renderBandGuide();
}
function escapeHtml(v="") {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function slug(v="") { return v.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,""); }

function setupPins() {
  const pins = $$(".pin");
  pins.forEach((input, i) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g,"").slice(0,1);
      if (input.value && pins[i+1]) pins[i+1].focus();
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !input.value && pins[i-1]) pins[i-1].focus();
      if (e.key === "Enter") $("#loginBtn").click();
    });
  });
}
function getPin() { return $$(".pin").map(i => i.value).join(""); }
function clearPin() { $$(".pin").forEach(i => i.value=""); $$(".pin")[0].focus(); }

function login() {
  const pin = getPin();
  if (pin === ADMIN_PIN) role = "admin";
  else if (pin === GUEST_PIN) role = "guest";
  else {
    $("#loginError").textContent = "PIN tidak sesuai.";
    clearPin();
    return;
  }
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  applyRole();
  renderSongs();
}
function applyRole() {
  const isAdmin = role === "admin";
  $$(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
  const adminIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 14v2a6 6 0 0 0-6 6H4a8 8 0 0 1 8-8m0-1c-3.315 0-6-2.685-6-6s2.685-6 6-6s6 2.685 6 6s-2.685 6-6 6m0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4s-4 1.79-4 4s1.79 4 4 4m9 6h1v5h-8v-5h1v-1a3 3 0 1 1 6 0zm-2 0v-1a1 1 0 0 0-2 0v1z"/></svg>`;
  const memberIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="square" stroke-width="2" d="M16 20v-1a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v1M12.5 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0Zm3 4a4 4 0 0 0 0-8M23 20v-1a4 4 0 0 0-4-4"/></svg>`;
  $("#rolePill").innerHTML = isAdmin
    ? `${adminIcon}<span>Admin Access</span>`
    : `${memberIcon}<span>Member Access</span>`;
  const roleCard = $("#roleCard");
  if (roleCard) roleCard.innerHTML = isAdmin
    ? "<strong>Admin Access</strong><span>Full management access.</span>"
    : "<strong>Guest Access</strong><span>Read-only access.</span>";
}
function logout() {
  role = null;
  $("#app").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
  $("#loginError").textContent = "";
  clearPin();
}
function unique(field) {
  return [...new Set(songs.map(s => s[field]).filter(Boolean))].sort();
}
function populateFilters() {
  [["categoryFilter","category"],["performerFilter","performer"],["statusFilter","status"]].forEach(([id,field]) => {
    const el = $("#"+id), current = el.value;
    el.innerHTML = `<option value="">All ${field[0].toUpperCase()+field.slice(1)}</option>`;
    unique(field).forEach(v => el.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
    el.value = current;
  });
}
function statusClass(s) { return slug(s); }
const PLAY_VIDEO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m-2 14.5v-9l6 4.5z"/></svg>`;
const POPUP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32" aria-hidden="true"><title>popup</title><path fill="currentColor" d="M28 4H10a2.006 2.006 0 0 0-2 2v14a2.006 2.006 0 0 0 2 2h18a2.006 2.006 0 0 0 2-2V6a2.006 2.006 0 0 0-2-2m0 16H10V6h18Z"/><path fill="currentColor" d="M18 26H4V16h2v-2H4a2.006 2.006 0 0 0-2 2v10a2.006 2.006 0 0 0 2 2h14a2.006 2.006 0 0 0 2-2v-2h-2Z"/></svg>`;
function platform(url) { return PLAY_VIDEO_ICON; }
function renderSongs() {
  populateFilters();
  const q = $("#searchInput").value.toLowerCase().trim();
  const cat = $("#categoryFilter").value, perf = $("#performerFilter").value, stat = $("#statusFilter").value;
  const filtered = songs.filter(s => {
    const hay = [s.title,s.artist,s.personalNotes,s.category,s.performer,s.status,s.key,s.notes].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && (!cat || s.category===cat) && (!perf || s.performer===perf) && (!stat || s.status===stat);
  });
  $("#emptyState").classList.toggle("hidden", filtered.length > 0);
  $("#songTableBody").innerHTML = filtered.map((s,i) => `
    <tr>
      <td>${i+1}</td>
      <td><strong>${escapeHtml(s.title)}</strong></td>
      <td>${escapeHtml(s.artist)}</td>
      <td>${escapeHtml(s.duration)}</td>
      <td>${escapeHtml(s.personalNotes)}</td>
      <td><span class="category">${escapeHtml(s.category)}</span></td>
      <td>${s.performer.includes("(Friend)") ? `<span class="performer-tag">♟ ${escapeHtml(s.performer)}</span>` : escapeHtml(s.performer)}</td>
      <td><span class="status ${statusClass(s.status)}"><span>●</span>${escapeHtml(s.status)}</span></td>
      <td>${escapeHtml(s.key)}</td>
      <td>${s.reference ? `<button class="ref-btn" data-ref="${escapeHtml(s.reference)}" data-title="${escapeHtml(s.title)}" data-artist="${escapeHtml(s.artist)}"><span class="platform-icon">${PLAY_VIDEO_ICON}</span><span>Play Video</span><span class="popup-icon">${POPUP_ICON}</span></button>` : "—"}</td>
      <td>${escapeHtml(s.notes)}</td>
      ${role==="admin" ? `<td><button class="action-btn edit-btn" data-edit="${s.id}" title="Edit" aria-label="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M7 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1"/><path d="M20.385 6.585a2.1 2.1 0 0 0-2.97-2.97L9 12v3h3zM16 5l3 3"/></g></svg></button><button class="action-btn delete-btn" data-delete="${s.id}" title="Delete" aria-label="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zm2-4h2V8H9zm4 0h2V8h-2z"/></svg></button></td>` : ""}
    </tr>`).join("");
}
function openSong(id=null) {
  $("#songModalLabel").textContent = id ? "EDIT SONG" : "ADD SONG";
  $("#songModalTitle").textContent = id ? "Edit Wedding Song" : "Add Wedding Song";
  const s = id ? songs.find(x=>x.id===id) : null;
  $("#songId").value = s?.id || "";
  $("#fTitle").value = s?.title || "";
  $("#fArtist").value = s?.artist || "";
  $("#fDuration").value = s?.duration || "";
  $("#fCategory").value = s?.category || "";
  $("#fPerformer").value = s?.performer || "";
  $("#fStatus").value = s?.status || "Planned";
  $("#fKey").value = s?.key || "";
  $("#fReference").value = s?.reference || "";
  $("#fPersonalNotes").value = s?.personalNotes || "";
  $("#fNotes").value = s?.notes || "";
  openModal("songModal");
}
function saveSong(e) {
  e.preventDefault();
  const id = $("#songId").value || `song-${Date.now()}`;
  const item = {
    id, title:$("#fTitle").value.trim(), artist:$("#fArtist").value.trim(), duration:$("#fDuration").value.trim(),
    personalNotes:$("#fPersonalNotes").value.trim(), category:$("#fCategory").value.trim() || "Other",
    performer:$("#fPerformer").value.trim() || "TBD", status:$("#fStatus").value,
    key:$("#fKey").value.trim(), reference:$("#fReference").value.trim(), notes:$("#fNotes").value.trim()
  };
  const index = songs.findIndex(s=>s.id===id);
  if(index >= 0) songs[index] = item; else songs.push(item);
  save(); closeModal("songModal"); renderSongs(); renderRundown(); updateDashboard();
}
function deleteSong(id) {
  if (role !== "admin") return;
  const s = songs.find(x=>x.id===id);
  if (!s || !confirm(`Hapus "${s.title}"?`)) return;
  songs = songs.filter(x=>x.id!==id); save(); renderSongs(); renderRundown();
}
function getYouTubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return u.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v') || '';
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1].split('/')[0] || '';
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1].split('/')[0] || '';
      if (u.pathname.startsWith('/live/')) return u.pathname.split('/live/')[1].split('/')[0] || '';
    }
  } catch {}
  return '';
}

function openReference(url,title,artist="") {
  $("#referenceTitle").textContent = title || "Arrangement Reference";
  $("#referenceArtist").textContent = artist || "";
  $("#referenceArtist").classList.toggle("hidden", !artist);
  $("#openReference").href = url;
  let embed = "";
  const youtubeId = getYouTubeId(url);

  if (youtubeId) {
    // YouTube Error 153 is commonly caused by an iframe request without a
    // normal HTTP/HTTPS referrer. When the app is opened as file://, don't
    // create a broken iframe; show a clean fallback that opens the original.
    if (location.protocol === "http:" || location.protocol === "https:") {
      const params = new URLSearchParams({
        rel: "0",
        modestbranding: "1",
        playsinline: "1",
        origin: location.origin
      });
      embed = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?${params.toString()}" title="YouTube reference" loading="eager" referrerpolicy="origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    } else {
      embed = `<div class="player-placeholder youtube-fallback">
        <div class="youtube-fallback-icon">▶</div>
        <p>Video YouTube tidak dapat diputar langsung saat halaman dibuka dari file lokal.</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Watch on YouTube ↗</a>
      </div>`;
    }
  }

  if (!embed) {
    embed = `<div class="player-placeholder"><div style="font-size:28px;margin-bottom:10px">${platform(url)}</div><p>Preview inline untuk platform ini bergantung pada kebijakan embed platform.</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Buka reference asli ↗</a></div>`;
  }
  $("#referencePlayer").innerHTML = embed;
  openModal("referenceModal");
}
function renderRequests() {
  const q = (($('#requestSearch')?.value || '').trim().toLowerCase());
  const filtered = requests.filter(r => !q || [r.title,r.artist,r.name,r.note,r.performer,r.status].join(' ').toLowerCase().includes(q));
  const counts = requests.reduce((a,r) => { const k=(r.status||'').toLowerCase(); if(k==='approved') a.approved++; else if(k==='pending') a.pending++; else if(k==='rejected') a.rejected++; return a; }, {approved:0,pending:0,rejected:0});
  if ($('#guestTotal')) $('#guestTotal').textContent = requests.length;
  if ($('#guestApproved')) $('#guestApproved').textContent = counts.approved;
  if ($('#guestPending')) $('#guestPending').textContent = counts.pending;
  if ($('#guestRejected')) $('#guestRejected').textContent = counts.rejected;

  $("#requestList").innerHTML = filtered.length ? filtered.map((r,i) => {
    const matched = songs.find(s => String(s.title).trim().toLowerCase() === String(r.title).trim().toLowerCase());
    const chord = r.key || r.chord || matched?.key || "-";
    const reference = r.reference || matched?.reference || "";
    const duration = r.duration || matched?.duration || "-";
    return `
    <tr>
      <td class="guest-no">${i+1}</td>
      <td class="guest-song-cell"><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.artist || matched?.artist || '—')}</small></td>
      <td class="guest-requester"><span class="requester-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"/></svg></span><strong>${escapeHtml(r.name)}</strong></td>
      <td class="guest-note">${escapeHtml(r.note || '—')}</td>
      <td><span class="status ${statusClass(r.status)}"><span class="status-dot"></span>${escapeHtml(r.status)}</span></td>
      <td class="guest-key">${escapeHtml(chord)}</td>
      <td class="guest-reference">${reference ? `<button class="guest-reference-btn" type="button" data-reference="${escapeHtml(reference)}">Play Video <span class="guest-ref-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></button>` : `<span class="guest-dash">—</span>`}</td>
      <td class="guest-duration">${escapeHtml(duration)}</td>
      <td class="guest-actions">
        ${r.status==="Pending" ? `<button class="guest-action approve" data-approve="${r.id}">✓ <span>Approve</span></button><button class="guest-action reject" data-reject="${r.id}">× <span>Reject</span></button>` : ""}
        ${r.status==="Approved" ? `<button class="guest-action playlist" data-promote="${r.id}">♫ <span>Add to Main Playlist</span></button>` : ""}
        ${r.status==="Rejected" ? `<button class="guest-action disabled-action" disabled>⊘ <span>Rejected</span></button>` : ""}
        <button class="guest-more" type="button" aria-label="More actions">⋮</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="9" class="guest-empty">Tidak ada request yang cocok.</td></tr>`;
}
async function approveRequest(id, status) {
  const r = requests.find(x=>x.id===id); if(!r) return;
  try {
    await guestRequestAction("updateGuestRequest", { id, status });
    await refreshGuestRequests();
  } catch (err) {
    alert(`Gagal mengubah status request: ${err.message}`);
  }
}
async function promoteRequest(id) {
  const r = requests.find(x=>x.id===id); if(!r) return;
  try {
    await guestRequestAction("addToMainPlaylist", { request: r });
    await refreshGuestRequests();
    const remoteSongs = await fetchGoogleSheetSongs();
    if (remoteSongs) { songs = remoteSongs; localStorage.setItem("weddingSongs", JSON.stringify(songs)); renderSongs(); updateDashboard(); if (typeof renderBandGuide === "function") renderBandGuide(); }
  } catch (err) {
    alert(`Gagal menambahkan ke Main Playlist: ${err.message}`);
  }
}
let bandGuideOpen = JSON.parse(localStorage.getItem("bandGuideOpen") || "{}");
let bandGuideTab = localStorage.getItem("bandGuideTab") || "list";

const BAND_PRIORITY = {
  Confirmed: {label:"Must Play", cls:"must", desc:"Wajib dimainkan."},
  "Quite Good": {label:"Should Play", cls:"should", desc:"Sebaiknya dimainkan."},
  "So So": {label:"Flexible", cls:"flex", desc:"Bisa dimainkan jika waktu memungkinkan."},
  Cancelled: {label:"Skip if Needed", cls:"skip", desc:"Dikorbankan jika waktu tidak cukup."}
};

function bandPriority(status){ return BAND_PRIORITY[status] || BAND_PRIORITY["So So"]; }
function bandSectionFor(song, index){
  if(song.section) return song.section;
  if(index < 2) return "Opening";
  if(index >= songs.length - 3) return "Closing";
  return "Main Event";
}
function bandSectionIcon(name){
  if(name === "Opening") return '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><title>mail-open</title><g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="m7 12l5 3.5l5-3.5"/><path d="M2 20V9.132a2 2 0 0 1 .971-1.715l8-4.8a2 2 0 0 1 2.058 0l8 4.8A2 2 0 0 1 22 9.132V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/></g></svg>';
  if(name === "Closing") return '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 36 36"><title>end-arrow</title><path fill="#31373d" d="M34 3H12.475V1.128c0-1.046-.74-1.434-1.644-.865L.69 6.652c-.905.57-.922 1.527-.038 2.127l10.215 6.931c.884.602 1.607.235 1.607-.811V13H34a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2M.088 22.915c0-1.03.515-1.791 1.606-1.791h5.108c.989 0 1.462.7 1.462 1.421c0 .7-.495 1.421-1.462 1.421H3.178v3.008h3.378c1.009 0 1.503.699 1.503 1.421c0 .699-.515 1.42-1.503 1.42H3.178v3.131h3.811c.988 0 1.462.701 1.462 1.421c0 .701-.495 1.422-1.462 1.422H1.675c-.906 0-1.586-.617-1.586-1.544zm9.419-.309c0-1.029.659-1.606 1.545-1.606c.392 0 1.03.31 1.298.68l6.529 8.712h.041v-7.785c0-1.029.659-1.606 1.545-1.606s1.545.577 1.545 1.606v11.699c0 1.03-.659 1.606-1.545 1.606c-.391 0-1.009-.309-1.297-.681l-6.53-8.608h-.041v7.683c0 1.03-.659 1.606-1.544 1.606s-1.545-.576-1.545-1.606v-11.7zm14.239.104c0-.948.659-1.586 1.586-1.586h3.419c4.612 0 7.249 2.965 7.249 7.537c0 4.326-2.801 7.127-7.043 7.127h-3.584c-.68 0-1.627-.37-1.627-1.544zm3.09 10.235h2.08c2.656 0 3.872-1.957 3.872-4.429c0-2.637-1.235-4.551-4.078-4.551h-1.874z"/></svg>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><title>main-component</title><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m20.95 14.55l-6.39 6.39c-1.4 1.4-3.7 1.4-5.11 0l-6.39-6.39c-1.4-1.4-1.4-3.7 0-5.11l6.39-6.39c1.4-1.4 3.7-1.4 5.11 0l6.39 6.39c1.41 1.4 1.4 3.7 0 5.11m-14.7-8.3l11.5 11.5m0-11.5l-11.5 11.5"/></svg>';
}
function durationSeconds(value){
  if(value===null || value===undefined || value==='') return 0;
  if(typeof value === 'number') return Math.max(0, Math.round(value));
  const parts=String(value).trim().split(':').map(Number);
  if(parts.some(Number.isNaN)) return 0;
  if(parts.length===3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if(parts.length===2) return parts[0]*60 + parts[1];
  return parts[0] || 0;
}
function formatBandTotal(total){
  total=Math.max(0,Math.round(total||0));
  const hours=Math.floor(total/3600);
  const minutes=Math.floor((total%3600)/60);
  const seconds=total%60;
  const parts=[];
  if(hours) parts.push(`${hours} jam`);
  if(minutes) parts.push(`${minutes} menit`);
  if(!hours && !minutes && seconds) parts.push(`${seconds} detik`);
  return parts.length ? parts.join(' ') : '0 menit';
}
function getBandGroups(){
  const groups={"Opening":[],"Main Event":[],"Closing":[]};
  songs.forEach((song,i)=>groups[bandSectionFor(song,i)].push(song));
  return Object.entries(groups).filter(([,list])=>list.length).map(([name,list])=>({name,songs:list}));
}
function updateBandGuideProgress() {
  const total = songs.length;
  const played = songs.filter(s => isSongPlayed(s.id)).length;
  const percent = total ? Math.round((played / total) * 100) : 0;
  if ($("#bgPlayedProgress")) $("#bgPlayedProgress").textContent = `${played} / ${total} Lagu (${percent}%)`;
  if ($("#bgPlayedProgressBar")) $("#bgPlayedProgressBar").style.width = `${percent}%`;
  return { total, played, percent };
}

function renderBandGuide(){
  const validSongIds = new Set(songs.map(s => s.id));
  Object.keys(playedSongs).forEach(id => { if (!validSongIds.has(id)) delete playedSongs[id]; });
  updateBandGuideProgress();

  const total=songs.length;
  const counts={Confirmed:0,"Quite Good":0,"So So":0,Cancelled:0};
  songs.forEach(s=>counts[s.status]=(counts[s.status]||0)+1);
  $("#bgTotal").textContent=total; $("#bgMust").textContent=counts.Confirmed||0; $("#bgShould").textContent=counts["Quite Good"]||0; $("#bgFlex").textContent=counts["So So"]||0; $("#bgSkip").textContent=counts.Cancelled||0;
  $$(".band-tab").forEach(b=>b.classList.toggle("active",b.dataset.bgTab===bandGuideTab));
  $("#bandGuideList").classList.toggle("hidden",bandGuideTab!=="list");
  $("#bandGuideSummary").classList.toggle("hidden",bandGuideTab!=="summary");
  const groups=getBandGroups();
  $("#bandGuideList").innerHTML=groups.map(g=>{
    const totalSec=g.songs.reduce((a,s)=>a+durationSeconds(s.duration),0);
    const playedCount=g.songs.filter(s=>isSongPlayed(s.id)).length;
    const sectionPercent=g.songs.length ? Math.round((playedCount/g.songs.length)*100) : 0;
    const open=bandGuideOpen[g.name]!==false;
    const subtitle=g.name==="Opening"?"Lagu pembuka untuk mengawali acara.":g.name==="Closing"?"Lagu penutup untuk mengakhiri acara.":"Lagu utama yang dimainkan selama acara berlangsung.";
    return `<section class="band-section ${open?"open":"collapsed"}">
      <div class="band-section-head" data-band-collapse="${escapeHtml(g.name)}">
        <div class="band-section-icon">${bandSectionIcon(g.name)}</div>
        <div class="band-section-title"><h3>${escapeHtml(g.name)}</h3><p>${subtitle}</p></div>
        <div class="band-section-meta"><span>${g.songs.length} Lagu</span><span>± ${formatBandTotal(totalSec)}</span>${playedCount ? `<span class="section-played-count">✓ ${playedCount} Selesai (${sectionPercent}%)</span>` : ""}</div>
        <button class="band-section-chevron" type="button" aria-label="Toggle section">${open ? `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><title>arrow-up-2</title><path fill="currentColor" fill-rule="evenodd" d="M11.512 8.43a.75.75 0 0 1 .976 0l7 6a.75.75 0 1 1-.976 1.14L12 9.987l-6.512 5.581a.75.75 0 1 1-.976-1.138z" clip-rule="evenodd"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><title>arrow-down-2</title><path fill="currentColor" fill-rule="evenodd" d="M4.43 8.512a.75.75 0 0 1 1.058-.081L12 14.012l6.512-5.581a.75.75 0 0 1 .976 1.138l-7 6a.75.75 0 0 1-.976 0l-7-6a.75.75 0 0 1-.081-1.057" clip-rule="evenodd"/></svg>`}</button>
      </div>
      <div class="band-section-body">
        <div class="band-table-head"><span>NO.</span><span>JUDUL LAGU</span><span>ARTIS</span><span>STATUS</span><span>DURASI</span></div>
        ${g.songs.map((s,i)=>{
          const p=bandPriority(s.status);
          const played=isSongPlayed(s.id);
          return `<div class="band-song-row ${played?"is-played":""}" data-song-id="${escapeHtml(s.id)}">
            <span>${i+1}</span>
            <div class="band-song-title"><strong>${escapeHtml(s.title)}</strong></div>
            <div class="band-artist">${escapeHtml(s.performer||"-")} · ${escapeHtml(s.artist||"-")}</div>
            <span class="priority-badge ${p.cls}"><i></i>${p.label}</span>
            <span class="band-duration">${escapeHtml(s.duration||"--:--")}</span>
            <button class="band-played-toggle ${played?"checked":""}" type="button" data-played-id="${escapeHtml(s.id)}" aria-pressed="${played}" aria-label="${played?"Tandai belum dimainkan":"Tandai sudah dimainkan"}">
              <span class="band-check-box">${played ? "✓" : ""}</span>
              <span>${played ? "Sudah Dimainkan" : "Belum Dimainkan"}</span>
            </button>
          </div>`;
        }).join("")}
      </div>
    </section>`;
  }).join("");
  const summaryGroups=["Confirmed","Quite Good","So So","Cancelled"].map(status=>{const p=bandPriority(status); const list=songs.filter(s=>s.status===status); return `<div class="priority-summary-card"><div><span class="priority-badge ${p.cls}"><i></i>${p.label}</span><p>${p.desc}</p></div><strong>${list.length}</strong><div class="priority-summary-list">${list.map(s=>`<span>${escapeHtml(s.title)}</span>`).join("")}</div></div>`}).join("");
  $("#bandGuideSummary").innerHTML=summaryGroups;
}

function renderRundown(){ renderBandGuide(); }
function openRundownSongPicker(){ alert("Band Guide mengikuti daftar lagu di Wedding Song."); }
function saveRundownOrder(){}

function openModal(id){$("#"+id).classList.remove("hidden")}
function closeModal(id){$("#"+id).classList.add("hidden"); if(id==="referenceModal") $("#referencePlayer").innerHTML=""}

function updateDashboard() {
  $("#statSongs").textContent = songs.length;
  $("#statConfirmed").textContent = songs.filter(s => s.status === "Confirmed").length;
  $("#statPerformers").textContent = new Set(songs.map(s => s.performer).filter(Boolean)).size;
  $("#statRequests").textContent = requests.length;

  const recent = [...songs].slice(-5).reverse();
  $("#recentSongs").innerHTML = recent.map((s,i) => `
    <div class="song-preview">
      <div class="song-number">${i+1}</div>
      <div><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.artist)} · ${escapeHtml(s.performer)}</small></div>
      <span class="song-status ${statusClass(s.status)}">${escapeHtml(s.status)}</span>
    </div>`).join("");
}
function switchPage(page) {
  $$(".page").forEach(p=>p.classList.add("hidden"));
  $(`#${page}Page`).classList.remove("hidden");
  $$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  if(page==="dashboard"){ $("#pageTitle").textContent="Dashboard"; $("#pageSubtitle").textContent="Overview wedding music planner."; updateDashboard(); }
  if(page==="songs"){ $("#pageTitle").textContent="Wedding Song"; $("#pageSubtitle").textContent="Daftar lagu untuk seluruh rangkaian wedding Fiqi & Tiara."; renderSongs(); $("#songHorizontalMouse")?.classList.remove("hidden"); }
  else if(page==="requests"){ $("#songHorizontalMouse")?.classList.remove("hidden"); }
  else { $("#songHorizontalMouse")?.classList.add("hidden"); }
  if(page==="requests"){ $("#pageTitle").textContent="Guest Request"; $("#pageSubtitle").textContent="Kelola request lagu dari teman."; renderRequests(); }
  const isBandGuide = page === "rundown";
  $("#rolePill")?.classList.toggle("hidden", isBandGuide);
  $("#bandGuideTopActions")?.classList.toggle("hidden", !isBandGuide);
  if(page==="rundown"){ $("#pageTitle").textContent="Band Guide"; $("#pageSubtitle").textContent="Panduan lagu dan prioritas permainan untuk Elegantie."; renderBandGuide(); }
  if(page==="settings"){ $("#pageTitle").textContent="Setting"; $("#pageSubtitle").textContent="Appearance dan preferensi tampilan."; }
}
function setTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);
  localStorage.setItem("weddingTheme", theme);
  $("#themeToggle")?.classList.toggle("is-dark", dark);
  if ($("#themeLabel")) $("#themeLabel").textContent = "Theme";
  if ($("#themeToggle")) $("#themeToggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

document.addEventListener("DOMContentLoaded",async()=>{
  setupPins();

  // Bind login/UI handlers before waiting for the remote data.
  // A slow or unavailable Google Sheet must never make the Login button dead.
  // Login is bound defensively so missing optional UI elements cannot break initialization.
  $("#loginBtn")?.addEventListener("click", login);
  $("#logoutBtn")?.addEventListener("click",logout);
  $("#songForm")?.addEventListener("submit",saveSong);
  $("#requestForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const payload={
      name:$("#rName")?.value.trim(),
      title:$("#rTitle")?.value.trim(),
      artist:$("#rArtist")?.value.trim(),
      performer:$("#rPerformer")?.value.trim(),
      key:$("#rKey")?.value.trim(),
      duration:$("#rDuration")?.value.trim(),
      reference:$("#rReference")?.value.trim(),
      note:$("#rNote")?.value.trim(),
      status:"Pending"
    };
    try {
      await guestRequestAction("addGuestRequest", payload);
      closeModal("requestModal"); e.target.reset(); await refreshGuestRequests();
    } catch (err) {
      alert(`Gagal menyimpan request ke Google Sheet: ${err.message}`);
    }
  });
  $("#addSongBtn")?.addEventListener("click",()=>openSong());
  $("#printBandGuideBtn")?.addEventListener("click",()=>window.print());
  $("#shareBandGuideBtn")?.addEventListener("click",async()=>{try{await navigator.share({title:"Fiqi & Tiara — Band Guide",text:"Wedding Music Planner — Band Guide"});}catch(e){}});
  $$(".band-tab").forEach(btn=>btn.addEventListener("click",()=>{bandGuideTab=btn.dataset.bgTab;localStorage.setItem("bandGuideTab",bandGuideTab);renderBandGuide();}));
  $("#bandGuideList")?.addEventListener("click",e=>{
    const playedBtn=e.target.closest("[data-played-id]");
    if(playedBtn){
      e.stopPropagation();
      toggleSongPlayed(playedBtn.dataset.playedId);
      return;
    }
    const head=e.target.closest("[data-band-collapse]");
    if(!head)return;
    const name=head.dataset.bandCollapse;
    bandGuideOpen[name]=bandGuideOpen[name]===false;
    localStorage.setItem("bandGuideOpen",JSON.stringify(bandGuideOpen));
    renderBandGuide();
  });
  $("#addRequestBtn")?.addEventListener("click",()=>openModal("requestModal"));
  $("#requestSearch")?.addEventListener("input", renderRequests);
  document.addEventListener("click", e => { const btn=e.target.closest(".guest-reference-btn"); if(btn?.dataset.reference) openReference(btn.dataset.reference); });
  $("#searchInput")?.addEventListener("input",renderSongs);
  ["categoryFilter","performerFilter","statusFilter"].forEach(id=>$("#"+id)?.addEventListener("change",renderSongs));

  // Fetch Google Sheet after the UI is wired so network errors cannot block Login.
  const remoteSongs = await fetchGoogleSheetSongs();
  if (remoteSongs) {
    songs = remoteSongs;
    localStorage.setItem("weddingSongs", JSON.stringify(songs));
    localStorage.setItem("weddingSongsVersion", SONG_DATA_VERSION + "-sheet");
    renderSongs();
    updateDashboard();
    if (typeof renderBandGuide === "function") renderBandGuide();
  }

  // Guest Request is Google Sheet-only. Never restore requests from localStorage.
  await refreshGuestRequests();

  const scrollHorizontalTable = (direction) => {
    const target = document.querySelector("#songsPage:not(.hidden) .table-scroll, #requestsPage:not(.hidden) .guest-table-scroll");
    if (!target) return;
    const amount = Math.max(280, Math.round(target.clientWidth * 0.72));
    target.scrollBy({ left: direction * amount, behavior: "smooth" });
  };
  $("#songScrollLeft")?.addEventListener("click",()=>scrollHorizontalTable(-1));
  $("#songScrollRight")?.addEventListener("click",()=>scrollHorizontalTable(1));
  $$(".nav-item").forEach(n=>n.addEventListener("click",()=>switchPage(n.dataset.page)));
  document.addEventListener("click",e=>{
    const view=e.target.closest("[data-rd-view]");
    if(view){ rundownView=view.dataset.rdView; localStorage.setItem("rundownView",rundownView); renderRundown(); }
    const collapse=e.target.closest("[data-collapse]");
    if(collapse){ const key=collapse.dataset.collapse; rundownOpen[key]=rundownOpen[key]===false; localStorage.setItem("rundownOpen",JSON.stringify(rundownOpen)); renderRundown(); }
    const addTo=e.target.closest("[data-add-to]");
    if(addTo && role==="admin") openRundownSongPicker(addTo.dataset.addTo);
  });
  let dragSong=null;
  document.addEventListener("dragstart",e=>{ const el=e.target.closest(".moment-song"); if(!el || role!=="admin") return; dragSong={id:el.dataset.songId,moment:el.dataset.moment}; el.classList.add("dragging"); });
  document.addEventListener("dragend",e=>{ const el=e.target.closest(".moment-song"); if(el) el.classList.remove("dragging"); dragSong=null; });
  document.addEventListener("dragover",e=>{ const el=e.target.closest(".moment-song"); if(el && dragSong){ e.preventDefault(); } });
  document.addEventListener("drop",e=>{ const el=e.target.closest(".moment-song"); if(!el || !dragSong) return; e.preventDefault(); reorderRundown(dragSong.moment,dragSong.id,el.dataset.moment,el.dataset.songId); });
  $("[data-go='songs']")?.addEventListener("click",()=>switchPage("songs"));
  const sidebarToggle = $("#sidebarToggle");
  const appShell = $("#app");
  const savedSidebar = localStorage.getItem("sidebarCollapsed") === "true";
  if (savedSidebar) {
    appShell.classList.add("sidebar-collapsed");
    sidebarToggle?.setAttribute("aria-expanded", "false");
    sidebarToggle?.setAttribute("aria-label", "Buka menu");
    sidebarToggle?.setAttribute("title", "Buka menu");
  }
  sidebarToggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = appShell.classList.toggle("sidebar-collapsed");
    localStorage.setItem("sidebarCollapsed", collapsed ? "true" : "false");
    sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    sidebarToggle.setAttribute("aria-label", collapsed ? "Buka menu" : "Ciutkan menu");
    sidebarToggle.setAttribute("title", collapsed ? "Buka menu" : "Ciutkan menu");
  });

  const profileToggle = $("#profileToggle");
  const profileMenu = $("#profileMenu");
  const toggleProfileMenu = (force) => {
    const open = typeof force === "boolean" ? force : !profileMenu.classList.contains("open");
    profileMenu.classList.toggle("open", open);
    profileToggle.classList.toggle("is-open", open);
    profileToggle.setAttribute("aria-expanded", open ? "true" : "false");
    const control = $("#profileChevron");
    control?.setAttribute("aria-expanded", open ? "true" : "false");
    control?.setAttribute("aria-label", open ? "Close profile menu" : "Open profile menu");
    profileMenu.setAttribute("aria-hidden", open ? "false" : "true");
  };
  const profileControl = $("#profileChevron");
  profileControl?.addEventListener("click",(e)=>{ e.stopPropagation(); toggleProfileMenu(); });
  profileControl?.addEventListener("keydown",e=>{ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); toggleProfileMenu(); }});
  $("#themeToggle")?.addEventListener("click",(e)=>{ e.stopPropagation(); setTheme(document.body.classList.contains("dark") ? "light" : "dark"); });
  setTheme(localStorage.getItem("weddingTheme") || "light");
  switchPage("dashboard");
  document.addEventListener("click",e=>{
    if (!e.target.closest("#profileToggle") && !e.target.closest("#profileMenu")) toggleProfileMenu(false);
    const ref=e.target.closest("[data-ref]"); if(ref) openReference(ref.dataset.ref,ref.dataset.title,ref.dataset.artist);
    const edit=e.target.closest("[data-edit]"); if(edit) openSong(edit.dataset.edit);
    const del=e.target.closest("[data-delete]"); if(del) deleteSong(del.dataset.delete);
    const approve=e.target.closest("[data-approve]"); if(approve) approveRequest(approve.dataset.approve,"Approved");
    const reject=e.target.closest("[data-reject]"); if(reject) approveRequest(reject.dataset.reject,"Rejected");
    const promote=e.target.closest("[data-promote]"); if(promote) promoteRequest(promote.dataset.promote);
    const close=e.target.closest("[data-close]"); if(close) closeModal(close.dataset.close);
  });
  $$(".modal-backdrop").forEach(b=>b.addEventListener("click",()=>b.parentElement.classList.add("hidden")));
});
