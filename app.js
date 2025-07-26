// 1) Import Firebase + WebRTC qua CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push, onChildAdded, onChildChanged,
  onChildRemoved, onValue, remove
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAnalytics }  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// 2) Thay bằng config Firebase của bạn
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

// Tạo phòng: set isOwner = true rồi ghi owner vào DB
btnCreate.onclick = () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Nhập nickname!');
  roomId = Math.random().toString(36).substr(2, 8);
  history.replaceState(null, '', '?room=' + roomId);
  isOwner = true;
  set(ref(db, `rooms/${roomId}/owner`), nickname)
    .then(() => enterRoom())
    .catch(console.error);
};

// Join phòng: đọc owner để biết isOwner
btnJoin.onclick = () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname || !id) return alert('Nhập nickname và mã phòng!');
  roomId = id;
  history.replaceState(null, '', '?room=' + roomId);
  onValue(ref(db, `rooms/${roomId}/owner`), snap => {
    const ownerName = snap.val();
    if (!ownerName) {
      alert('Phòng không tồn tại');
      return;
    }
    isOwner = (ownerName === nickname);
    enterRoom();
  }, { onlyOnce: true });
};

// Vào Room: thiết lập chat, video, members, call
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
  // Khi join, thêm chính mình
  set(ref(db, `rooms/${roomId}/members/${clientId}`), {
    user: nickname,
    muted: false,
    joined: Date.now()
  });
  // Kick: khi owner remove node, reload client
  onChildRemoved(membersRef, snap => {
    if (snap.key === clientId) {
      alert('Bạn đã bị kick khỏi phòng!');
      window.location.reload();
    }
  });
  // Mute: khi flag muted của chính bạn thay đổi, bật/tắt mic
  onChildChanged(membersRef, snap => {
    if (snap.key === clientId && localStream) {
      const muted = snap.val().muted;
      localStream.getAudioTracks()[0].enabled = !muted;
      btnMic.textContent = `Mic: ${muted ? 'Off' : 'On'}`;
    }
  });
  // Build UI danh sách members
  onValue(membersRef, snap => {
    callMembersDiv.innerHTML = '';
    const data = snap.val() || {};
    Object.entries(data).forEach(([id, obj]) => {
      const div = document.createElement('div');
      div.textContent = obj.user + (id === clientId ? ' (Bạn)' : '');
      if (obj.muted) div.style.opacity = 0.5;
      if (isOwner && id !== clientId) {
        const btnMute = document.createElement('button');
        btnMute.textContent = obj.muted ? 'Unmute' : 'Mute';
        btnMute.onclick = () =>
          set(ref(db, `rooms/${roomId}/members/${id}/muted`), !obj.muted);
        const btnKick = document.createElement('button');
        btnKick.textContent = 'Kick';
        btnKick.onclick = () =>
          remove(ref(db, `rooms/${roomId}/members/${id}`));
        div.append(' ', btnMute, ' ', btnKick);
      }
      callMembersDiv.appendChild(div);
    });
  });

  // --- WebRTC Signaling ---
  const sigRef = ref(db, `rooms/${roomId}/webrtc`);
  onChildAdded(sigRef, snap => handleSignal(snap.val()));

  // --- Join/Leave Call ---
  btnJoinCall.onclick  = joinCall;
  btnLeaveCall.onclick = leaveCall;
}

// Join Call: lấy mic và khởi tạo PeerConnections
async function joinCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  btnJoinCall.disabled = true;
  btnLeaveCall.disabled = false;
  callControls.style.display = 'block';

  // Tạo offer tới mỗi peer đã join trước
  const membersSnap = await ref(db, `rooms/${roomId}/members`).get();
  const members = membersSnap.val() || {};
  for (const peerId of Object.keys(members)) {
    if (peerId === clientId) continue;
    createPeerConnection(peerId, true);
  }
}

// Leave Call: đóng tất cả kết nối
function leaveCall() {
  Object.values(peers).forEach(p => {
    p.pc.close();
    p.audioEl.remove();
  });
  for (const k in peers) delete peers[k];
  localStream.getTracks().forEach(t => t.stop());
  localStream = null;
  btnJoinCall.disabled = false;
  btnLeaveCall.disabled = true;
  callControls.style.display = 'none';
}

// Mic on/off local
btnMic.onclick = () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  btnMic.textContent = `Mic: ${track.enabled ? 'On' : 'Off'}`;
};

// Speaker on/off remote
btnSpeaker.onclick = () => {
  Object.values(peers).forEach(p => {
    p.audioEl.muted = !p.audioEl.muted;
  });
  const muted = peers[Object.keys(peers)[0]]?.audioEl.muted;
  btnSpeaker.textContent = `Speaker: ${muted ? 'Off' : 'On'}`;
};

// Tạo RTCPeerConnection với STUN server, handle Offer/Answer/ICE
function createPeerConnection(peerId, isOffer) {
  if (peers[peerId]) return;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  const audioEl = document.createElement('audio');
  audioEl.autoplay = true;
  audioEl.muted = false;  // đảm bảo không tắt
  pc.ontrack = ev => {
    audioEl.srcObject = ev.streams[0];
    audioEl.style.display = 'block';
    document.body.append(audioEl);
  };

  pc.onicecandidate = ev => {
    if (ev.candidate) {
      push(ref(db, `rooms/${roomId}/webrtc`), {
        from: clientId,
        to: peerId,
        candidate: ev.candidate
      });
    }
  };

  peers[peerId] = { pc, audioEl };

  if (isOffer) {
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      push(ref(db, `rooms/${roomId}/webrtc`), {
        from: clientId,
        to: peerId,
        sdp: offer
      });
    });
  }
}

// Xử lý signaling messages
async function handleSignal(msg) {
  const { from, to, sdp, candidate } = msg;
  if (to !== clientId) return;
  if (!peers[from]) createPeerConnection(from, false);
  const { pc } = peers[from];
  if (sdp) {
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      push(ref(db, `rooms/${roomId}/webrtc`), {
        from: clientId,
        to: from,
        sdp: answer
      });
    }
  }
  if (candidate) {
    await pc.addIceCandidate(candidate);
  }
}

// Auto điền room ID nếu URL có ?room=
window.addEventListener('load', () => {
  const rid = getRoomIdFromURL();
  if (rid) roomInput.value = rid;
});
