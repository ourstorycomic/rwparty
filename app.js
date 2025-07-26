import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import {
  getDatabase, ref, set, push,
  onChildAdded, onChildChanged, onChildRemoved, onValue,
  remove, get
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// --- 1) Firebase init ---
const firebaseConfig = {
  apiKey: "AIzaSyBvhRRIP3zyPL6htL2fgSAAhks5y6EJB7Y",
  authDomain: "rwparty-24391.firebaseapp.com",
  databaseURL: "https://rwparty-24391-default-rtdb.firebaseio.com",
  projectId: "rwparty-24391",
  storageBucket: "rwparty-24391.firebasestorage.app",
  messagingSenderId: "281506397324",
  appId: "1:281506397324:web:0c5af5bdbb7eeca0588fa9",
  measurementId: "G-HX95ZF61BE"
};
const app = initializeApp(firebaseConfig);
getAnalytics(app);
const db = getDatabase(app);

// --- 2) DOM refs ---
const E = id => document.getElementById(id);
const lobby       = E('lobby'),    roomDiv   = E('room');
const nickInput   = E('nickname'), roomInput = E('roomIdInput');
const btnCreate   = E('btnCreate'), btnJoin   = E('btnJoin');
const roomDisp    = E('roomIdDisplay');
const video       = E('videoPlayer'), rateSelect = E('playbackRate');
const chat        = E('chat'),      chatInput   = E('chatInput'), btnSend = E('btnSend');
const membersDiv  = E('members');
const btnJoinCall = E('btnJoinCall'), btnLeaveCall = E('btnLeaveCall');
const callControls= E('callControls'), btnMic      = E('btnMic'), btnSpeaker = E('btnSpeaker');
const callMembers = E('callMembers');

// --- 3) State ---
let nickname, roomId, isOwner=false;
let localStream = null;
const peers    = {};
const clientId = Math.random().toString(36).substr(2,8);
const ICE_CONFIG = { iceServers:[{urls:'stun:stun.l.google.com:19302'}] };

// Helper to read ?room=
function getRoomIdFromURL(){
  return new URLSearchParams(location.search).get('room');
}

// --- 4) Create room ---
btnCreate.onclick = async () => {
  nickname = nickInput.value.trim();
  if(!nickname) return alert('Nhập nickname');
  roomId = Math.random().toString(36).substr(2,8);
  history.replaceState(null,'','?room='+roomId);
  isOwner = true;
  try {
    await remove(ref(db,`rooms/${roomId}`));
    await set(ref(db,`rooms/${roomId}/owner`),nickname);
    enterRoom();
  } catch(e) {
    console.error(e);
    alert('Lỗi tạo phòng');
  }
};

// --- 5) Join room ---
btnJoin.onclick = async () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if(!nickname||!id) return alert('Nhập hết thông tin');
  roomId = id;
  history.replaceState(null,'','?room='+roomId);
  await remove(ref(db,`rooms/${roomId}/webrtc`));
  const snap = await get(ref(db,`rooms/${roomId}/owner`));
  if(!snap.exists()) return alert('Phòng không tồn tại');
  isOwner = (snap.val() === nickname);
  enterRoom();
};

// --- 6) Show room UI ---
function enterRoom(){
  lobby.classList.add('hidden');
  roomDiv.classList.remove('hidden');
  roomDisp.textContent = roomId;
  setupChat();
  setupVideoSync();
  setupMembersAndCall();
}

