import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import {
  getDatabase, ref, set, push,
  onChildAdded, onChildChanged, onChildRemoved, onValue,
  remove, get
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Firebase init
const firebaseConfig = {
  apiKey: "AIzaSyBvhRRIP3zyPL6htL2fgSAAhks5y6EJB7Y",
  authDomain: "rwparty-24391.firebaseapp.com",
  databaseURL: "https://rwparty-24391-default-rtdb.firebaseio.com",
  projectId: "rwparty-24391",
  storageBucket: "rwparty-24391.appspot.com",
  messagingSenderId: "281506397324",
  appId: "1:281506397324:web:0c5af5bdbb7eeca0588fa9",
  measurementId: "G-HX95ZF61BE"
};
const app = initializeApp(firebaseConfig);
getAnalytics(app);
const db = getDatabase(app);

// DOM
const E = id => document.getElementById(id);
const lobby = E('lobby'), roomDiv = E('room');
const nickInput = E('nickname'), roomInput = E('roomIdInput');
const btnCreate = E('btnCreate'), btnJoin = E('btnJoin');
const roomDisp = E('roomIdDisplay');
const video = E('videoPlayer'), rateSelect = E('playbackRate');
const chat = E('chat'), chatInput = E('chatInput'), btnSend = E('btnSend');
const membersDiv = E('members');

// State
let nickname, roomId, isOwner = false;
const clientId = Math.random().toString(36).substr(2, 8);

// Helper: read ?room=
function getRoomIdFromURL() {
  return new URLSearchParams(location.search).get('room');
}

// Create room
btnCreate.onclick = async () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Nhập nickname');
  roomId = Math.random().toString(36).substr(2, 8);
  history.replaceState(null, null, '?room=' + roomId);
  isOwner = true;
  try {
    await remove(ref(db, `rooms/${roomId}`));
    await set(ref(db, `rooms/${roomId}/owner`), nickname);
    enterRoom();
  } catch (e) {
    console.error(e);
    alert('Lỗi tạo phòng');
  }
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

// Show UI
function enterRoom() {
  lobby.classList.add('hidden');
  roomDiv.classList.remove('hidden');
  roomDisp.textContent = roomId;
  setupChat();
  setupVideoSync();
  setupMembers();
}

// Chat
function setupChat() {
  const chatRef = ref(db, `rooms/${roomId}/chat`);
  onChildAdded(chatRef, s => {
    const { user, text } = s.val();
    const p = document.createElement('p');
    p.innerHTML = `<strong>${user}:</strong> ${text}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });
  btnSend.onclick = () => {
    const txt = chatInput.value.trim();
    if (!txt) return;
    push(chatRef, { user: nickname, text: txt, timestamp: Date.now() });
    chatInput.value = '';
  };
}

// Video sync
function setupVideoSync() {
  const evtRef = ref(db, `rooms/${roomId}/video/events`);
  onChildAdded(evtRef, s => {
    const { type, user, time } = s.val();
    if (user === nickname) return;
    video.currentTime = time;
    if (type === 'play') video.play();
    if (type === 'pause') video.pause();
  });
  if (isOwner) {
    video.controls = true;
    rateSelect.classList.remove('hidden');
    ['play', 'pause', 'seeked'].forEach(evt => {
      video.addEventListener(evt, () => {
        push(evtRef, {
          type: evt === 'seeked' ? 'seek' : evt,
          user: nickname,
          time: video.currentTime
        });
      });
    });
    rateSelect.onchange = () => video.playbackRate = rateSelect.value;
  } else {
    video.controls = false;
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

  onChildRemoved(memRef, s => {
    if (s.key === clientId) {
      alert('Bạn bị kick khỏi phòng'); location.reload();
    }
  });

  onValue(memRef, s => {
    membersDiv.innerHTML = '';
    const data = s.val() || {};
    for (let [id, obj] of Object.entries(data)) {
      const d = document.createElement('div');
      d.textContent = obj.user + (id === clientId ? ' (Bạn)' : '');
      if (isOwner && id !== clientId) {
        const kr = document.createElement('button');
        kr.textContent = 'Kick khỏi room';
        kr.onclick = () => remove(ref(db, `rooms/${roomId}/members/${id}`));
        d.append(' ', kr);
      }
      membersDiv.appendChild(d);
    }
  });
}

// Autofill
window.addEventListener('load', () => {
  const rid = getRoomIdFromURL();
  if (rid) roomInput.value = rid;
});
