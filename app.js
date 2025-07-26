// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore, doc, collection, setDoc, getDoc, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBvhRRIP3zyPL6htL2fgSAAhks5y6EJB7Y",
  authDomain: "rwparty-24391.firebaseapp.com",
  projectId: "rwparty-24391",
  storageBucket: "rwparty-24391.appspot.com",
  messagingSenderId: "281506397324",
  appId: "1:281506397324:web:0c5af5bdbb7eeca0588fa9",
  measurementId: "G-HX95ZF61BE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let pc;
let localStream;
let callDoc;
let offerCandidatesCol, answerCandidatesCol;
const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function joinCall(roomId) {
  document.getElementById('room').style.display = 'block';
  document.getElementById('roomIdDisplay').textContent = roomId;
  pc = new RTCPeerConnection(configuration);
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  callDoc = doc(db, 'calls', roomId);
  offerCandidatesCol = collection(callDoc, 'offerCandidates');
  answerCandidatesCol = collection(callDoc, 'answerCandidates');

  pc.onicecandidate = e => { if (e.candidate) addDoc(offerCandidatesCol, e.candidate.toJSON()); };
  pc.ontrack = e => {
    const audio = document.createElement('audio');
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await setDoc(callDoc, { offer: { type: offer.type, sdp: offer.sdp } });

  onSnapshot(callDoc, snap => {
    const data = snap.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  onSnapshot(answerCandidatesCol, snap => {
    snap.docChanges().forEach(c => {
      if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));
    });
  });
}

async function answerCall(roomId) {
  document.getElementById('room').style.display = 'block';
  document.getElementById('roomIdDisplay').textContent = roomId;
  pc = new RTCPeerConnection(configuration);
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  callDoc = doc(db, 'calls', roomId);
  offerCandidatesCol = collection(callDoc, 'offerCandidates');
  answerCandidatesCol = collection(callDoc, 'answerCandidates');

  pc.onicecandidate = e => { if (e.candidate) addDoc(answerCandidatesCol, e.candidate.toJSON()); };
  pc.ontrack = e => {
    const audio = document.createElement('audio');
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  const roomSnap = await getDoc(callDoc);
  const { offer } = roomSnap.data();
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await setDoc(callDoc, { answer: { type: answer.type, sdp: answer.sdp } }, { merge: true });

  onSnapshot(offerCandidatesCol, snap => {
    snap.docChanges().forEach(c => {
      if (c.type === 'added') pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));
    });
  });
}

function leaveCall() {
  localStream.getTracks().forEach(t => t.stop());
  pc.close();
  document.getElementById('room').style.display = 'none';
}

document.getElementById('btnJoinCall').onclick = async () => {
  const roomId = prompt('Nhập mã phòng call');
  const docSnap = await getDoc(doc(db, 'calls', roomId));
  if (docSnap.exists()) await answerCall(roomId);
  else await joinCall(roomId);
  document.getElementById('btnJoinCall').disabled = true;
  document.getElementById('btnLeaveCall').disabled = false;
};

document.getElementById('btnLeaveCall').onclick = () => leaveCall();
