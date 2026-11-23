// Crown Edge server: groups, live location, hazard pins, routes, group + private chat.
// Express serves the mobile web app; Socket.io carries everything live.
// Data is kept in memory and saved to data/db.json so pins, routes and chat survive restarts.

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// How long each kind of pin stays on the map unless drivers confirm it (minutes).
const PIN_TYPES = {
  police:       { label: 'Police',           ttl: 60 },
  debris:       { label: 'Debris on road',   ttl: 120 },
  accident:     { label: 'Accident',         ttl: 90 },
  hazard:       { label: 'Hazard',           ttl: 120 },
  construction: { label: 'Construction',     ttl: 60 * 24 },
  stopped:      { label: 'Stopped vehicle',  ttl: 45 },
  weather:      { label: 'Bad weather',      ttl: 120 },
};
const GONE_VOTES_TO_REMOVE = 2;   // "Not there" votes that clear a pin
const CONFIRM_EXTENDS_MIN = 30;   // "Still there" pushes expiry out by this much
const MAX_MESSAGES_PER_THREAD = 500;
const STALE_LOCATION_MS = 10 * 60 * 1000;

// ---------- storage ----------
let db = { groups: {} };
try {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (e) {
  console.error('Could not read db.json, starting empty:', e.message);
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB_FILE);
    } catch (e) { console.error('Save failed:', e.message); }
  }, 500);
}

