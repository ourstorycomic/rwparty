// 1) Import Firebase module qua CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue, set } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
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

let nickname, roomId;

// 5) Lấy roomId từ URL nếu có
function getRoomIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

// 6) Tạo phòng mới
btnCreate.onclick = () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Vui lòng nhập nickname!');
  roomId = Math.random().toString(36).substr(2, 8);
  // Cập nhật URL
  history.replaceState(null, '', '?room=' + roomId);
  enterRoom();
};

// 7) Tham gia phòng
btnJoin.onclick = () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname || !id) return alert('Nhập nickname và mã phòng!');
  roomId = id;
  history.replaceState(null, '', '?room=' + roomId);
  enterRoom();
};

// 8) Vào giao diện phòng
function enterRoom() {
  lobby.style.display   = 'none';
  roomDiv.style.display = 'block';
  roomDisp.textContent  = roomId;

  const roomRef = ref(db, `rooms/${roomId}`);

  // 8a) Chat: lắng nghe tin nhắn mới
  onChildAdded(ref(db, `rooms/${roomId}/chat`), snap => {
    const { user, text } = snap.val();
    const p = document.createElement('p');
    p.innerHTML = `<strong>${user}:</strong> ${text}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });

  // 8b) Video sync: lắng nghe play/pause/seek
  ['play','pause','seek'].forEach(evt => {
    onValue(ref(db, `rooms/${roomId}/video/${evt}`), snap => {
      const data = snap.val();
      if (!data || data.user === nickname) return;
      video.currentTime = data.time;
      if (evt === 'play')  video.play();
      if (evt === 'pause') video.pause();
      // seek thì chỉ đổi time
    });
  });

  // 8c) Gửi chat
  btnSend.onclick = () => {
    const txt = chatInput.value.trim();
    if (!txt) return;
    push(ref(db, `rooms/${roomId}/chat`), {
      user: nickname,
      text: txt,
      timestamp: Date.now()
    });
    chatInput.value = '';
  };

  // 8d) Gửi sự kiện video khi user thao tác
  video.addEventListener('play', () => {
    set(ref(db, `rooms/${roomId}/video/play`), {
      user: nickname,
      time: video.currentTime
    });
  });
  video.addEventListener('pause', () => {
    set(ref(db, `rooms/${roomId}/video/pause`), {
      user: nickname,
      time: video.currentTime
    });
  });
  video.addEventListener('seeked', () => {
    set(ref(db, `rooms/${roomId}/video/seek`), {
      user: nickname,
      time: video.currentTime
    });
  });
}

// 9) Nếu URL đã có room, chỉ cần nhập nickname rồi bấm “Vào phòng”
window.addEventListener('load', () => {
  const rid = getRoomIdFromURL();
  if (rid) {
    roomInput.value = rid;
  }
});
