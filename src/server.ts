import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

type Role = 'host' | 'player';
type Participant = { socketId: string; nickname: string; role: Role };
type ChatMsg = { id: string; from: string; role: Role | 'system'; text: string; ts: number };
type RoomMeta = {
  id: string;
  title: string;
  maxMembers: number;
  createdAt: number;
  studyStart?: string; // 'HH:MM'
  studyEnd?: string;   // 'HH:MM'
  noteRequired?: boolean;
  isPrivate?: boolean;
};

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.redirect('/rooms.html'));
app.use(express.static(path.join(process.cwd(), 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map<string, { host?: Participant; players: Map<string, Participant>; chat: ChatMsg[]; meta?: RoomMeta }>();

function ensureRoom(roomId: string) {
  if (!rooms.has(roomId)) rooms.set(roomId, { players: new Map(), chat: [] });
  return rooms.get(roomId)!;
}

io.on('connection', socket => {
  socket.on('join', ({ roomId, nickname, role }: { roomId: string; nickname: string; role: Role }) => {
    roomId = String(roomId || '').trim();
    nickname = String(nickname || '').trim();
    role = role === 'host' ? 'host' : 'player';

    if (!roomId || !nickname) {
      socket.emit('error_msg', { message: 'roomId와 nickname은 필수입니다.' });
      return;
    }

    const room = ensureRoom(roomId);

    if (role === 'host' && room.host && room.host.socketId !== socket.id) {
      socket.emit('error_msg', { message: '이미 사회자가 있습니다.' });
      return;
    }
    const capacity = room.meta?.maxMembers ?? 6;
    if (role === 'player' && room.players.size >= capacity) {
      socket.emit('error_msg', { message: '참가자 정원이 가득 찼습니다.(최대 6명)' });
      return;
    }

    socket.join(roomId);
    (socket.data as any).roomId = roomId;
    (socket.data as any).nickname = nickname;
    (socket.data as any).role = role;

    const me: Participant = { socketId: socket.id, nickname, role };
    if (role === 'host') {
      rooms.get(roomId)!.host = me;
    } else {
      rooms.get(roomId)!.players.set(socket.id, me);
    }

    broadcastParticipants(roomId);

    pushChat(roomId, { id: rid(), from: 'system', role: 'system', text: `${nickname} 님이 입장했습니다.`, ts: Date.now() });

    socket.emit('chat_history', { items: rooms.get(roomId)!.chat.slice(-50) });
    socket.emit('joined', { ok: true, roomId, nickname, role });
  });

  socket.on('chat_send', ({ roomId, text }: { roomId: string; text: string }) => {
    roomId = roomId || (socket.data as any)?.roomId;
    const nickname = (socket.data as any)?.nickname;
    const role: Role = (socket.data as any)?.role || 'player';
    if (!roomId || !nickname || !text?.trim()) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const msg: ChatMsg = { id: rid(), from: nickname, role, text: String(text).slice(0, 2000), ts: Date.now() };
    pushChat(roomId, msg);
  });

  socket.on('typing', ({ roomId, typing }: { roomId: string; typing: boolean }) => {
    roomId = roomId || (socket.data as any)?.roomId;
    const nickname = (socket.data as any)?.nickname;
    if (!roomId || !nickname) return;
    socket.to(roomId).emit('typing_state', { nickname, typing: !!typing });
  });

  socket.on('leave', () => {
    const roomId: string | undefined = (socket.data as any)?.roomId;
    const nickname: string | undefined = (socket.data as any)?.nickname;
    const role: Role | undefined = (socket.data as any)?.role;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    socket.leave(roomId);
    (socket.data as any).roomId = undefined;

    if (role === 'host' && room.host?.socketId === socket.id) (room as any).host = undefined;
    if (role === 'player') room.players.delete(socket.id);

    broadcastParticipants(roomId);
    if (nickname) pushChat(roomId, { id: rid(), from: 'system', role: 'system', text: `${nickname} 님이 퇴장했습니다.`, ts: Date.now() });
    if (!room.host && room.players.size === 0) rooms.delete(roomId);

    socket.emit('left', { ok: true });
  });

  socket.on('disconnect', () => {
    const roomId: string | undefined = (socket.data as any)?.roomId;
    const nickname: string | undefined = (socket.data as any)?.nickname;
    const role: Role | undefined = (socket.data as any)?.role;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    if (role === 'host' && room.host?.socketId === socket.id) (room as any).host = undefined;
    if (role === 'player') room.players.delete(socket.id);

    broadcastParticipants(roomId);

    if (nickname) pushChat(roomId, { id: rid(), from: 'system', role: 'system', text: `${nickname} 님이 퇴장했습니다.`, ts: Date.now() });

    if (!room.host && room.players.size === 0) rooms.delete(roomId);
  });
});

function broadcastParticipants(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  const participants: Participant[] = [
    ...(room.host ? [room.host] : []),
    ...Array.from(room.players.values())
  ];
  io.to(roomId).emit('participants', { participants });
}

function pushChat(roomId: string, msg: ChatMsg) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.chat.push(msg);
  if (room.chat.length > 500) room.chat = room.chat.slice(-500);
  io.to(roomId).emit('chat', msg);
}

function rid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const port = Number(process.env.PORT || 4000);
server.listen(port, () => {
  console.log(`chat server listening on :${port}`);
});

// REST: Rooms API
app.get('/api/rooms', (_req, res) => {
  const items = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    title: room.meta?.title || id,
    maxMembers: room.meta?.maxMembers ?? 6,
    hostPresent: !!room.host,
    players: room.players.size,
    createdAt: room.meta?.createdAt || 0,
    studyStart: room.meta?.studyStart,
    studyEnd: room.meta?.studyEnd,
    noteRequired: !!room.meta?.noteRequired,
    isPrivate: !!room.meta?.isPrivate
  }));
  res.json({ items });
});