const id = () => crypto.randomBytes(8).toString('hex');
const now = () => Date.now();
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const validLatLng = (lat, lng) => isNum(lat) && isNum(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const normCode = (c) => clean(c, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '');

function group(code) {
  if (!db.groups[code]) {
    db.groups[code] = { code, created: now(), members: {}, pins: [], routes: [], messages: { group: [] } };
  }
  const g = db.groups[code];
  g.messages = g.messages || { group: [] };
  return g;
}
// Private threads are keyed by the two member ids sorted, so both sides share one thread.
const dmKey = (a, b) => 'dm:' + [a, b].sort().join(':');

function pruneExpiredPins(g) {
  const before = g.pins.length;
  g.pins = g.pins.filter((p) => p.expires > now());
  return before !== g.pins.length;
}

function publicMember(m) {
  return { id: m.id, name: m.name, vehicle: m.vehicle, color: m.color, online: !!m.online,
           sharing: !!m.sharing, loc: m.sharing ? m.loc : null, lastSeen: m.lastSeen };
}

function snapshotFor(g, memberId) {
  pruneExpiredPins(g);
  const threads = {};
  for (const [k, msgs] of Object.entries(g.messages)) {
    if (k === 'group' || k.split(':').includes(memberId)) threads[k] = msgs.slice(-100);
  }
  return {
    code: g.code,
    members: Object.values(g.members).map(publicMember),
    pins: g.pins,
    routes: g.routes,
    threads,
    pinTypes: PIN_TYPES,
  };
}

// ---------- server ----------
const app = express();
// no-cache: browsers re-check with the server on every load (cheap 304s), so updates show up immediately.
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist'), { maxAge: '7d' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 }); // room for GPX-sized routes

const COLORS = ['#e8251a', '#1f7ae0', '#14a37f', '#f29d0c', '#8e44ad', '#d6336c', '#0b7285', '#5c940d'];

io.on('connection', (socket) => {
  let g = null;
  let me = null;

  const fail = (ack, msg) => { if (typeof ack === 'function') ack({ ok: false, error: msg }); };
  const ok = (ack, data) => { if (typeof ack === 'function') ack({ ok: true, ...data }); };
  const room = () => 'g:' + g.code;

  // join { code, name, vehicle, memberId? } -> snapshot
  socket.on('join', (p = {}, ack) => {
    const code = normCode(p.code);
    const name = clean(p.name, 32);
    if (!code || code.length < 3) return fail(ack, 'Group code must be at least 3 letters or numbers.');
    if (!name) return fail(ack, 'Enter your name.');
    g = group(code);
    let mid = clean(p.memberId, 32);
    // Reuse the saved member id so a driver keeps their chats after reconnecting,
    // but only with the secret token that was issued to that device (ids are public).
    const prior = mid && g.members[mid];
    const tokenOk = prior && typeof p.token === 'string' && prior.token &&
      p.token.length === prior.token.length && crypto.timingSafeEqual(Buffer.from(p.token), Buffer.from(prior.token));
    if (!tokenOk) mid = id();
    const existing = tokenOk ? prior : null;
    me = existing || { id: mid, token: crypto.randomBytes(18).toString('hex'), color: COLORS[Object.keys(g.members).length % COLORS.length], sharing: false, loc: null };
    me.name = name;
    me.vehicle = clean(p.vehicle, 40);
    me.online = true;
    me.lastSeen = now();
    g.members[mid] = me;
    socket.join(room());
    socket.join('m:' + mid);
    save();
    ok(ack, { me: publicMember(me), token: me.token, state: snapshotFor(g, mid) });
    socket.to(room()).emit('member', publicMember(me));
  });

  const need = (ack) => { if (!g || !me) { fail(ack, 'Join a group first.'); return false; } return true; };

  // location { lat, lng, heading, speed, accuracy }
  socket.on('location', (p = {}) => {
    if (!g || !me || !me.sharing) return;
    if (!validLatLng(p.lat, p.lng)) return;
    me.loc = {
      lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6),
      heading: isNum(p.heading) ? Math.round(p.heading) : null,
      speed: isNum(p.speed) ? Math.max(0, +p.speed.toFixed(1)) : null, // m/s
      accuracy: isNum(p.accuracy) ? Math.round(p.accuracy) : null,
      t: now(),
    };
    me.lastSeen = now();
    socket.to(room()).emit('location', { id: me.id, loc: me.loc });
    save();
  });

  socket.on('sharing', (p = {}, ack) => {
    if (!need(ack)) return;
    me.sharing = !!p.on;
    if (!me.sharing) me.loc = null;
    save();
    io.to(room()).emit('member', publicMember(me));
    ok(ack);
  });

  // pin:add { type, lat, lng, note }
  socket.on('pin:add', (p = {}, ack) => {
    if (!need(ack)) return;
    const type = PIN_TYPES[p.type] ? p.type : null;
    if (!type) return fail(ack, 'Unknown pin type.');
    if (!validLatLng(p.lat, p.lng)) return fail(ack, 'Bad location.');
    const pin = {
      id: id(), type, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6),
      note: clean(p.note, 140), by: me.id, byName: me.name, created: now(),
      expires: now() + PIN_TYPES[type].ttl * 60000, confirms: [me.id], gone: [],
    };
    g.pins.push(pin);
    save();
    io.to(room()).emit('pin', pin);
    ok(ack, { pin });
  });

  // pin:vote { id, still: true|false }
  socket.on('pin:vote', (p = {}, ack) => {
    if (!need(ack)) return;
    const pin = g.pins.find((x) => x.id === p.id);
    if (!pin) return fail(ack, 'That pin is gone.');
    pin.confirms = pin.confirms.filter((x) => x !== me.id);
    pin.gone = pin.gone.filter((x) => x !== me.id);
    if (p.still) {
      pin.confirms.push(me.id);
      pin.expires = Math.max(pin.expires, now() + CONFIRM_EXTENDS_MIN * 60000);
    } else {
      pin.gone.push(me.id);
    }
    const remove = pin.gone.length >= GONE_VOTES_TO_REMOVE || (pin.by === me.id && !p.still);
    if (remove) {
      g.pins = g.pins.filter((x) => x.id !== pin.id);
      io.to(room()).emit('pin:removed', { id: pin.id });
    } else {
      io.to(room()).emit('pin', pin);
    }
    save();
    ok(ack);
  });

  // route:send { name, note, waypoints:[[lat,lng]], line:[[lat,lng]], distance, duration }
  socket.on('route:send', (p = {}, ack) => {
    if (!need(ack)) return;
    const name = clean(p.name, 60) || 'Route';
    const toPts = (arr, max) => (Array.isArray(arr) ? arr : [])
      .filter((x) => Array.isArray(x) && validLatLng(x[0], x[1]))
      .slice(0, max).map((x) => [+x[0].toFixed(6), +x[1].toFixed(6)]);
    const waypoints = toPts(p.waypoints, 50);
    const line = toPts(p.line, 20000);
    if (waypoints.length < 2 && line.length < 2) return fail(ack, 'A route needs at least two points.');
    const route = {
      id: id(), name, note: clean(p.note, 280), waypoints, line: line.length ? line : waypoints,
      distance: isNum(p.distance) ? Math.round(p.distance) : null,
      duration: isNum(p.duration) ? Math.round(p.duration) : null,
      by: me.id, byName: me.name, created: now(),
    };
    g.routes.unshift(route);
    g.routes = g.routes.slice(0, 50);
    save();
    io.to(room()).emit('route', route);
    ok(ack, { route });
  });

  socket.on('route:delete', (p = {}, ack) => {
    if (!need(ack)) return;
    const r = g.routes.find((x) => x.id === p.id);
    if (!r) return fail(ack, 'Route not found.');
    if (r.by !== me.id) return fail(ack, 'Only the person who sent a route can delete it.');
    g.routes = g.routes.filter((x) => x.id !== p.id);
    save();
    io.to(room()).emit('route:removed', { id: p.id });
    ok(ack);
  });

  // chat { to: 'group' | memberId, text }
  socket.on('chat', (p = {}, ack) => {
    if (!need(ack)) return;
    const text = clean(p.text, 1000);
    if (!text) return fail(ack, 'Empty message.');
    let thread = 'group';
    if (p.to && p.to !== 'group') {
      if (!g.members[p.to]) return fail(ack, 'That driver is not in this group.');
      if (p.to === me.id) return fail(ack, 'You cannot message yourself.');
      thread = dmKey(me.id, p.to);
    }
    const msg = { id: id(), thread, from: me.id, fromName: me.name, text, t: now() };
    const list = (g.messages[thread] = g.messages[thread] || []);
    list.push(msg);
    if (list.length > MAX_MESSAGES_PER_THREAD) list.splice(0, list.length - MAX_MESSAGES_PER_THREAD);
    save();
    if (thread === 'group') io.to(room()).emit('chat', msg);
    else { io.to('m:' + me.id).emit('chat', msg); io.to('m:' + p.to).emit('chat', msg); }
    ok(ack, { msg });
  });

  socket.on('disconnect', () => {
    if (!g || !me) return;
    // Only mark offline if no other tab/device of this member is still connected.
    const still = io.sockets.adapter.rooms.get('m:' + me.id);
    if (still && still.size) return;
    me.online = false;
    me.lastSeen = now();
    save();
    io.to(room()).emit('member', publicMember(me));
  });
});

// Sweep expired pins and stale locations every minute.
setInterval(() => {
  for (const g of Object.values(db.groups)) {
    const removed = g.pins.filter((p) => p.expires <= now());
    if (removed.length) {
      pruneExpiredPins(g);
      removed.forEach((p) => io.to('g:' + g.code).emit('pin:removed', { id: p.id }));
      save();
    }
    for (const m of Object.values(g.members)) {
      if (m.loc && now() - m.loc.t > STALE_LOCATION_MS && !m.online) {
        m.loc = null;
        io.to('g:' + g.code).emit('member', publicMember(m));
      }
    }
  }
}, 60000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Crown Edge running on http://localhost:${PORT}`));
}
module.exports = { server, PIN_TYPES };
