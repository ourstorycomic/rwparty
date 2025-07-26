// 1) Import Firebase + WebRTC qua CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push, onChildAdded, onChildChanged,
  onChildRemoved, onValue, remove, get
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// 2) Config Firebase (thay bằng yours)
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
const peers = {};               // { peerId: { pc, audioEl } }
const clientId = Math.random().toString(36).substr(2,8);

// Helper: lấy roomId từ URL
function getRoomIdFromURL() {
  return new URLSearchParams(window.location.search).get('room');
}

// Tạo phòng: đánh dấu owner, xoá cũ, ghi owner, rồi enter
btnCreate.onclick = () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Nhập nickname!');
  roomId = Math.random().toString(36).substr(2, 8);
  history.replaceState(null, '', '?room=' + roomId);
  isOwner = true;
  // Xoá toàn bộ data cũ của phòng (nếu có)
  remove(ref(db, `rooms/${roomId}`)).catch(() => {});
  // Ghi owner
  set(ref(db, `rooms/${roomId}/owner`), nickname)
    .then(() => enterRoom())
    .catch(console.error);
};

// Join phòng: xoá signaling cũ, đọc owner, enter
btnJoin.onclick = () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname || !id) return alert('Nhập nickname và mã phòng!');
  roomId = id;
  history.replaceState(null, '', '?room=' + roomId);
  // Clear signaling cũ
  remove(ref(db, `rooms/${roomId}/webrtc`)).catch(() => {});
  get(ref(db, `rooms/${roomId}/owner`))
    .then(snap => {
      const ownerName = snap.val();
      if (!ownerName) return alert('Phòng không tồn tại');
      isOwner = (ownerName === nickname);
      enterRoom();
    })
    .catch(console.error);
};

// Vào Room: setup chat, video sync, members, call
function enterRoom() {
  lobby.style.display   = 'none';
  roomDiv.style.display = 'block';
  roomDisp.textContent  = roomId;

  // --- Chat ---
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

  // --- Video sync ---
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

  // --- Members list & Kick/Mute ---
  const membersRef = ref(db, `rooms/${roomId}/members`);
  // Thêm bản thân
  set(ref(db, `rooms/${roomId}/members/${clientId}`), {
    user: nickname,
    muted: false,
    joined: Date.now()
  });
  // Khi bị kick (node bị xoá)
  onChildRemoved(membersRef, snap => {
    if (snap.key === clientId) {
      alert('Bạn đã bị kick khỏi phòng!');
      window.location.reload();
    }
  });
  // Khi owner mute/unmute bạn
  onChildChanged(membersRef, snap => {
    if (snap.key === clientId && localStream) {
      const muted = snap.val().muted;
      localStream.getAudioTracks()[0].enabled = !muted;
      btnMic.textContent = `Mic: ${muted?'Off':'On'}`;
    }
  });
  // Hiển thị danh sách members
  onValue(membersRef, snap => {
    callMembersDiv.innerHTML = '';
    const data = snap.val() || {};
    for (let [id,obj] of Object.entries(data)) {
      const div = document.createElement('div');
      div.textContent = obj.user + (id===clientId?' (Bạn)':'');
      if (obj.muted) div.style.opacity = 0.5;
      if (isOwner && id!==clientId) {
        const btnMute = document.createElement('button');
        btnMute.textContent = obj.muted?'Unmute':'Mute';
        btnMute.onclick = () =>
          set(ref(db,`rooms/${roomId}/members/${id}/muted`), !obj.muted);
        const btnKick = document.createElement('button');
        btnKick.textContent = 'Kick';
        btnKick.onclick = () =>
          remove(ref(db,`rooms/${roomId}/members/${id}`));
        div.append(' ', btnMute, ' ', btnKick);
      }
      callMembersDiv.appendChild(div);
    }
  });

  // --- WebRTC Signaling & ICE ---
  const sigRef = ref(db, `rooms/${roomId}/webrtc`);
  onChildAdded(sigRef, snap => handleSignal(snap.val()));

  // Khi có member mới join, nếu bạn đang trong call, tạo offer
  onChildAdded(membersRef, snap => {
    const peerId = snap.key;
    if (peerId!==clientId && localStream) {
      createPeerConnection(peerId, true);
    }
  });

  // --- Join/Leave Call ---
  btnJoinCall.onclick  = joinCall;
  btnLeaveCall.onclick = leaveCall;
}

// Join Call: getUserMedia + mesh connect
async function joinCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  btnJoinCall.disabled = true;
  btnLeaveCall.disabled = false;
  callControls.style.display = 'block';

  // Tạo offer cho tất cả peer đã có
  const membersSnap = await get(ref(db, `rooms/${roomId}/members`));
  for (let peerId of Object.keys(membersSnap.val()||{})) {
    if (peerId===clientId) continue;
    createPeerConnection(peerId, true);
  }
}

// Leave Call: close all
function leaveCall() {
  for (let k in peers) {
    peers[k].pc.close();
    peers[k].audioEl.remove();
    delete peers[k];
  }
  localStream.getTracks().forEach(t=>t.stop());
  localStream = null;
  btnJoinCall.disabled = false;
  btnLeaveCall.disabled = true;
  callControls.style.display = 'none';
}

// Mic / Speaker toggle
btnMic.onclick = ()=>{
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  btnMic.textContent = `Mic: ${track.enabled?'On':'Off'}`;
};
btnSpeaker.onclick = ()=>{
  for (let p of Object.values(peers)) {
    p.audioEl.muted = !p.audioEl.muted;
  }
  const muted = peers[Object.keys(peers)[0]]?.audioEl.muted;
  btnSpeaker.textContent = `Speaker: ${muted?'Off':'On'}`;
};

// Tạo RTCPeerConnection
function createPeerConnection(peerId, isOffer) {
  if (peers[peerId]) return;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls:'stun:stun.l.google.com:19302' }]
  });
  localStream.getTracks().forEach(t=>pc.addTrack(t, localStream));

  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.muted = false;
  pc.ontrack = ev => {
    audioEl.srcObject = ev.streams[0];
    audioEl.style.display = 'block';
    document.body.append(audioEl);
  };

  pc.onicecandidate = ev => {
    if (ev.candidate) {
      push(ref(db,`rooms/${roomId}/webrtc`), {
        from: clientId,
        to: peerId,
        candidate: ev.candidate
      });
    }
  };

  peers[peerId] = { pc, audioEl };

  if (isOffer) {
    pc.createOffer().then(o=>{
      pc.setLocalDescription(o);
      push(ref(db,`rooms/${roomId}/webrtc`), {
        from: clientId,
        to: peerId,
        sdp: o
      });
    });
  }
}

// Xử lý signaling
async function handleSignal(msg) {
  const { from, to, sdp, candidate } = msg;
  if (to !== clientId) return;
  if (!peers[from]) createPeerConnection(from, false);
  const { pc } = peers[from];
  if (sdp) {
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      push(ref(db,`rooms/${roomId}/webrtc`), {
        from: clientId,
        to: from,
        sdp: ans
      });
    }
  }
  if (candidate) {
    await pc.addIceCandidate(candidate);
  }
}

// Auto điền room nếu URL có ?room=
window.addEventListener('load', ()=>{
  const rid = getRoomIdFromURL();
  if (rid) roomInput.value = rid;
});
