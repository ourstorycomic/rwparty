// 1) Import Firebase + WebRTC via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push, onChildAdded,
  onChildChanged, onChildRemoved, onValue,
  remove, get
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// 2) Cấu hình Firebase (thay YOUR_* bằng thông tin từ Console)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// 3) Khởi tạo Firebase
const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db        = getDatabase(app);

// 4) DOM elements
const lobby        = document.getElementById('lobby');
const roomDiv      = document.getElementById('room');
const roomDisp     = document.getElementById('roomIdDisplay');
const nickInput    = document.getElementById('nickname');
const roomInput    = document.getElementById('roomIdInput');
const btnCreate    = document.getElementById('btnCreate');
const btnJoin      = document.getElementById('btnJoin');

const video        = document.getElementById('videoPlayer');
const chat         = document.getElementById('chat');
const chatInput    = document.getElementById('chatInput');
const btnSend      = document.getElementById('btnSend');

const btnJoinCall  = document.getElementById('btnJoinCall');
const btnLeaveCall = document.getElementById('btnLeaveCall');
const callControls = document.getElementById('callControls');
const btnMic       = document.getElementById('btnMic');
const btnSpeaker   = document.getElementById('btnSpeaker');
const callMembersDiv = document.getElementById('callMembers');

let nickname, roomId, isOwner = false;

// WebRTC state
let localStream = null;
const peers = {};                    // peerId -> { pc, audioEl }
const clientId = Math.random().toString(36).substr(2,8);

// ICE configuration (chỉ STUN; bạn có thể thêm TURN nếu cần)
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Helper: lấy roomId từ URL
function getRoomIdFromURL() {
  return new URLSearchParams(window.location.search).get('room');
}

// 5) Tạo phòng
btnCreate.onclick = async () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Vui lòng nhập nickname!');
  roomId = Math.random().toString(36).substr(2, 8);
  history.replaceState(null, '', '?room=' + roomId);
  isOwner = true;
  // Xóa dữ liệu cũ (nếu có) để khởi tạo sạch
  await remove(ref(db, `rooms/${roomId}`));
  await set(ref(db, `rooms/${roomId}/owner`), nickname);
  enterRoom();
};

// 6) Vào phòng
btnJoin.onclick = async () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname || !id) return alert('Nhập nickname và mã phòng!');
  roomId = id;
  history.replaceState(null, '', '?room=' + roomId);
  // Xóa signaling cũ
  await remove(ref(db, `rooms/${roomId}/webrtc`));
  // Đọc owner
  const snap = await get(ref(db, `rooms/${roomId}/owner`));
  const ownerName = snap.val();
  if (!ownerName) return alert('Phòng không tồn tại!');
  isOwner = (ownerName === nickname);
  enterRoom();
};

// 7) Vào giao diện phòng
function enterRoom() {
  lobby.style.display   = 'none';
  roomDiv.style.display = 'block';
  roomDisp.textContent  = roomId;

  setupChat();
  setupVideoSync();
  setupMembersAndCall();
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
    push(ref(db, `rooms/${roomId}/chat`), { user: nickname, text: txt, timestamp: Date.now() });
    chatInput.value = '';
  };
}

// Video sync
function setupVideoSync() {
  const eventsRef = ref(db, `rooms/${roomId}/video/events`);
  onChildAdded(eventsRef, snap => {
    const { type, user, time } = snap.val();
    if (user === nickname) return;
    video.currentTime = time;
    if (type === 'play')  video.play();
    if (type === 'pause') video.pause();
  });
  if (isOwner) {
    video.controls = true;
    ['play','pause','seeked'].forEach(evt => {
      video.addEventListener(evt, () => {
        push(eventsRef, {
          type: evt === 'seeked' ? 'seek' : evt,
          user: nickname,
          time: video.currentTime,
          ts: Date.now()
        });
      });
    });
  } else {
    video.controls = false;
  }
}

