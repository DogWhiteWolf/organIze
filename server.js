import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = resolve('public');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const oauthStates = new Set();
let accessToken = '';
let refreshToken = '';
let tokenExpiresAt = 0;

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function configError() {
  return !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI;
}
async function bodyJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}
async function googleToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  if (!refreshToken) throw new Error('Google Calendar authorization has expired. Reconnect your account.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google token refresh failed.');
  accessToken = data.access_token; tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return accessToken;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/api/auth/google' && req.method === 'GET') {
    if (configError()) return json(res, 503, { error: 'Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.' });
    const state = randomBytes(24).toString('hex'); oauthStates.add(state);
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email', access_type: 'offline', prompt: 'consent', state }).toString();
    return json(res, 200, { url: auth.toString() });
  }
  if (pathname === '/oauth2/callback' && req.method === 'GET') {
    const state = url.searchParams.get('state'); const code = url.searchParams.get('code');
    if (!state || !oauthStates.delete(state) || !code) { res.writeHead(302, { Location: '/?google_error=Invalid%20Google%20authorization%20response' }); return res.end(); }
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || data.error || 'Google authorization failed.');
      accessToken = data.access_token; refreshToken = data.refresh_token || refreshToken; tokenExpiresAt = Date.now() + data.expires_in * 1000;
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
      const profile = await profileResponse.json();
      res.writeHead(302, { Location: `/?google=connected&email=${encodeURIComponent(profile.email || '')}` }); res.end();
    } catch (error) {
      res.writeHead(302, { Location: `/?google_error=${encodeURIComponent(error.message)}` }); res.end();
    }
    return;
  }
  if (pathname === '/api/calendar/events' && ['POST', 'PATCH'].includes(req.method)) {
    let event;
    try { event = await bodyJson(req); } catch { return json(res, 400, { error: 'Invalid event request.' }); }
    if (!event.title || !event.start || !event.end || !event.timezone || (req.method === 'PATCH' && !event.eventId)) return json(res, 400, { error: 'Task title, work time, and timezone are required.' });
    try {
      const token = await googleToken();
      const resource = {
        summary: `Work on: ${event.title}`,
        description: `Daywell task${event.due ? `\nDue: ${event.due}` : ''}`,
        start: { dateTime: `${event.start}:00`, timeZone: event.timezone },
        end: { dateTime: `${event.end.slice(0, 16)}:00`, timeZone: event.timezone },
        extendedProperties: { private: { daywellTaskId: String(event.id || '') } },
      };
      const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events${req.method === 'PATCH' ? `/${encodeURIComponent(event.eventId)}` : ''}`;
      const response = await fetch(eventUrl, { method: req.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(resource) });
      const data = await response.json();
      if (!response.ok) return json(res, response.status, { error: data.error?.message || 'Google Calendar rejected the event.' });
      return json(res, req.method === 'PATCH' ? 200 : 201, { eventId: data.id });
    } catch (error) { return json(res, 502, { error: error.message || 'Calendar sync failed.' }); }
  }
  const requested = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  const file = requested.startsWith(root) && existsSync(requested) ? requested : resolve(root, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unable to load the app.');
  }
}).listen(port, () => console.log(`Life Organizer running at http://localhost:${port}`));