// --- 7) Chat ---
function setupChat(){
  const chatRef = ref(db,`rooms/${roomId}/chat`);
  onChildAdded(chatRef, s=>{
    const {user,text} = s.val();
    const p = document.createElement('p');
    p.innerHTML = `<strong>${user}:</strong> ${text}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });
  btnSend.onclick = ()=>{
    const txt = chatInput.value.trim();
    if(!txt) return;
    push(ref(db,`rooms/${roomId}/chat`),{user:nickname,text:txt,timestamp:Date.now()});
    chatInput.value = '';
  };
}

// --- 8) Video sync ---
function setupVideoSync(){
  const evtRef = ref(db,`rooms/${roomId}/video/events`);
  onChildAdded(evtRef, s=>{
    const {type,user,time} = s.val();
    if(user===nickname) return;
    video.currentTime = time;
    if(type==='play') video.play();
    if(type==='pause') video.pause();
  });
  if(isOwner){
    video.controls = true;
    rateSelect.classList.remove('hidden');
    ['play','pause','seeked'].forEach(evt=>{
      video.addEventListener(evt, ()=>{
        push(evtRef, {type:evt==='seeked'?'seek':evt,user:nickname,time:video.currentTime});
      });
    });
    rateSelect.onchange = ()=>video.playbackRate = rateSelect.value;
  } else {
    video.controls = false;
  }
}

// --- 9) Members & Call setup ---
async function setupMembersAndCall(){
  // Room members
  const memRef = ref(db,`rooms/${roomId}/members`);
  // prevent duplicate
  const exist = (await get(memRef)).val()||{};
  if(Object.values(exist).some(m=>m.user===nickname)){
    alert('Nickname đã tồn tại'); return location.reload();
  }
  await set(ref(db,`rooms/${roomId}/members/${clientId}`),{user:nickname,muted:false});

  onChildRemoved(memRef, s=>{
    if(s.key===clientId){
      alert('Bạn bị kick khỏi phòng'); location.reload();
    }
  });
  onChildChanged(memRef, s=>{
    if(s.key===clientId && localStream){
      const muted = s.val().muted;
      localStream.getAudioTracks()[0].enabled = !muted;
      btnMic.textContent = `Mic: ${muted?'Off':'On'}`;
    }
  });
  onValue(memRef, s=>{
    membersDiv.innerHTML = '';
    const data = s.val()||{};
    for(let [id,obj] of Object.entries(data)){
      const d = document.createElement('div');
      d.textContent = obj.user + (id===clientId?' (Bạn)':'');
      if(isOwner && id!==clientId){
        const kr = document.createElement('button');
        kr.textContent = 'Kick room';
        kr.onclick = ()=>remove(ref(db,`rooms/${roomId}/members/${id}`));
        const kc = document.createElement('button');
        kc.textContent = 'Kick call';
        kc.onclick = ()=>remove(ref(db,`rooms/${roomId}/callMembers/${id}`));
        const m  = document.createElement('button');
        m.textContent = obj.muted?'Unmute':'Mute';
        m.onclick = ()=>set(ref(db,`rooms/${roomId}/members/${id}/muted`),!obj.muted);
        d.append(' ',kr,' ',kc,' ',m);
      }
      membersDiv.appendChild(d);
    }
  });

  // Call members
  const callRef = ref(db,`rooms/${roomId}/callMembers`);
  onValue(callRef, s=>{
    callMembers.innerHTML = '';
    const data = s.val()||{};
    for(let [id,obj] of Object.entries(data)){
      const div = document.createElement('div');
      div.className = 'participant';
      const span = document.createElement('span');
      span.textContent = obj.user + (id===clientId?' (Bạn)':'');
      div.append(span);
      if(isOwner && id!==clientId){
        const kc = document.createElement('button');
        kc.textContent = 'Kick call';
        kc.onclick = ()=>remove(ref(db,`rooms/${roomId}/callMembers/${id}`));
        div.append(kc);
      }
      callMembers.append(div);
    }
  });
  onChildRemoved(callRef,s=>{
    if(s.key===clientId){ alert('Bạn bị kick khỏi call'); leaveCall(); }
  });

  // Signaling
  const sigRef = ref(db,`rooms/${roomId}/webrtc`);
  onChildAdded(sigRef, s=>handleSignal(s.val()));

  // auto connect when new room member arrives
  onChildAdded(memRef, s=>{
    const pid = s.key;
    if(pid!==clientId && localStream && !peers[pid]) createPeerConnection(pid,true);
  });

  btnJoinCall.onclick = ()=>joinCall(callRef);
  btnLeaveCall.onclick = ()=>{
    remove(ref(db,`rooms/${roomId}/callMembers/${clientId}`));
    leaveCall();
  };
}

// --- 10) Join call ---
async function joinCall(callRef){
  localStream = await navigator.mediaDevices.getUserMedia({audio:true});
  btnJoinCall.disabled = true;
  btnLeaveCall.disabled = false;
  callControls.classList.remove('hidden');
  btnMic.textContent    = 'Mic: On';
  btnSpeaker.textContent= 'Speaker: On';

  await set(ref(db,`rooms/${roomId}/callMembers/${clientId}`),{user:nickname});

  const snap=await get(ref(db,`rooms/${roomId}/members`));
  Object.keys(snap.val()||{}).forEach(pid=>{
    if(pid!==clientId) createPeerConnection(pid,true);
  });
}

// --- 11) Leave call ---
function leaveCall(){
  Object.values(peers).forEach(({pc,audioEl})=>{
    pc.close();
    audioEl.remove();
  });
  Object.keys(peers).forEach(k=>delete peers[k]);
  localStream && localStream.getTracks().forEach(t=>t.stop());
  localStream = null;
  btnJoinCall.disabled = false;
  btnLeaveCall.disabled = true;
  callControls.classList.add('hidden');
}

// --- 12) Mic toggle ---
btnMic.onclick = ()=>{
  if(!localStream) return;
  const t = localStream.getAudioTracks()[0];
  t.enabled = !t.enabled;
  btnMic.textContent = `Mic: ${t.enabled?'On':'Off'}`;
};

// --- 13) Speaker toggle ---
btnSpeaker.onclick = ()=>{
  const muted = !document.querySelector('#callMembers audio')?.muted;
  document.querySelectorAll('#callMembers audio').forEach(a=>a.muted = muted);
  btnSpeaker.textContent = `Speaker: ${muted?'Off':'On'}`;
};

// --- 14) PeerConnection & ontrack fix ---
function createPeerConnection(peerId,isOffer){
  if(peers[peerId]) return;
  const pc = new RTCPeerConnection(ICE_CONFIG);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));

  pc.ontrack = ev => {
    // create new audio element per track
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.controls = false;
    audioEl.srcObject = ev.streams[0];
    // ensure playback
    audioEl.play().catch(console.warn);
    callMembers.appendChild(audioEl);
  };

  pc.onicecandidate = ev => {
    if(ev.candidate){
      push(ref(db,`rooms/${roomId}/webrtc`),{
        from: clientId, to: peerId, candidate: ev.candidate
      });
    }
  };

  peers[peerId] = { pc };

  if(isOffer){
    pc.createOffer().then(o=>{
      pc.setLocalDescription(o);
      push(ref(db,`rooms/${roomId}/webrtc`),{
        from: clientId, to: peerId, sdp: o
      });
    });
  }
}

// --- 15) Handle incoming ---
async function handleSignal({from,to,sdp,candidate}){
  if(to!==clientId) return;
  if(!peers[from]) createPeerConnection(from,false);
  const pc = peers[from].pc;
  if(sdp){
    await pc.setRemoteDescription(sdp);
    if(sdp.type==='offer'){
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      push(ref(db,`rooms/${roomId}/webrtc`),{
        from: clientId, to: from, sdp: ans
      });
    }
  }
  if(candidate){
    await pc.addIceCandidate(candidate);
  }
}

// --- 16) Auto-fill ---
window.addEventListener('load', ()=>{
  const rid = getRoomIdFromURL();
  if(rid) roomInput.value = rid;
});
