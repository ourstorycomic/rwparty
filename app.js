// 1) Import Firebase module qua CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push, onChildAdded, onValue
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAnalytics }  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// 2) Cấu hình Firebase (thay bằng config của bạn)
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

// 3) Khởi tạo Firebase
const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);    // nếu không dùng Analytics, bỏ dòng này
const db        = getDatabase(app);

// 4) DOM elements
const lobby      = document.getElementById('lobby');
const roomDiv    = document.getElementById('room');
const roomDisp   = document.getElementById('roomIdDisplay');
const nickInput  = document.getElementById('nickname');
const roomInput  = document.getElementById('roomIdInput');
const btnCreate  = document.getElementById('btnCreate');
const btnJoin    = document.getElementById('btnJoin');
const video      = document.getElementById('videoPlayer');
const chat       = document.getElementById('chat');
const chatInput  = document.getElementById('chatInput');
const btnSend    = document.getElementById('btnSend');

let nickname, roomId, isOwner = false;

// 5) Helper: lấy roomId từ URL
function getRoomIdFromURL() {
  return new URLSearchParams(window.location.search).get('room');
}

// 6) Tạo phòng mới (ghi owner vào DB)
btnCreate.onclick = () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Vui lòng nhập nickname!');
  roomId = Math.random().toString(36).substr(2, 8);
  history.replaceState(null, '', '?room=' + roomId);
  // Ghi owner
  set(ref(db, `rooms/${roomId}/owner`), nickname)
    .then(() => enterRoom(true))
    .catch(err => console.error(err));
};

// 7) Tham gia phòng (đọc owner)
btnJoin.onclick = () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname || !id) return alert('Nhập nickname và mã phòng!');
  roomId = id;
  history.replaceState(null, '', '?room=' + roomId);
  onValue(ref(db, `rooms/${roomId}/owner`), snap => {
    const ownerName = snap.val();
    if (!ownerName) {
      alert('Phòng không tồn tại hoặc chưa được tạo.');
      return;
    }
    enterRoom(ownerName === nickname);
  }, { onlyOnce: true });
};

// 8) Hàm khởi chạy giao diện phòng
function enterRoom(ownerFlag) {
  isOwner = ownerFlag;
  lobby.style.display   = 'none';
  roomDiv.style.display = 'block';
  roomDisp.textContent  = roomId;

  // Chat setup
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
    push(chatRef, { user: nickname, text: txt, timestamp: Date.now() });
    chatInput.value = '';
  };

  // Video sync setup (push events & listen)
  const eventsRef = ref(db, `rooms/${roomId}/video/events`);
  onChildAdded(eventsRef, snap => {
    const { type, user, time } = snap.val();
    if (user === nickname) return;  // ignore chính mình
    video.currentTime = time;
    if (type === 'play')  video.play();
    if (type === 'pause') video.pause();
    // seek chỉ cần đổi time
  });

  // Chỉ owner được điều khiển
  if (isOwner) {
    video.controls = true;
    video.addEventListener('play',  () => push(eventsRef, { type: 'play',  user: nickname, time: video.currentTime, ts: Date.now() }));
    video.addEventListener('pause', () => push(eventsRef, { type: 'pause', user: nickname, time: video.currentTime, ts: Date.now() }));
    video.addEventListener('seeked',() => push(eventsRef, { type: 'seek',  user: nickname, time: video.currentTime, ts: Date.now() }));
  } else {
    // Non-owner: tắt controls, không thể thao tác
    video.controls = false;
  }
}

// 9) Nếu URL có room, auto điền ô join
window.addEventListener('load', () => {
  const rid = getRoomIdFromURL();
  if (rid) roomInput.value = rid;
});
