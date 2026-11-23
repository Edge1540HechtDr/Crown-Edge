# Crown Edge — built for the drive!

Group driving app (working prototype)

A URR-style app for driving clubs and convoys. Everyone opens the app on their phone, enters the same **group code**, and gets:

| Feature | How it works |
|---|---|
| **Send routes** | Tap *Routes → New route*, tap stops on the map (it follows real roads), name it, add a note, *Send to crew*. Everyone gets a beep + the route drawn on their map. Or *Import GPX* from another planner. Each route has one-tap **Navigate** buttons that hand off to Google Maps (with stops), Apple Maps or Waze. |
| **Share location** | Tap *Share location*. Your crew sees you as an arrow with your name and speed (mph). The screen stays awake while sharing. *Crew* tab shows who's online, how far away, and a *Locate* button. |
| **Police / debris pins** | Big red *Report* button drops a pin where you are: Police, Debris, Accident, Hazard, Construction, Stopped vehicle, Bad weather. Long-press the map to drop it somewhere else. Drivers heading toward a pin (within ~0.75 mi, roughly ahead) get a red banner, beep and vibration. Others tap *Still there* (extends it) or *Not there* (2 votes clears it). Pins expire on their own (police 1 h, debris 2 h, construction 24 h). |
| **Group + private chat** | *Chat* tab: one thread for the whole crew, plus a private thread with each driver. Quick-reply buttons ("Gas stop next exit", "Pull over", "Slow down"…) so a passenger can reply with one tap. Unread badges and pop-up notices. |

**Look:** colors and fonts follow The Edge Construction Co. brand guide (navy dark scale, Edge Gold accents, Edge Blue map markers, Barlow / Barlow Condensed), with the Crown Rally crown as the logo and app icon. The wordmark mirrors the Crown Rally patch: "CROWN" in Audiowide (white) and "EDGE" in Permanent Marker (gold-orange, slanted). All fonts are bundled in public/fonts, so nothing loads from Google. Hazard reports stay red so they read as alerts.

Install to the home screen: open the site in Safari/Chrome → Share → *Add to Home Screen*. It launches full-screen like an app.

## Run it on your computer (5 minutes)

1. Install Node.js 18 or newer from nodejs.org.
2. In this folder run:
   ```
   npm install
   npm start
   ```
3. Open http://localhost:3000. Use a second browser window (or an incognito window) as a second driver.

Phones need **HTTPS** for GPS, so to test with real phones, deploy it (next section).

## Put it online (so phones can use it)

Any Node host works. Easiest options:

- **Render.com** — New → Web Service → connect a GitHub repo with this folder. Build command `npm install`, start command `npm start`. Add a persistent disk mounted at `/data` and set env var `DATA_DIR=/data` so pins/routes/chat survive restarts (paid tier; the free tier wipes data on redeploy).
- **Railway / Fly.io** — use the included `Dockerfile`; mount a volume at `/data`.

You get an `https://…` address. Share it as `https://your-app/#SUNDAY-RUN` and the group code is filled in for people.

## Run the tests

```
npm test
```
Simulates several drivers and checks 25 behaviours: joining, location privacy between groups, pins and voting, route send/delete permissions, group vs private chat, reconnecting, no impersonation, and saving to disk.

## What's prototype-grade (and what to change for a real launch)

- **No passwords.** A driver is identified by a secret token saved on their phone. Anyone with the group code can join, so treat codes like a gate code. For launch: add sign-in (phone number or Apple/Google), group owners, kick/ban.
- **Location only updates while the app is open.** Browsers stop GPS when the screen locks. Background tracking, CarPlay/Android Auto, and push notifications when the app is closed need native apps (React Native/Expo is the usual path; this server and its events can be reused as-is).
- **Map and routing services are free public ones:** CARTO dark map tiles and the OSRM demo router. Fine for testing with your crew; for public use switch to a paid plan (Mapbox, MapTiler, Google, or a self-hosted OSRM).
- **Storage is one JSON file.** Good for dozens of groups. Move to Postgres + Redis before scaling to thousands of users.
- **Driver safety.** Add a "passenger mode" prompt / lock typing above a speed, and check local laws on police-location reporting (legal in the US, restricted in some countries).

## Files

```
server.js          Express + Socket.io server (groups, location, pins, routes, chat, saves to data/db.json)
public/index.html  App screens
public/app.js      Map, GPS, alerts, route builder, GPX import, chat
public/styles.css  Night-dashboard styling, phone-first
public/sw.js       Lets it install to the home screen
public/crown.png   Crown logo (sign-in screen); icon-*.png / apple-touch-icon.png are the app icons
test/e2e.js        Automated multi-driver test
Dockerfile         For Railway / Fly.io / any Docker host
```
