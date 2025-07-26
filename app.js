// 1) Import Firebase + WebRTC via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics }   from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import {
  getDatabase, ref, set, push,
  onChildAdded, onChildChanged, onChildRemoved, onValue,
  remove, get
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// 2) Firebase config
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

// 3) Init Firebase
const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db        = getDatabase(app);

// 4) DOM shortcuts
const E = id => document.getElementById(id);
const lobby       = E('lobby'),    roomDiv      = E('room');
const nickInput   = E('nickname'), roomInput    = E('roomIdInput');
const btnCreate   = E('btnCreate'), btnJoin      = E('btnJoin');
const roomDisp    = E('roomIdDisplay');
const video       = E('videoPlayer'), rateSelect = E('playbackRate');
const chat        = E('chat'),      chatInput    = E('chatInput'), btnSend = E('btnSend');
const membersDiv  = E('members');
const btnJoinCall = E('btnJoinCall'), btnLeaveCall = E('btnLeaveCall');
const callControls= E('callControls'), btnMic      = E('btnMic'), btnSpeaker = E('btnSpeaker');
const callMembers = E('callMembers');

// 5) State
let nickname, roomId, isOwner=false;
let localStream = null;
const peers    = {};
const clientId = Math.random().toString(36).substr(2,8);

// ICE config
const ICE_CONFIG = { iceServers: [{ urls:'stun:stun.l.google.com:19302' }] };

// Helper
function getRoomIdFromURL(){
  return new URLSearchParams(window.location.search).get('room');
}

// 6) Create room
btnCreate.onclick = async ()=>{
  nickname = nickInput.value.trim();
  if(!nickname) return alert('Nhập nickname!');
  roomId = Math.random().toString(36).substr(2,8);
  history.replaceState(null,'','?room='+roomId);
  isOwner = true;
  try{
    await remove(ref(db,`rooms/${roomId}`));
    await set(ref(db,`rooms/${roomId}/owner`),nickname);
    enterRoom();
  } catch(e){ console.error(e); alert('Không tạo được phòng'); }
};

// 7) Join room
btnJoin.onclick = async ()=>{
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if(!nickname||!id) return alert('Nhập nickname & mã phòng!');
  roomId = id;
  history.replaceState(null,'','?room='+roomId);
  await remove(ref(db,`rooms/${roomId}/webrtc`));
  const snap = await get(ref(db,`rooms/${roomId}/owner`));
  if(!snap.exists()) return alert('Phòng không tồn tại!');
  isOwner = (snap.val()===nickname);
  enterRoom();
};

// Show room UI
function enterRoom(){
  lobby.classList.add('hidden');
  roomDiv.classList.remove('hidden');
  roomDisp.textContent = roomId;
  setupChat();
  setupVideoSync();
  setupMembersAndCall();
}

