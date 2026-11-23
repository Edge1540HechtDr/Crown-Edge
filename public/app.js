/* Crown Edge client */
{
  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rc.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('rc.' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('rc.' + k); } catch {} },
  };
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  function dist(a, b) { // meters between {lat,lng}
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  const lineLength = (pts) => pts.reduce((s, p, i) => (i ? s + dist({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: p[0], lng: p[1] }) : 0), 0);
  const miles = (m) => (m == null ? '' : (m / 1609.34 < 10 ? (m / 1609.34).toFixed(1) : Math.round(m / 1609.34)) + ' mi');
  const mph = (ms) => (ms == null ? null : Math.round(ms * 2.23694));
  const hm = (s) => { if (s == null) return ''; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return new Date(t).toLocaleDateString(); };
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const initials = (n) => (n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  function toast(text, ms = 3500) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22].forEach((d) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.type = 'square';
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d + 0.18);
        o.connect(g).connect(audioCtx.destination); o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.2);
      });
    } catch {}
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  }

  // ---------- pin look ----------
  const PIN_STYLE = {
    police:       { color: '#1f5fd6', svg: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" fill="currentColor"/><path d="m12 7 1.5 3 3.3.4-2.4 2.3.6 3.3L12 14.5 9 16l.6-3.3-2.4-2.3 3.3-.4z" fill="#1f5fd6"/>' },
    debris:       { color: '#b8621b', svg: '<path d="M3 18l4-6 3 3 3-6 3 4 5 5z" fill="currentColor"/><circle cx="7" cy="7" r="2" fill="currentColor"/>' },
    accident:     { color: '#e8251a', svg: '<path d="M5 15l1.5-4.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 15v4h-2v-2H7v2H5z" fill="currentColor"/><path d="M12 2v4M8 3l1.5 3M16 3l-1.5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    hazard:       { color: '#d98a00', svg: '<path d="M12 3 2 21h20z" fill="currentColor"/><path d="M12 9v6M12 17.5v.5" stroke="#d98a00" stroke-width="2.4" stroke-linecap="round"/>' },
    construction: { color: '#ff6a00', svg: '<path d="M10 3h4l5 16H5z" fill="currentColor"/><path d="M8 11h8M7 15h10" stroke="#ff6a00" stroke-width="2"/><path d="M3 20h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    stopped:      { color: '#8e44ad', svg: '<path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16v3h-2v-1.5H7V19H5z" fill="currentColor"/><path d="M12 2v4M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' },
    weather:      { color: '#0b7285', svg: '<path d="M7 15a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 9 3 3 0 0 1 17 15z" fill="currentColor"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  };
  const pinSvg = (type, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:#fff">${(PIN_STYLE[type] || PIN_STYLE.hazard).svg}</svg>`;

  // ---------- state ----------
  const S = {
    me: null, code: null, members: new Map(), pins: new Map(), routes: [], threads: {}, pinTypes: {},
    myLoc: null, sharing: false, watchId: null, follow: true, tab: 'map', openThread: null,
    unread: store.get('unread', {}), alerted: new Set(), activeRoute: null, wakeLock: null, reportAt: null,
  };

  // ---------- map ----------
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([41.99, -88.18], 11);
  // OpenStreetMap tiles: free, no key. Darkened with CSS (.leaflet-tile-pane) to match the navy theme.
  // For a public launch, switch to a paid tile provider (MapTiler, Mapbox, Stadia) per OSM's tile usage policy.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const layers = { drivers: L.layerGroup().addTo(map), pins: L.layerGroup().addTo(map), route: L.layerGroup().addTo(map), build: L.layerGroup().addTo(map) };
  const driverMarkers = new Map();
  const pinMarkers = new Map();
  let meMarker = null, meAccuracy = null;
  map.on('dragstart', () => { S.follow = false; });

  function driverIcon(m, isMe) {
    const heading = m.loc && m.loc.heading != null ? m.loc.heading : null;
    const shape = heading == null
      ? `<circle cx="20" cy="20" r="9" fill="${m.color}" stroke="#fff" stroke-width="3"/>`
      : `<g transform="rotate(${heading} 20 20)"><path d="M20 5 31 33 20 27 9 33z" fill="${m.color}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></g>`;
    const sp = m.loc ? mph(m.loc.speed) : null;
    const label = isMe ? 'You' : esc(m.name) + (sp != null && sp > 2 ? ` · ${sp}` : '');
    return L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 20],
      html: `<div class="drv"><svg class="arrow" viewBox="0 0 40 40" width="40" height="40">${shape}</svg><div class="tag">${label}</div></div>` });
  }

  function renderDriver(m) {
    if (!S.me || m.id === S.me.id) return;
    let mk = driverMarkers.get(m.id);
    if (!m.loc || !m.sharing) { if (mk) { layers.drivers.removeLayer(mk); driverMarkers.delete(m.id); } return; }
    const ll = [m.loc.lat, m.loc.lng];
    if (!mk) {
      mk = L.marker(ll, { icon: driverIcon(m), zIndexOffset: 500 }).addTo(layers.drivers);
      mk.on('click', () => openDriverPopup(m.id));
      driverMarkers.set(m.id, mk);
    } else { mk.setLatLng(ll); mk.setIcon(driverIcon(m)); }
  }
  function openDriverPopup(mid) {
    const m = S.members.get(mid); const mk = driverMarkers.get(mid); if (!m || !mk) return;
    const sp = mph(m.loc && m.loc.speed);
    const d = S.myLoc && m.loc ? miles(dist(S.myLoc, m.loc)) + ' away' : '';
    mk.bindPopup(`<strong>${esc(m.name)}</strong>${m.vehicle ? '<br><span class="muted">' + esc(m.vehicle) + '</span>' : ''}
      <br>${sp != null ? sp + ' mph · ' : ''}${d}<br><span class="muted">Updated ${ago(m.loc.t)}</span>
      <div class="pop-actions"><button class="btn small" data-dm="${m.id}">Message</button></div>`).openPopup();
  }

  function renderMe() {
    if (!S.myLoc) return;
    const ll = [S.myLoc.lat, S.myLoc.lng];
    const meM = { ...S.me, loc: S.myLoc, color: '#1164C2' };
    if (!meMarker) {
      meAccuracy = L.circle(ll, { radius: S.myLoc.accuracy || 20, color: '#1164C2', weight: 1, fillOpacity: 0.12 }).addTo(map);
      meMarker = L.marker(ll, { icon: driverIcon(meM, true), zIndexOffset: 1000 }).addTo(map);
    } else {
      meMarker.setLatLng(ll); meMarker.setIcon(driverIcon(meM, true));
      meAccuracy.setLatLng(ll); meAccuracy.setRadius(S.myLoc.accuracy || 20);
    }
    if (S.follow) map.setView(ll, Math.max(map.getZoom(), 14), { animate: true });
  }

  function renderPin(p) {
    const st = PIN_STYLE[p.type] || PIN_STYLE.hazard;
    let mk = pinMarkers.get(p.id);
    const icon = L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19],
      html: `<div class="pinmk" style="background:${st.color}">${pinSvg(p.type, 20)}</div>` });
    if (!mk) {
      mk = L.marker([p.lat, p.lng], { icon }).addTo(layers.pins);
      pinMarkers.set(p.id, mk);
    } else mk.setIcon(icon);
    const label = (S.pinTypes[p.type] || {}).label || p.type;
    mk.bindPopup(`<strong>${esc(label)}</strong>${p.note ? '<br>' + esc(p.note) : ''}
      <br><span class="muted">By ${esc(p.byName)} · ${ago(p.created)} · ${p.confirms.length} confirmed</span>
      <div class="pop-actions"><button class="btn small" data-vote="${p.id}" data-still="1">Still there</button>
      <button class="btn small danger" data-vote="${p.id}" data-still="0">Not there</button></div>`);
  }
  function removePin(pid) {
    const mk = pinMarkers.get(pid);
    if (mk) { layers.pins.removeLayer(mk); pinMarkers.delete(pid); }
    S.pins.delete(pid);
  }

  // Popup buttons (Leaflet builds popups from HTML, so we delegate clicks).
  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-vote]');
    if (v) {
      socket.emit('pin:vote', { id: v.dataset.vote, still: v.dataset.still === '1' }, (r) => {
        if (!r.ok) toast(r.error); else toast(v.dataset.still === '1' ? 'Thanks, confirmed' : 'Thanks, marked as cleared');
      });
      map.closePopup();
    }
    const dm = e.target.closest('[data-dm]');
    if (dm) { map.closePopup(); openTab('chat'); openConvo(dm.dataset.dm); }
  });

  // ---------- hazard alerts ----------
  const ALERT_RADIUS = 1200; // meters
  function checkAlerts() {
    if (!S.myLoc) return;
    for (const p of S.pins.values()) {
      if (S.alerted.has(p.id) || p.by === S.me.id) continue;
      const d = dist(S.myLoc, p);
      if (d > ALERT_RADIUS) continue;
      const h = S.myLoc.heading;
      const moving = S.myLoc.speed != null && S.myLoc.speed > 3;
      if (moving && h != null) {
        let diff = Math.abs(bearing(S.myLoc, p) - h); diff = Math.min(diff, 360 - diff);
        if (diff > 50) continue; // only alert for pins roughly ahead
      } else if (d > 500) continue;
      S.alerted.add(p.id);
      showAlert(p, d);
    }
  }
  let alertTimer = null;
  function showAlert(p, d) {
    const label = (S.pinTypes[p.type] || {}).label || p.type;
    const b = $('#alertBanner');
    b.innerHTML = `<span class="ab-icon">${pinSvg(p.type, 30)}</span><span>${esc(label)} ahead<small>${miles(d)}${p.note ? ' · ' + esc(p.note) : ''} · reported ${ago(p.created)}</small></span>`;
    b.hidden = false;
    beep();
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { b.hidden = true; }, 9000);
  }
  $('#alertBanner').addEventListener('click', () => { $('#alertBanner').hidden = true; });

  // ---------- socket ----------
  const socket = io({ autoConnect: false, reconnection: true });
  socket.on('connect', () => { $('#conn').classList.add('on'); if (S.code) doJoin(true); });
  socket.on('disconnect', () => $('#conn').classList.remove('on'));

  socket.on('member', (m) => {
    const prev = S.members.get(m.id);
    S.members.set(m.id, m);
    if (!prev && S.me && m.id !== S.me.id) toast(`${m.name} joined the crew`);
    renderDriver(m); renderCrew(); renderThreads(); updateCount();
  });
  socket.on('location', ({ id, loc }) => {
    const m = S.members.get(id); if (!m) return;
    m.loc = loc; m.sharing = true; m.lastSeen = loc.t;
    renderDriver(m);
    if (S.tab === 'crew') renderCrew();
  });
  socket.on('pin', (p) => {
    const isNew = !S.pins.has(p.id);
    S.pins.set(p.id, p); renderPin(p);
    if (isNew && p.by !== S.me.id) {
      const label = (S.pinTypes[p.type] || {}).label || p.type;
      toast(`${p.byName} reported: ${label}${S.myLoc ? ' · ' + miles(dist(S.myLoc, p)) + ' away' : ''}`);
      checkAlerts();
    }
  });
  socket.on('pin:removed', ({ id }) => removePin(id));
  socket.on('route', (r) => {
    if (S.routes.some((x) => x.id === r.id)) return;
    S.routes.unshift(r); renderRoutes();
    if (r.by !== S.me.id) { toast(`${r.byName} sent a route: ${r.name}`, 6000); beep(); showRoute(r.id, true); }
  });
  socket.on('route:removed', ({ id }) => {
    S.routes = S.routes.filter((r) => r.id !== id);
    if (S.activeRoute === id) hideRoute();
    renderRoutes();
  });
  socket.on('chat', (msg) => {
    (S.threads[msg.thread] = S.threads[msg.thread] || []).push(msg);
    const viewing = S.tab === 'chat' && S.openThread === msg.thread;
    if (msg.from !== S.me.id && !viewing) {
      S.unread[msg.thread] = (S.unread[msg.thread] || 0) + 1; store.set('unread', S.unread);
      toast(`${msg.thread === 'group' ? 'Crew' : 'Private'} · ${msg.fromName}: ${msg.text.slice(0, 80)}`);
    }
    if (viewing) renderMessages();
    renderThreads(); updateBadge();
  });

  // ---------- join ----------
  const saved = store.get('profile', null);
  if (saved) { $('#jName').value = saved.name || ''; $('#jVehicle').value = saved.vehicle || ''; $('#jCode').value = saved.code || ''; }
  const hashCode = (location.hash || '').replace('#', '').toUpperCase();
  if (/^[A-Z0-9-]{3,24}$/.test(hashCode)) $('#jCode').value = hashCode;

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const profile = { ...(store.get('profile', {}) || {}), name: $('#jName').value.trim(), vehicle: $('#jVehicle').value.trim(), code: $('#jCode').value.trim().toUpperCase() };
    if (profile.code !== (saved && saved.code)) { delete profile.memberId; delete profile.token; } // new group, new member
    store.set('profile', profile);
    S.code = profile.code;
    if (!socket.connected) socket.connect(); else doJoin(false);
  });

  function doJoin(isReconnect) {
    const profile = store.get('profile', {});
    socket.emit('join', { code: profile.code, name: profile.name, vehicle: profile.vehicle, memberId: profile.memberId, token: profile.token }, (r) => {
      if (!r.ok) { $('#joinErr').textContent = r.error; S.code = null; return; }
      profile.memberId = r.me.id; profile.token = r.token; store.set('profile', profile);
      S.me = r.me; S.code = r.state.code; S.pinTypes = r.state.pinTypes;
      S.members = new Map(r.state.members.map((m) => [m.id, m]));
      S.threads = r.state.threads; S.routes = r.state.routes;
      pinMarkers.forEach((mk) => layers.pins.removeLayer(mk)); pinMarkers.clear(); S.pins.clear();
      r.state.pins.forEach((p) => { S.pins.set(p.id, p); renderPin(p); });
      layers.drivers.clearLayers(); driverMarkers.clear();
      S.members.forEach(renderDriver);
      $('#join').hidden = true; $('#app').hidden = false;
      $('#codeLabel').textContent = S.code;
      map.invalidateSize();
      renderPinGrid(); renderRoutes(); renderThreads(); renderCrew(); updateCount(); updateBadge();
      if (isReconnect && S.sharing) socket.emit('sharing', { on: true });
      if (!isReconnect) {
        toast(`Joined #${S.code}`);
        if (store.get('autoShare', false)) setSharing(true);
        const fit = [...S.members.values()].filter((m) => m.loc).map((m) => [m.loc.lat, m.loc.lng]);
        if (fit.length) map.fitBounds(fit, { padding: [60, 60], maxZoom: 14 });
      }
    });
  }

  $('#codeBtn').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#' + S.code;
    const text = `Join my crew on Crown Edge — built for the drive! ${url} (group code ${S.code})`;
    try {
      if (navigator.share) await navigator.share({ title: 'Crown Edge', text, url });
      else { await navigator.clipboard.writeText(text); toast('Invite link copied'); }
    } catch { toast(`Group code: ${S.code}`); }
  });
  $('#leaveBtn').addEventListener('click', () => {
    setSharing(false);
    const p = store.get('profile', {}); delete p.memberId; delete p.token; p.code = ''; store.set('profile', p);
    location.hash = ''; location.reload();
  });
  function updateCount() {
    const all = [...S.members.values()];
    $('#crewCount').textContent = `${all.filter((m) => m.online).length}/${all.length} online`;
  }

  // ---------- location sharing ----------
  async function setSharing(on) {
    if (on && !('geolocation' in navigator)) { toast('This device does not support location.'); return; }
    S.sharing = on; store.set('autoShare', on);
    $('#shareBtn').setAttribute('aria-pressed', String(on));
    $('#shareLabel').textContent = on ? 'Sharing' : 'Share location';
    socket.emit('sharing', { on });
    if (on) {
      S.follow = true;
      S.watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
      try { if ('wakeLock' in navigator) S.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    } else {
      if (S.watchId != null) navigator.geolocation.clearWatch(S.watchId);
      S.watchId = null;
      try { S.wakeLock && S.wakeLock.release(); } catch {}
      S.wakeLock = null;
    }
  }
  let lastSent = 0, lastSentLoc = null;
  function onPos(pos) {
    const c = pos.coords;
    let heading = c.heading != null && !Number.isNaN(c.heading) ? c.heading : null;
    const loc = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, speed: c.speed, heading, t: Date.now() };
    // Some phones don't report heading; derive it from movement.
    if (heading == null && S.myLoc && dist(S.myLoc, loc) > 8) loc.heading = bearing(S.myLoc, loc);
    else if (heading == null && S.myLoc) loc.heading = S.myLoc.heading;
    S.myLoc = loc;
    renderMe(); checkAlerts();
    const t = Date.now();
    // Throttle uploads: every 3 s, or sooner if we've moved 30 m.
    if (S.sharing && (t - lastSent > 3000 || (lastSentLoc && dist(lastSentLoc, loc) > 30))) {
      socket.emit('location', loc); lastSent = t; lastSentLoc = loc;
    }
  }
  function onPosErr(err) {
    if (err.code === 1) { toast('Location permission denied. Turn it on in your browser settings.', 6000); setSharing(false); }
    else toast('Waiting for GPS…');
  }
  $('#shareBtn').addEventListener('click', () => setSharing(!S.sharing));
  $('#centerBtn').addEventListener('click', () => {
    S.follow = true;
    if (S.myLoc) map.setView([S.myLoc.lat, S.myLoc.lng], Math.max(map.getZoom(), 15));
    else if (!S.sharing) navigator.geolocation && navigator.geolocation.getCurrentPosition(onPos, onPosErr, { enableHighAccuracy: true });
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && S.sharing && !S.wakeLock) {
      try { S.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    }
  });

  // ---------- reporting ----------
  function renderPinGrid() {
    $('#pinGrid').innerHTML = Object.entries(S.pinTypes).map(([k, v]) =>
      `<button class="pin-btn" data-pin="${k}"><span class="pi" style="background:${(PIN_STYLE[k] || PIN_STYLE.hazard).color}">${pinSvg(k)}</span>${esc(v.label)}</button>`).join('');
  }
  $('#reportBtn').addEventListener('click', () => {
    S.reportAt = null;
    $('#reportWhere').textContent = S.myLoc ? 'Pins drop where you are now. Long-press the map to report somewhere else.' : 'Turn on location sharing, or long-press the map where the hazard is.';
    openTab('report');
  });
  map.on('contextmenu', (e) => {
    if (!$('#builder').hidden) return;
    S.reportAt = { lat: e.latlng.lat, lng: e.latlng.lng };
    $('#reportWhere').textContent = 'Reporting at the spot you pressed.';
    openTab('report');
  });
  $('#pinGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pin]'); if (!b) return;
    const at = S.reportAt || S.myLoc;
    if (!at) { toast('No location yet. Turn on sharing or long-press the map.'); return; }
    socket.emit('pin:add', { type: b.dataset.pin, lat: at.lat, lng: at.lng, note: $('#pinNote').value }, (r) => {
      if (!r.ok) return toast(r.error);
      toast(`${S.pinTypes[b.dataset.pin].label} reported. Thanks!`);
      $('#pinNote').value = ''; S.reportAt = null; openTab('map');
    });
  });

  // ---------- routes ----------
  const build = { pts: [], line: null, distance: null, duration: null, seq: 0 };
  function startBuilder() {
    hideRoute(); openTab('map');
    build.pts = []; build.line = null; build.distance = build.duration = null;
    $('#bName').value = ''; $('#bNote').value = '';
    $('#builder').hidden = false; $('.fabs.right').hidden = true; $('.fabs.left').hidden = true;
    drawBuild();
  }
  function stopBuilder() {
    $('#builder').hidden = true; $('.fabs.right').hidden = false; $('.fabs.left').hidden = false;
    layers.build.clearLayers();
  }
  map.on('click', (e) => {
    if ($('#builder').hidden) return;
    build.pts.push([e.latlng.lat, e.latlng.lng]); updateBuildRoute();
  });
  $('#bUndo').addEventListener('click', () => { build.pts.pop(); updateBuildRoute(); });
  $('#bClear').addEventListener('click', () => { build.pts = []; updateBuildRoute(); });
  $('#bSnap').addEventListener('change', updateBuildRoute);
  $('#bCancel').addEventListener('click', stopBuilder);
  $('#newRouteBtn').addEventListener('click', startBuilder);

  async function updateBuildRoute() {
    const seq = ++build.seq;
    build.line = build.pts.slice(); build.distance = lineLength(build.pts); build.duration = null;
    drawBuild();
    if (build.pts.length < 2 || !$('#bSnap').checked) return;
    $('#bInfo').textContent = 'Finding roads…';
    try {
      // Public OSRM demo router — fine for testing; host your own or use a paid router in production.
      const coords = build.pts.map((p) => `${p[1].toFixed(6)},${p[0].toFixed(6)}`).join(';');
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const j = await res.json();
      if (seq !== build.seq) return;
      if (j.code !== 'Ok') throw new Error(j.code);
      const r = j.routes[0];
      build.line = r.geometry.coordinates.map((c) => [c[1], c[0]]);
      build.distance = r.distance; build.duration = r.duration;
    } catch {
      if (seq === build.seq) toast('Could not reach the road router — using straight lines.');
    }
    if (seq === build.seq) drawBuild();
  }
  function drawBuild() {
    layers.build.clearLayers();
    if (build.line && build.line.length > 1) L.polyline(build.line, { color: '#A8985C', weight: 6, opacity: 0.95, dashArray: '10 8' }).addTo(layers.build);
    build.pts.forEach((p, i) => L.marker(p, { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="wpt">${i + 1}</div>` }) }).addTo(layers.build));
    $('#bInfo').textContent = build.pts.length < 2 ? (build.pts.length ? 'Tap to add the next stop' : 'Tap the map to add stops')
      : `${build.pts.length} stops · ${miles(build.distance)}${build.duration ? ' · ' + hm(build.duration) : ''}`;
  }
  $('#bSend').addEventListener('click', () => {
    if (build.pts.length < 2) return toast('Add at least two stops.');
    socket.emit('route:send', { name: $('#bName').value || 'Route', note: $('#bNote').value, waypoints: build.pts, line: build.line,
      distance: build.distance, duration: build.duration }, (r) => {
      if (!r.ok) return toast(r.error);
      toast('Route sent to the crew'); stopBuilder(); showRoute(r.route.id, true);
    });
  });

  // GPX import -> send to crew
  $('#gpxInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const xml = new DOMParser().parseFromString(await f.text(), 'application/xml');
      const grab = (tag) => [...xml.getElementsByTagName(tag)].map((n) => [parseFloat(n.getAttribute('lat')), parseFloat(n.getAttribute('lon'))]).filter((p) => !isNaN(p[0]) && !isNaN(p[1]));
      let line = grab('trkpt'); if (line.length < 2) line = grab('rtept');
      let wpts = grab('wpt');
      if (line.length < 2 && wpts.length >= 2) line = wpts;
      if (line.length < 2) throw new Error('No track found');
      if (line.length > 20000) { const step = Math.ceil(line.length / 20000); line = line.filter((_, i) => i % step === 0); }
      if (wpts.length < 2) wpts = [line[0], line[line.length - 1]];
      const nameEl = xml.querySelector('metadata > name, trk > name, rte > name');
      const name = (nameEl && nameEl.textContent.trim()) || f.name.replace(/\.gpx$/i, '');
      socket.emit('route:send', { name, note: 'Imported from GPX', waypoints: wpts.slice(0, 50), line, distance: lineLength(line) }, (r) => {
        if (!r.ok) return toast(r.error);
        toast(`Sent "${name}" to the crew`); showRoute(r.route.id, true);
      });
    } catch (err) { toast('Could not read that GPX file.'); }
  });

  // Google Maps links take a start point, up to 8 via points and a destination (10 total).
  // With only the organizer's few stops, Google fills the gaps with its own fastest roads,
  // so we add via points spread along the actual road-following line to pin it to our route.
  const NAV_MAX = 10;
  function navStops(r) {
    const line = r.line && r.line.length >= 2 ? r.line : r.waypoints;
    const P = (p) => ({ lat: p[0], lng: p[1] });
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(P(line[i - 1]), P(line[i])));
    const total = cum[cum.length - 1] || 1;
    const nearestIdx = (p) => { let bi = 0, bd = Infinity; line.forEach((q, i) => { const d = dist(P(p), P(q)); if (d < bd) { bd = d; bi = i; } }); return bi; };
    // Organizer's own stops come first (they matter most), placed by where they sit along the line.
    let picks = (r.waypoints || []).map((p) => ({ p, at: cum[nearestIdx(p)], must: true }));
    if (picks.length > NAV_MAX) {
      const step = (picks.length - 1) / (NAV_MAX - 1);
      picks = Array.from({ length: NAV_MAX }, (_, i) => picks[Math.round(i * step)]);
    }
    picks.push({ p: line[0], at: 0, must: true }, { p: line[line.length - 1], at: total, must: true });
    // Fill the free slots with points spread evenly along the road line, skipping any too close to an existing pick.
    const free = NAV_MAX - new Set(picks.map((x) => Math.round(x.at / 50))).size; // start/end may already be stops
    const minGap = total / (NAV_MAX * 2);
    for (let j = 1; j <= free; j++) {
      const target = (total * j) / (free + 1);
      if (picks.some((x) => Math.abs(x.at - target) < minGap)) continue;
      let i = cum.findIndex((c) => c >= target); if (i < 0) i = line.length - 1;
      picks.push({ p: line[i], at: cum[i] });
    }
    picks.sort((a, b) => a.at - b.at);
    const out = [];
    for (const x of picks) if (!out.length || dist(P(out[out.length - 1]), P(x.p)) > 50) out.push(x.p);
    if (out.length <= NAV_MAX) return out;
    // Too many: always keep start and finish, thin out the middle evenly.
    const step = (out.length - 1) / (NAV_MAX - 1);
    return Array.from({ length: NAV_MAX }, (_, i) => out[Math.round(i * step)]);
  }
  // GPX track of the exact line, for apps that follow a route precisely (Garmin, Scenic, Calimoto, Kurviger…).
  function downloadGpx(r) {
    const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const pts = r.line.map((p) => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join('');
    const wpts = (r.waypoints || []).map((p, i) => `<wpt lat="${p[0]}" lon="${p[1]}"><name>Stop ${i + 1}</name></wpt>`).join('');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Crown Edge" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlEsc(r.name)}</name></metadata>${wpts}<trk><name>${xmlEsc(r.name)}</name><trkseg>${pts}</trkseg></trk></gpx>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
    a.download = (r.name || 'route').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.gpx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const ll = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  function googleUrl(r) {
    const pts = navStops(r); const dest = pts[pts.length - 1]; const mid = pts.slice(1, -1);
    // Leave origin blank so Google starts from the driver's current position, routing through the first stop.
    const way = [pts[0], ...mid].map(ll).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${ll(dest)}&waypoints=${encodeURIComponent(way)}&travelmode=driving`;
  }
  const appleUrl = (r) => { const p = navStops(r); return `https://maps.apple.com/?daddr=${ll(p[p.length - 1])}&dirflg=d`; };
  const wazeUrl = (r) => { const p = navStops(r); return `https://waze.com/ul?ll=${ll(p[0])}&navigate=yes`; };

  function renderRoutes() {
    const el = $('#routeList');
    if (!S.routes.length) { el.innerHTML = '<li class="empty">No routes yet. Tap <strong>New route</strong> to plot one on the map, or import a GPX file.</li>'; return; }
    el.innerHTML = S.routes.map((r) => `<li class="item">
      <div class="item-top"><div class="grow"><div class="item-title">${esc(r.name)}</div>
      <div class="item-sub">${[miles(r.distance || lineLength(r.line)), hm(r.duration)].filter(Boolean).join(' · ')} · from ${esc(r.byName)} · ${ago(r.created)}</div></div></div>
      ${r.note ? `<div>${esc(r.note)}</div>` : ''}
      <div class="row">
        <button class="btn small ${S.activeRoute === r.id ? 'primary' : ''}" data-show="${r.id}">${S.activeRoute === r.id ? 'Showing' : 'Show on map'}</button>
        <a class="btn small" href="${googleUrl(r)}" target="_blank" rel="noopener">Google Maps</a>
        <a class="btn small" href="${appleUrl(r)}" target="_blank" rel="noopener">Apple Maps</a>
        <a class="btn small" href="${wazeUrl(r)}" target="_blank" rel="noopener">Waze (to start)</a>
        <button class="btn small" data-gpx="${r.id}">Download GPX</button>
        ${r.by === S.me.id ? `<button class="btn small danger" data-delroute="${r.id}">Delete</button>` : ''}
      </div></li>`).join('');
  }
  $('#routeList').addEventListener('click', (e) => {
    const s = e.target.closest('[data-show]'); if (s) { S.activeRoute === s.dataset.show ? hideRoute() : showRoute(s.dataset.show, true); renderRoutes(); }
    const g = e.target.closest('[data-gpx]');
    if (g) { const r = S.routes.find((x) => x.id === g.dataset.gpx); if (r) { downloadGpx(r); toast('GPX downloaded — open it in Garmin, Scenic, Calimoto or Kurviger to follow the exact route'); } }
    const d = e.target.closest('[data-delroute]');
    if (d) {
      if (d.dataset.confirm !== '1') { d.dataset.confirm = '1'; d.textContent = 'Tap again to delete'; return; }
      socket.emit('route:delete', { id: d.dataset.delroute }, (r) => { if (!r.ok) toast(r.error); });
    }
  });
  function showRoute(rid, fit) {
    const r = S.routes.find((x) => x.id === rid); if (!r) return;
    layers.route.clearLayers(); S.activeRoute = rid;
    L.polyline(r.line, { color: '#000', weight: 9, opacity: 0.4 }).addTo(layers.route);
    const pl = L.polyline(r.line, { color: '#A8985C', weight: 6, opacity: 0.95 }).addTo(layers.route);
    const flag = (p, txt, bg) => L.marker(p, { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="wpt" style="background:${bg}">${txt}</div>` }) }).addTo(layers.route);
    flag(r.line[0], 'A', '#22c55e'); flag(r.line[r.line.length - 1], 'B', '#e8251a');
    if (fit) { S.follow = false; map.fitBounds(pl.getBounds(), { padding: [70, 70] }); }
    const bar = $('#routeBar');
    bar.innerHTML = `<strong>${esc(r.name)}</strong><a class="btn small primary" href="${googleUrl(r)}" target="_blank" rel="noopener">Navigate</a><button class="btn small ghost" id="hideRoute" aria-label="Hide route">✕</button>`;
    bar.hidden = false;
    $('#hideRoute').onclick = () => { hideRoute(); renderRoutes(); };
  }
  function hideRoute() { layers.route.clearLayers(); S.activeRoute = null; $('#routeBar').hidden = true; }

  // ---------- chat ----------
  const QUICK = ['On my way', 'Gas stop next exit', 'Pull over', 'Slow down', 'Regroup at next stop', 'All good 👍'];
  $('#quick').innerHTML = QUICK.map((q) => `<button class="btn small" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  $('#quick').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) sendChat(b.dataset.q); });

  const threadKeyFor = (target) => (target === 'group' ? 'group' : 'dm:' + [S.me.id, target].sort().join(':'));
  function renderThreads() {
    if (!S.me) return;
    const rows = [{ key: 'group', target: 'group', name: `Whole crew #${S.code}`, color: '#A8985C', online: true, isGroup: true }];
    for (const m of S.members.values()) if (m.id !== S.me.id) rows.push({ key: threadKeyFor(m.id), target: m.id, name: m.name, color: m.color, online: m.online });
    rows.forEach((r) => { const t = S.threads[r.key] || []; r.last = t[t.length - 1]; });
    rows.sort((a, b) => (b.isGroup - a.isGroup) || ((b.last ? b.last.t : 0) - (a.last ? a.last.t : 0)));
    $('#threads').innerHTML = rows.map((r) => `<li class="item thread" data-thread="${r.target}"><div class="item-top">
      <div class="avatar ${r.online && !r.isGroup ? 'online' : ''}" style="background:${r.color}">${r.isGroup ? '#' : esc(initials(r.name))}</div>
      <div class="grow"><div class="item-title">${esc(r.name)}${S.unread[r.key] ? `<span class="badge">${S.unread[r.key]}</span>` : ''}</div>
      <div class="item-sub">${r.last ? esc((r.last.from === S.me.id ? 'You: ' : (r.isGroup ? r.last.fromName + ': ' : '')) + r.last.text).slice(0, 70) : (r.isGroup ? 'Group chat' : 'Private chat')}</div></div>
      </div></li>`).join('') + (S.members.size < 2 ? '<li class="empty">Share the group code so others can join.</li>' : '');
  }
  $('#threads').addEventListener('click', (e) => { const t = e.target.closest('[data-thread]'); if (t) openConvo(t.dataset.thread); });
  function openConvo(target) {
    S.openThread = threadKeyFor(target); S.openTarget = target;
    const m = S.members.get(target);
    $('#convoTitle').textContent = target === 'group' ? `Crew #${S.code}` : (m ? m.name : 'Private');
    $('#threadList').hidden = true; $('#convo').hidden = false;
    delete S.unread[S.openThread]; store.set('unread', S.unread);
    renderMessages(); updateBadge();
  }
  $('#backThreads').addEventListener('click', () => { S.openThread = null; $('#convo').hidden = true; $('#threadList').hidden = false; renderThreads(); });
  function renderMessages() {
    const list = S.threads[S.openThread] || [];
    const el = $('#messages');
    el.innerHTML = list.length ? list.map((m) => `<div class="msg ${m.from === S.me.id ? 'mine' : ''}">
      <div class="who">${m.from === S.me.id ? 'You' : esc(m.fromName)}<span class="time">${clock(m.t)}</span></div>${esc(m.text)}</div>`).join('')
      : '<div class="empty">No messages yet.</div>';
    el.scrollTop = el.scrollHeight;
  }
  function sendChat(text) {
    text = (text || '').trim(); if (!text || !S.openTarget) return;
    socket.emit('chat', { to: S.openTarget, text }, (r) => { if (!r.ok) toast(r.error); });
  }
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendChat($('#chatInput').value); $('#chatInput').value = ''; });
  function updateBadge() {
    const n = Object.values(S.unread).reduce((a, b) => a + b, 0);
    $('#chatBadge').hidden = !n; $('#chatBadge').textContent = n;
  }

  // ---------- crew ----------
  function renderCrew() {
    if (!S.me) return;
    const all = [...S.members.values()].sort((a, b) => (b.id === S.me.id) - (a.id === S.me.id) || b.online - a.online || a.name.localeCompare(b.name));
    $('#crewList').innerHTML = all.map((m) => {
      const isMe = m.id === S.me.id;
      const sp = m.loc ? mph(m.loc.speed) : null;
      const d = !isMe && S.myLoc && m.loc ? miles(dist(S.myLoc, m.loc)) + ' away' : '';
      const status = isMe ? (S.sharing ? 'Sharing your location' : 'Not sharing location')
        : !m.online ? `Offline · last seen ${ago(m.lastSeen)}` : m.sharing && m.loc ? [sp != null ? sp + ' mph' : '', d].filter(Boolean).join(' · ') || 'Sharing' : 'Online · not sharing';
      return `<li class="item"><div class="item-top">
        <div class="avatar ${m.online ? 'online' : ''}" style="background:${m.color}">${esc(initials(m.name))}</div>
        <div class="grow"><div class="item-title">${esc(m.name)}${isMe ? ' (you)' : ''}</div>
        <div class="item-sub">${m.vehicle ? esc(m.vehicle) + ' · ' : ''}${esc(status)}</div></div>
        ${isMe ? '' : `<div class="row">${m.loc && m.sharing ? `<button class="btn small" data-locate="${m.id}">Locate</button>` : ''}<button class="btn small" data-dm="${m.id}">Message</button></div>`}
      </div></li>`;
    }).join('');
  }
  $('#crewList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-locate]'); if (!b) return;
    const m = S.members.get(b.dataset.locate); if (!m || !m.loc) return;
    S.follow = false; openTab('map'); map.setView([m.loc.lat, m.loc.lng], 15); openDriverPopup(m.id);
  });

  // ---------- tabs ----------
  function openTab(t) {
    S.tab = t;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t || (t === 'report' && b.dataset.tab === 'map')));
    const sheet = $('#sheet');
    $$('.panel').forEach((p) => { p.hidden = p.id !== 'panel-' + t; });
    sheet.hidden = t === 'map';
    if (t === 'chat') { if (S.openThread) { delete S.unread[S.openThread]; store.set('unread', S.unread); renderMessages(); } renderThreads(); updateBadge(); }
    if (t === 'crew') renderCrew();
    if (t === 'routes') renderRoutes();
  }
  $$('.tab').forEach((b) => b.addEventListener('click', () => openTab(S.tab === b.dataset.tab && b.dataset.tab !== 'map' ? 'map' : b.dataset.tab)));
  map.on('click', () => { if ($('#builder').hidden && S.tab !== 'map') openTab('map'); });

  // Refresh "x min ago" labels and clear expired pins locally.
  setInterval(() => {
    for (const p of [...S.pins.values()]) if (p.expires < Date.now()) removePin(p.id);
    if (S.tab === 'crew') renderCrew();
  }, 30000);

  // Auto-join if we have a saved profile and code.
  if (saved && saved.name && saved.code && saved.memberId && (!hashCode || hashCode === saved.code)) { S.code = saved.code; socket.connect(); }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
