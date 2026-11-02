import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,onAuthStateChanged,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';

const firebaseConfig={
  projectId:'jack-speaksmart-ai-2026',
  appId:'1:231307093860:web:d8055d0ad401969527bc71',
  apiKey:'AIzaSyB_Xha4nkDYa8fEGjp9IKquMRUnwoYP6rk',
  authDomain:'jack-speaksmart-ai-2026.firebaseapp.com',
  storageBucket:'jack-speaksmart-ai-2026.firebasestorage.app',
  messagingSenderId:'231307093860'
};
const auth=getAuth(initializeApp(firebaseConfig));
const button=document.querySelector('#auth-button');
let currentUser=null;
window.jackAuth={
  isSignedIn:()=>Boolean(currentUser),
  getToken:async()=>currentUser?currentUser.getIdToken():null
};
onAuthStateChanged(auth,user=>{
  currentUser=user;
  button.textContent=user?`Sign out · ${user.displayName||'Learner'}`:'Sign in with Google';
  window.jackSetLearner?.(user?.uid||null);
  window.jackAuthChanged?.();
});
button.addEventListener('click',async()=>{
  button.disabled=true;
  try{
    if(currentUser) await signOut(auth);
    else await signInWithPopup(auth,new GoogleAuthProvider());
  }catch(error){
    const message=error.code==='auth/operation-not-allowed'
      ?'Google sign-in must be enabled in Firebase Console before it can be used.'
      :error.code==='auth/popup-closed-by-user'?'Sign-in was cancelled.':`Sign-in failed: ${error.message}`;
    document.querySelector('#notice').textContent=message;
  }finally{button.disabled=false}
});