// Chat
function setupChat(){
  const chatRef = ref(db,`rooms/${roomId}/chat`);
  onChildAdded(chatRef,s=>{
    const {user,text}=s.val();
    const p = document.createElement('p');
    p.innerHTML = `<strong>${user}:</strong> ${text}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });
  btnSend.onclick=()=>{
    const txt=chatInput.value.trim();
    if(!txt) return;
    push(ref(db,`rooms/${roomId}/chat`),{user:nickname,text:txt,timestamp:Date.now()});
    chatInput.value='';
  };
}

// Video sync
function setupVideoSync(){
  const evtRef = ref(db,`rooms/${roomId}/video/events`);
  onChildAdded(evtRef,s=>{
    const {type,user,time}=s.val();
    if(user===nickname) return;
    video.currentTime=time;
    if(type==='play') video.play();
    if(type==='pause') video.pause();
  });
  if(isOwner){
    video.controls=true;
    rateSelect.classList.remove('hidden');
    ['play','pause','seeked'].forEach(evt=>{
      video.addEventListener(evt,()=>{
        push(evtRef,{type:evt==='seeked'?'seek':evt,user:nickname,time:video.currentTime});
      });
    });
    rateSelect.onchange=()=>video.playbackRate=rateSelect.value;
  } else {
    video.controls=false;
  }
}

// Members & Call
async function setupMembersAndCall(){
  const memRef=ref(db,`rooms/${roomId}/members`);
  // prevent dup nickname
  const exist=(await get(memRef)).val()||{};
  if(Object.values(exist).some(m=>m.user===nickname)){
    alert('Nickname đã có người dùng!'); return window.location.reload();
  }
  await set(ref(db,`rooms/${roomId}/members/${clientId}`),{user:nickname,muted:false});
  // kick from room
  onChildRemoved(memRef,s=>{
    if(s.key===clientId){
      alert('Bạn bị kick khỏi room!'); window.location.reload();
    }
  });
  // mute
  onChildChanged(memRef,s=>{
    if(s.key===clientId && localStream){
      const muted=s.val().muted;
      localStream.getAudioTracks()[0].enabled=!muted;
      btnMic.textContent=`Mic: ${muted?'Off':'On'}`;
    }
  });
  // render members
  onValue(memRef,s=>{
    membersDiv.innerHTML='';
    const data=s.val()||{};
    Object.entries(data).forEach(([id,obj])=>{
      const d=document.createElement('div');
      d.textContent=obj.user+(id===clientId?' (Bạn)':'');
      if(obj.muted) d.style.opacity=0.5;
      if(isOwner&&id!==clientId){
        const kr=document.createElement('button');
        kr.textContent='Kick khỏi room';
        kr.onclick=()=>remove(ref(db,`rooms/${roomId}/members/${id}`));
        const kc=document.createElement('button');
        kc.textContent='Kick khỏi call';
        kc.onclick=()=>remove(ref(db,`rooms/${roomId}/callMembers/${id}`));
        d.append(' ',kr,' ',kc);
      }
      membersDiv.appendChild(d);
    });
  });

  // callMembers tracking
  const callRef=ref(db,`rooms/${roomId}/callMembers`);
  onValue(callRef,s=>{
    callMembers.innerHTML='';
    const data=s.val()||{};
    Object.entries(data).forEach(([id,obj])=>{
      const d=document.createElement('div');
      d.textContent=obj.user+(id===clientId?' (Bạn)':'');
      if(isOwner&&id!==clientId){
        const kc=document.createElement('button');
        kc.textContent='Kick khỏi call';
        kc.onclick=()=>remove(ref(db,`rooms/${roomId}/callMembers/${id}`));
        d.append(' ',kc);
      }
      callMembers.appendChild(d);
    });
  });
  // kicked from call
  onChildRemoved(callRef,s=>{
    if(s.key===clientId){
      alert('Bạn bị kick khỏi call'); leaveCall();
    }
  });

  // signaling
  const sigRef=ref(db,`rooms/${roomId}/webrtc`);
  onChildAdded(sigRef,s=>handleSignal(s.val()));

  // when new members join room, if calling, connect
  onChildAdded(memRef,s=>{
    const pid=s.key;
    if(pid!==clientId && localStream && !peers[pid]) createPeerConnection(pid,true);
  });

  btnJoinCall.onclick=()=>joinCall(callRef);
  btnLeaveCall.onclick=()=>{
    remove(ref(db,`rooms/${roomId}/callMembers/${clientId}`));
    leaveCall();
  };
}

// join call
async function joinCall(callRef){
  localStream=await navigator.mediaDevices.getUserMedia({audio:true});
  btnJoinCall.disabled=true;
  btnLeaveCall.disabled=false;
  callControls.classList.remove('hidden');
  btnMic.textContent='Mic: On';
  btnSpeaker.textContent='Speaker: On';

  await set(callRef.child(clientId),{user:nickname});

  const snap=await get(ref(db,`rooms/${roomId}/members`));
  for(let pid of Object.keys(snap.val()||{})){
    if(pid!==clientId) createPeerConnection(pid,true);
  }
}

// leave call
function leaveCall(){
  Object.values(peers).forEach(({pc,audioEl})=>{
    pc.close(); audioEl.remove();
  });
  Object.keys(peers).forEach(k=>delete peers[k]);
  localStream&&localStream.getTracks().forEach(t=>t.stop());
  localStream=null;
  btnJoinCall.disabled=false;
  btnLeaveCall.disabled=true;
  callControls.classList.add('hidden');
}

// mic toggle
btnMic.onclick=()=>{
  if(!localStream) return;
  const t=localStream.getAudioTracks()[0];
  t.enabled=!t.enabled;
  btnMic.textContent=`Mic: ${t.enabled?'On':'Off'}`;
};
// speaker toggle
btnSpeaker.onclick=()=>{
  const muted=!document.querySelector('#callMembers audio')?.muted;
  document.querySelectorAll('#callMembers audio').forEach(a=>a.muted=muted);
  btnSpeaker.textContent=`Speaker: ${muted?'Off':'On'}`;
};

// PeerConnection & signaling
function createPeerConnection(peerId,isOffer){
  if(peers[peerId]) return;
  const pc=new RTCPeerConnection(ICE_CONFIG);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  const audioEl=document.createElement('audio');
  audioEl.autoplay=true;
  audioEl.muted=false;
  pc.ontrack=ev=>{
    audioEl.srcObject=ev.streams[0];
    callMembers.appendChild(audioEl);
  };
  pc.onicecandidate=ev=>{
    if(ev.candidate){
      push(ref(db,`rooms/${roomId}/webrtc`),{from:clientId,to:peerId,candidate:ev.candidate});
    }
  };
  peers[peerId]={pc,audioEl};
  if(isOffer){
    pc.createOffer().then(o=>{
      pc.setLocalDescription(o);
      push(ref(db,`rooms/${roomId}/webrtc`),{from:clientId,to:peerId,sdp:o});
    });
  }
}

// handle incoming
async function handleSignal({from,to,sdp,candidate}){
  if(to!==clientId) return;
  if(!peers[from]) createPeerConnection(from,false);
  const pc=peers[from].pc;
  if(sdp){
    await pc.setRemoteDescription(sdp);
    if(sdp.type==='offer'){
      const ans=await pc.createAnswer();
      await pc.setLocalDescription(ans);
      push(ref(db,`rooms/${roomId}/webrtc`),{from:clientId,to:from,sdp:ans});
    }
  }
  if(candidate){
    await pc.addIceCandidate(candidate);
  }
}

// auto fill
window.addEventListener('load',()=>{
  const rid=getRoomIdFromURL();
  if(rid) roomInput.value=rid;
});
