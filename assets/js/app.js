// 1) Import Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, push,
         onChildAdded, onValue, onChildRemoved,
         get, remove } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// 2) Firebase config & init
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
const fbApp = initializeApp(firebaseConfig);
getAnalytics(fbApp);
const db = getDatabase(fbApp);

// 3) DOM refs & state
const E = id => document.getElementById(id);
const lobby       = E('lobby'),
      roomDiv     = E('room'),
      nickInput   = E('nickname'),
      roomInput   = E('roomIdInput'),
      btnCreate   = E('btnCreate'),
      btnJoin     = E('btnJoin'),
      roomDisp    = E('roomIdDisplay'),
      chat        = E('chat'),
      chatInput   = E('chatInput'),
      btnSend     = E('btnSend'),
      membersDiv  = E('members'),
      ownerCtrls  = E('ownerControls'),
      playBtn     = E('playBtn'),
      pauseBtn    = E('pauseBtn'),
      seekInput   = E('seekInput'),
      seekBtn     = E('seekBtn');

let nickname, roomId, isOwner = false;
const clientId = Math.random().toString(36).substr(2,8);

// 4) Create room
btnCreate.onclick = async () => {
  nickname = nickInput.value.trim();
  if (!nickname) return alert('Enter nickname');
  roomId = Math.random().toString(36).substr(2,8);
  history.replaceState(null,null, '?room='+roomId);
  isOwner = true;
  await remove(ref(db, `rooms/${roomId}`));
  await set(ref(db, `rooms/${roomId}/owner`), nickname);
  enterRoom();
};

// 5) Join room
btnJoin.onclick = async () => {
  nickname = nickInput.value.trim();
  const id = roomInput.value.trim();
  if (!nickname||!id) return alert('Enter nickname & room ID');
  roomId = id;
  history.replaceState(null,null, '?room='+roomId);
  const snap = await get(ref(db, `rooms/${roomId}/owner`));
  if (!snap.exists()) return alert('Room not found');
  isOwner = (snap.val() === nickname);
  enterRoom();
};

// 6) Enter room UI + setup
function enterRoom(){
  lobby.classList.add('d-none');
  roomDiv.classList.remove('d-none');
  roomDisp.textContent = roomId;

  // custom controls only for owner
  const evtRef = ref(db, `rooms/${roomId}/video/events`);
  if (isOwner){
    ownerCtrls.classList.remove('d-none');
    playBtn.onclick = () => {
      window.sharedVideo.play();
      push(evtRef, { type:'play',  user:nickname, time:window.sharedVideo.getCurrentTime() });
    };
    pauseBtn.onclick = () => {
      window.sharedVideo.pause();
      push(evtRef, { type:'pause', user:nickname, time:window.sharedVideo.getCurrentTime() });
    };
    seekBtn.onclick = () => {
      const t = parseFloat(seekInput.value)||0;
      window.sharedVideo.setCurrentTime(t);
      push(evtRef, { type:'seek',  user:nickname, time:t });
    };
  }

  setupChat();
  setupVideoSync(evtRef);
  setupMembers();
}

// 7) Chat logic
function setupChat(){
  const chatRef = ref(db, `rooms/${roomId}/chat`);
  onChildAdded(chatRef, snap=>{
    const {user, text} = snap.val();
    const p = document.createElement('p');
    p.innerHTML = `<strong>${user}:</strong> ${text}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });
  btnSend.onclick = () => {
    const txt = chatInput.value.trim();
    if (!txt) return;
    push(chatRef, { user:nickname, text:txt });
    chatInput.value = '';
  };
}

// 8) Video sync logic
function setupVideoSync(evtRef){
  const player = window.sharedVideo;
  onChildAdded(evtRef, snap=>{
    const {type, user, time} = snap.val();
    if (user===nickname) return;
    player.setCurrentTime(time);
    if(type==='play')  player.play();
    if(type==='pause') player.pause();
  });
}

// 9) Members list + kick
async function setupMembers(){
  const memRef = ref(db, `rooms/${roomId}/members`);
  const exist = (await get(memRef)).val()||{};
  if(Object.values(exist).some(m=>m.user===nickname)){
    alert('Nickname exists'); return location.reload();
  }
  await set(ref(db, `rooms/${roomId}/members/${clientId}`), { user:nickname });
  onChildRemoved(memRef, snap=>{
    if(snap.key===clientId){
      alert('You were kicked'); location.reload();
    }
  });
  onValue(memRef, snap=>{
    membersDiv.innerHTML = '';
    const data = snap.val()||{};
    for(const [id,obj] of Object.entries(data)){
      const el = document.createElement('div');
      el.className='list-group-item d-flex justify-content-between align-items-center';
      el.textContent = obj.user + (id===clientId?' (You)':'');
      if(isOwner && id!==clientId){
        const btn = document.createElement('button');
        btn.className='btn btn-sm btn-danger';
        btn.textContent='Kick';
        btn.onclick = ()=> remove(ref(db, `rooms/${roomId}/members/${id}`));
        el.appendChild(btn);
      }
      membersDiv.appendChild(el);
    }
  });
}

// 10) Auto-fill room ID from URL
window.addEventListener('load', ()=>{
  const rid = new URLSearchParams(location.search).get('room');
  if(rid) roomInput.value = rid;
});