app.post('/api/rooms', (req, res) => {
  let { title, maxMembers, studyStart, studyEnd, noteRequired, isPrivate } = req.body || {};
  title = String(title || '').trim() || '새 공부방';
  maxMembers = Number(maxMembers || 6);
  if (!Number.isFinite(maxMembers)) maxMembers = 6;
  maxMembers = Math.min(12, Math.max(2, Math.floor(maxMembers)));
  const timeRe = /^\d{2}:\d{2}$/;
  studyStart = String(studyStart || '').trim();
  studyEnd = String(studyEnd || '').trim();
  if (!timeRe.test(studyStart)) studyStart = undefined as any;
  if (!timeRe.test(studyEnd)) studyEnd = undefined as any;
  noteRequired = !!noteRequired;
  isPrivate = !!isPrivate;

  const base = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').slice(0, 24) || 'room';
  let id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  while (rooms.has(id)) id = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const room = ensureRoom(id);
  room.meta = { id, title, maxMembers, createdAt: Date.now(), studyStart, studyEnd, noteRequired, isPrivate };

  res.status(201).json(room.meta);
});

// Mock LLM chat API (향후 실제 LLM 연동 예정)
app.post('/api/llm/chat', express.json(), async (req, res) => {
  const { message, messages } = req.body || {};
  const text = message != null ? String(message || '').trim() : '';
  const list = Array.isArray(messages) ? messages : undefined;
  if (!text && !list) return res.status(400).json({ error: 'message or messages is required' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: 'missing_openai_api_key',
      message: 'OPENAI_API_KEY를 .env 파일에 설정하세요.'
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a concise study assistant. Answer in Korean by default.' },
          ...(list ? list : [{ role: 'user', content: text }])
        ],
        temperature: 0.5,
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: 'llm_request_failed', detail: errText.slice(0, 500) });
    }

    const data: any = await response.json();
    const reply: string = data?.choices?.[0]?.message?.content || '';
    if (!reply) return res.status(500).json({ error: 'empty_response' });
    res.json({ reply });
  } catch (e: any) {
    res.status(500).json({ error: 'llm_exception', detail: String(e?.message || e).slice(0, 200) });
  }
});