// Members + Call
function setupMembersAndCall() {
  const membersRef = ref(db, `rooms/${roomId}/members`);

  // Thêm bản thân
  set(ref(db, `rooms/${roomId}/members/${clientId}`), {
    user: nickname,
    muted: false,
    joined: Date.now()
  });

  // Kick
  onChildRemoved(membersRef, snap => {
    if (snap.key === clientId) {
      alert('Bạn đã bị kick khỏi phòng!');
      window.location.reload();
    }
  });

  // Mute
  onChildChanged(membersRef, snap => {
    if (snap.key === clientId && localStream) {
      const muted = snap.val().muted;
      localStream.getAudioTracks()[0].enabled = !muted;
      btnMic.textContent = `Mic: ${muted ? 'Off' : 'On'}`;
    }
  });

  // Hiển thị danh sách members
  onValue(membersRef, snap => {
    callMembersDiv.innerHTML = '';
    const data = snap.val() || {};
    Object.entries(data).forEach(([id, obj]) => {
      const div = document.createElement('div');
      div.textContent = obj.user + (id===clientId?' (Bạn)':'');
      if (obj.muted) div.style.opacity = 0.5;
      if (isOwner && id!==clientId) {
        const m = document.createElement('button');
        m.textContent = obj.muted ? 'Unmute' : 'Mute';
        m.onclick = () => set(ref(db, `rooms/${roomId}/members/${id}/muted`), !obj.muted);
        const k = document.createElement('button');
        k.textContent = 'Kick';
        k.onclick = () => remove(ref(db, `rooms/${roomId}/members/${id}`));
        div.append(' ', m, ' ', k);
      }
      callMembersDiv.appendChild(div);
    });
  });

  // Signaling
  const sigRef = ref(db, `rooms/${roomId}/webrtc`);
  onChildAdded(sigRef, snap => handleSignal(snap.val()));

  // Khi có member mới join call sau bạn
  onChildAdded(membersRef, snap => {
    const peerId = snap.key;
    if (peerId!==clientId && localStream && !peers[peerId]) {
      createPeerConnection(peerId, true);
    }
  });

  btnJoinCall.onclick  = joinCall;
  btnLeaveCall.onclick = leaveCall;
}

// Join Call
async function joinCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  btnJoinCall.disabled = true;
  btnLeaveCall.disabled = false;
  callControls.style.display = 'block';
  btnMic.textContent     = 'Mic: On';
  btnSpeaker.textContent = 'Speaker: On';

  // Offer to all existing peers
  const snap = await get(ref(db, `rooms/${roomId}/members`));
  for (let peerId of Object.keys(snap.val() || {})) {
    if (peerId === clientId) continue;
    createPeerConnection(peerId, true);
  }
}

// Leave Call
function leaveCall() {
  Object.values(peers).forEach(p => {
    p.pc.close();
    p.audioEl.remove();
  });
  Object.keys(peers).forEach(k => delete peers[k]);
  localStream.getTracks().forEach(t => t.stop());
  localStream = null;
  btnJoinCall.disabled = false;
  btnLeaveCall.disabled = true;
  callControls.style.display = 'none';
}

// Mic toggle
btnMic.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  btnMic.textContent = `Mic: ${track.enabled?'On':'Off'}`;
};

// Speaker toggle
btnSpeaker.onclick = () => {
  Object.values(peers).forEach(({audioEl}) => audioEl.muted = !audioEl.muted);
  const muted = peers[Object.keys(peers)[0]]?.audioEl.muted;
  btnSpeaker.textContent = `Speaker: ${muted ? 'Off' : 'On'}`;
};

// Create/handle PeerConnection
function createPeerConnection(peerId, isOffer) {
  if (peers[peerId]) return;
  const pc = new RTCPeerConnection(ICE_CONFIG);
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.muted    = false;
  pc.ontrack = ev => {
    audioEl.srcObject = ev.streams[0];
    audioEl.style.display = 'block';
    document.body.append(audioEl);
  };

  pc.onicecandidate = ev => {
    if (ev.candidate) {
      push(ref(db, `rooms/${roomId}/webrtc`), {
        from: clientId, to: peerId, candidate: ev.candidate
      });
    }
  };

  peers[peerId] = { pc, audioEl };

  if (isOffer) {
    pc.createOffer().then(o => {
      pc.setLocalDescription(o);
      push(ref(db, `rooms/${roomId}/webrtc`), {
        from: clientId, to: peerId, sdp: o
      });
    });
  }
}

// Handle incoming signal
async function handleSignal({ from, to, sdp, candidate }) {
  if (to !== clientId) return;
  if (!peers[from]) createPeerConnection(from, false);
  const { pc } = peers[from];
  if (sdp) {
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      push(ref(db, `rooms/${roomId}/webrtc`), {
        from: clientId, to: from, sdp: ans
      });
    }
  }
  if (candidate) {
    await pc.addIceCandidate(candidate);
  }
}

// Auto-fill room input
window.addEventListener('load', () => {
  const rid = getRoomIdFromURL();
  if (rid) roomInput.value = rid;
});
