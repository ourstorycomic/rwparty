// 1) Import Firebase + WebRTC via CDN
import {
  getDatabase, ref, set, push,
  onChildAdded, onChildChanged, onChildRemoved, onValue,
  remove, get
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// 2) DOM helpers & elements
const E = id => document.getElementById(id);
const lobby       = E('lobby'),   roomDiv = E('room');
const nickInput   = E('nickname'), roomInput = E('roomIdInput');
const btnCreate   = E('btnCreate'), btnJoin = E('btnJoin');
const roomDisp    = E('roomIdDisplay');
const video       = E('videoPlayer'), rateSelect = E('playbackRate');
const chat        = E('chat'), chatInput = E('chatInput'), btnSend = E('btnSend');
const membersDiv  = E('members');
const btnJoinCall = E('btnJoinCall'), btnLeaveCall = E('btnLeaveCall');
const callControls= E('callControls'), btnMic = E('btnMic'), btnSpeaker = E('btnSpeaker');
const callMembers = E('callMembers');

// 3) Firebase database instance (from global window.firebase)
const db = firebase.app().database();

// 4) State
let nickname, roomId, isOwner = false;
let localStream = null;
const peers = {};
const clientId = Math.random().toString(36).substr(2,8);
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// 5) URL helper
function getRoomIdFromURL() {
  return new URLSearchParams(window.location.search).get('room');
}

// 6) Create room
btnCreate.onclick = async () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Nhập nickname!');
  roomId = Math.random().toString(36).substr(2,8);
  history.replaceState(null,'','?room='+roomId);
  isOwner = true;
  await remove(ref(db, `rooms/${roomId}`));
  await set(ref(db, `rooms/${roomId}/owner`), nickname);
  enterRoom();
};

// 7) Join room
btnJoin.onclick = async () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname||!id) return alert('Nhập đầy đủ!');
  roomId = id;
  history.replaceState(null,'','?room='+roomId);
  await remove(ref(db, `rooms/${roomId}/webrtc`));
  const snap = await get(ref(db, `rooms/${roomId}/owner`));
  if (!snap.exists()) return alert('Phòng không tồn tại!');
  isOwner = (snap.val() === nickname);
  enterRoom();
};

// 8) Switch view
function enterRoom() {
  lobby.classList.add('hidden');
  roomDiv.classList.remove('hidden');
  roomDisp.textContent = roomId;
  setupChat();
  setupVideoSync();
  setupMembersAndCall();
}

// 9) Chat
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

// 10) Video sync
function setupVideoSync() {
  const evtRef = ref(db, `rooms/${roomId}/video/events`);
  onChildAdded(evtRef, snap => {
    const { type, user, time } = snap.val();
    if (user === nickname) return;
    video.currentTime = time;
    if (type==='play') video.play();
    if (type==='pause') video.pause();
  });
  if (isOwner) {
    video.controls = true;
    rateSelect.classList.remove('hidden');
    ['play','pause','seeked'].forEach(evt => {
      video.addEventListener(evt, () => {
        push(evtRef, { type: evt==='seeked'?'seek':evt, user: nickname, time: video.currentTime });
      });
    });
    rateSelect.onchange = () => video.playbackRate = rateSelect.value;
  } else {
    video.controls = false;
  }
}

