import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push,
  onChildAdded, onValue, onChildRemoved, get, remove
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Firebase init
const firebaseConfig = { /* ... your config ... */ };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM
const E = id => document.getElementById(id);
const lobby = E('lobby'), roomDiv = E('room');
const nickInput = E('nickname'), roomInput = E('roomIdInput');
const btnCreate = E('btnCreate'), btnJoin = E('btnJoin');
const roomDisp = E('roomIdDisplay');
const playbackRate = E('playbackRate');
const chat = E('chat'), chatInput = E('chatInput'), btnSend = E('btnSend');
const membersDiv = E('members');
const clientId = Math.random().toString(36).substr(2, 8);

let nickname, roomId, isOwner = false;

// Create room
btnCreate.onclick = async () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Nhập nickname');
  roomId = Math.random().toString(36).substr(2, 8);
  history.replaceState(null, null, '?room=' + roomId);
  isOwner = true;
  await remove(ref(db, `rooms/${roomId}`));
  await set(ref(db, `rooms/${roomId}/owner`), nickname);
  enterRoom();
};

// Join room
btnJoin.onclick = async () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname || !id) return alert('Nhập nickname & mã phòng');
  roomId = id;
  history.replaceState(null, null, '?room=' + roomId);
  const snap = await get(ref(db, `rooms/${roomId}/owner`));
  if (!snap.exists()) return alert('Phòng không tồn tại');
  isOwner = (snap.val() === nickname);
  enterRoom();
};

// Hiển thị UI khi đã join/create
function enterRoom() {
  lobby.classList.add('d-none');
  roomDiv.classList.remove('d-none');
  roomDisp.textContent = roomId;

  // Nếu chủ phòng, bật controls và playbackRate
  if (isOwner) {
    playbackRate.classList.remove('d-none');
    playbackRate.onchange = () => window.sharedVideo.setPlaybackRate(parseFloat(playbackRate.value));
  }

  setupChat();
  setupVideoSync();
  setupMembers();
}

// Chat
function setupChat() {
  const chatRef = ref(db, `rooms/${roomId}/chat`);
  onChildAdded(chatRef, snap => {
    const { user, text } = snap.val();
    const p = document.createElement('p');
    p.innerHTML = `<strong>${user}:</strong> ${text}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });
  btnSend.onclick = () => {
    const txt = chatInput.value.trim();
    if (!txt) return;
    push(chatRef, { user: nickname, text: txt });
    chatInput.value = '';
  };
}

// Video sync
function setupVideoSync() {
  const evtRef = ref(db, `rooms/${roomId}/video/events`);
  const player = window.sharedVideo;

  onChildAdded(evtRef, snap => {
    const { type, user, time } = snap.val();
    if (user === nickname) return;
    player.setCurrentTime(time);
    if (type === 'play') player.play();
    if (type === 'pause') player.pause();
  });

  if (isOwner) {
    player.on('play',    () => push(evtRef, { type: 'play',  user: nickname, time: player.getCurrentTime() }));
    player.on('pause',   () => push(evtRef, { type: 'pause', user: nickname, time: player.getCurrentTime() }));
    player.on('seeked',  () => push(evtRef, { type: 'seek',  user: nickname, time: player.getCurrentTime() }));
  }
}

// Members
async function setupMembers() {
  const memRef = ref(db, `rooms/${roomId}/members`);
  const exist = (await get(memRef)).val() || {};
  if (Object.values(exist).some(m => m.user === nickname)) {
    alert('Nickname đã tồn tại'); return location.reload();
  }
  await set(ref(db, `rooms/${roomId}/members/${clientId}`), { user: nickname });

  onChildRemoved(memRef, snap => {
    if (snap.key === clientId) {
      alert('Bạn bị kick khỏi phòng');
      location.reload();
    }
  });

  onValue(memRef, snap => {
    membersDiv.innerHTML = '';
    const data = snap.val() || {};
    for (let [id, obj] of Object.entries(data)) {
      const d = document.createElement('div');
      d.className = 'list-group-item d-flex justify-content-between align-items-center';
      d.textContent = obj.user + (id === clientId ? ' (Bạn)' : '');
      if (isOwner && id !== clientId) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-danger';
        btn.textContent = 'Kick';
        btn.onclick = () => remove(ref(db, `rooms/${roomId}/members/${id}`));
        d.appendChild(btn);
      }
      membersDiv.appendChild(d);
    }
  });
}

// Autofill room từ URL
window.addEventListener('load', () => {
  const rid = new URLSearchParams(location.search).get('room');
  if (rid) roomInput.value = rid;
});
