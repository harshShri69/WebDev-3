// Real-time demo client.  Usage: node scripts/socket-demo.js <email> <password> [baseUrl]
// Logs in, opens an authenticated Socket.IO connection and prints every event it receives.
const { io } = require('socket.io-client');

const [email, password, baseUrl = 'http://localhost:5000'] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/socket-demo.js <email> <password> [baseUrl]');
  process.exit(1);
}

(async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.message);

  const socket = io(baseUrl, { auth: { token: body.data.accessToken } });
  socket.on('connected', (info) => console.log(`Connected as ${body.data.user.name} (${info.role}). Rooms:`, info.rooms));
  socket.on('announcement:new', (a) => console.log('[announcement:new]', `${a.scope}: ${a.title} - ${a.body}`));
  socket.on('attendance:updated', (u) => console.log('[attendance:updated]', u));
  socket.on('connect_error', (e) => console.error('Connection rejected:', e.message));
  console.log('Waiting for events... (Ctrl+C to quit)');
})().catch((e) => { console.error(e.message); process.exit(1); });