// 11) Members + Call
function setupMembersAndCall() {
  const memRef = ref(db, `rooms/${roomId}/members`);
  set(ref(db, `rooms/${roomId}/members/${clientId}`), { user: nickname, muted: false });

  onChildRemoved(memRef, snap => {
    if (snap.key === clientId) { alert('Bạn bị kick!'); window.location.reload(); }
  });
  onChildChanged(memRef, snap => {
    if (snap.key===clientId && localStream) {
      const muted = snap.val().muted;
      localStream.getAudioTracks()[0].enabled = !muted;
      btnMic.textContent = `Mic: ${muted?'Off':'On'}`;
    }
  });
  onValue(memRef, snap => {
    membersDiv.innerHTML = '';
    const data = snap.val()||{};
    Object.entries(data).forEach(([id,obj])=>{
      const d = document.createElement('div');
      d.textContent = obj.user + (id===clientId?' (Bạn)':'');
      if (obj.muted) d.style.opacity = 0.5;
      if (isOwner && id!==clientId) {
        const m = document.createElement('button'); m.textContent = obj.muted?'Unmute':'Mute';
        m.onclick = ()=> set(ref(db, `rooms/${roomId}/members/${id}/muted`), !obj.muted);
        const k = document.createElement('button'); k.textContent='Kick';
        k.onclick = ()=> remove(ref(db, `rooms/${roomId}/members/${id}`));
        d.append(' ',m,' ',k);
      }
      membersDiv.appendChild(d);
    });
  });

  const sigRef = ref(db, `rooms/${roomId}/webrtc`);
  onChildAdded(sigRef, snap=>handleSignal(snap.val()));
  onChildAdded(memRef, snap=> {
    const pid = snap.key;
    if (pid!==clientId && localStream && !peers[pid]) createPeerConnection(pid,true);
  });

  btnJoinCall.onclick = joinCall;
  btnLeaveCall.onclick= leaveCall;
}

// 12) Join Call
async function joinCall() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio:true });
  btnJoinCall.disabled = true; btnLeaveCall.disabled = false;
  callControls.classList.remove('hidden');
  btnMic.textContent = 'Mic: On'; btnSpeaker.textContent='Speaker: On';
  const snap = await get(ref(db, `rooms/${roomId}/members`));
  for (let pid of Object.keys(snap.val()||{})) {
    if (pid===clientId) continue;
    createPeerConnection(pid,true);
  }
}

// 13) Leave Call
function leaveCall() {
  Object.values(peers).forEach(({pc,audioEl})=>{ pc.close(); audioEl.remove(); });
  Object.keys(peers).forEach(k=>delete peers[k]);
  localStream.getTracks().forEach(t=>t.stop());
  localStream = null;
  btnJoinCall.disabled = false; btnLeaveCall.disabled = true;
  callControls.classList.add('hidden');
}

// 14) Mic toggle
btnMic.onclick = () => {
  if (!localStream) return;
  const t = localStream.getAudioTracks()[0]; t.enabled = !t.enabled;
  btnMic.textContent = `Mic: ${t.enabled?'On':'Off'}`;
};

// 15) Speaker toggle
btnSpeaker.onclick = () => {
  const muted = !document.querySelector('#callMembers audio')?.muted;
  document.querySelectorAll('#callMembers audio').forEach(a=>a.muted=muted);
  btnSpeaker.textContent = `Speaker: ${muted?'Off':'On'}`;
};

// 16) PeerConnection + signaling
function createPeerConnection(peerId,isOffer) {
  if (peers[peerId]) return;
  const pc = new RTCPeerConnection(ICE_CONFIG);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  const audioEl = document.createElement('audio');
  audioEl.autoplay=true; audioEl.muted=false;
  pc.ontrack = ev => callMembers.appendChild((audioEl.srcObject=ev.streams[0],audioEl));
  pc.onicecandidate = ev => {
    if (ev.candidate) push(ref(db, `rooms/${roomId}/webrtc`), { from: clientId, to: peerId, candidate: ev.candidate });
  };
  peers[peerId] = { pc, audioEl };
  if (isOffer) {
    pc.createOffer().then(o=>{
      pc.setLocalDescription(o);
      push(ref(db, `rooms/${roomId}/webrtc`), { from: clientId, to: peerId, sdp: o });
    });
  }
}

async function handleSignal({from,to,sdp,candidate}) {
  if (to!==clientId) return;
  if (!peers[from]) createPeerConnection(from,false);
  const pc = peers[from].pc;
  if (sdp) {
    await pc.setRemoteDescription(sdp);
    if (sdp.type==='offer') {
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      push(ref(db, `rooms/${roomId}/webrtc`), { from: clientId, to: from, sdp: ans });
    }
  }
  if (candidate) await pc.addIceCandidate(candidate);
}

// 17) Auto-fill roomId
window.addEventListener('load', () => {
  const rid = getRoomIdFromURL();
  if (rid) roomInput.value = rid;
});
