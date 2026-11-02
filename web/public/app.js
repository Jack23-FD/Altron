const MODEL='qwen3:1.7b';
let API='';
const $=s=>document.querySelector(s);
const initial={messages:[],grammar:[],translations:[],attempts:[],quizIndex:{Grammar:0,Vocabulary:0},topic:'Everyday life',autoSpeak:true,voiceSpeed:0.9};
let storageKey='jack-speaksmart-v1',state;function loadState(){try{state={...structuredClone(initial),...JSON.parse(localStorage.getItem(storageKey)||'{}')}}catch{state=structuredClone(initial)}}loadState();
let questions=[],busy=false,voiceAvailable=false,transcribing=false;
let grammarChallenge={question:null,answered:false,choice:null,thread:[],thinking:false};
function save(){localStorage.setItem(storageKey,JSON.stringify(state))}
function notice(message){$('#notice').textContent=message||''}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node}
function show(page){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===page));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#page-title').textContent={practice:'Conversation practice',translate:'Tamil to English',grammar:'Grammar lab','grammar-chat':'Grammar chat',quiz:'Quick quiz',progress:'Your progress'}[page];notice('');if(page==='progress'){renderProgress();renderDailyGoal()}if(page==='grammar-chat')renderGrammarChallenge()}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>show(b.dataset.page)));
async function bridgeRequest(path,options={}){
  // Read the published laptop address before every request.
  await loadBridgeConfig().catch(()=>{});
  if(!API)throw new Error('Laptop AI is offline. Keep the ALTRON internet launcher open on the laptop.');
  const token=await window.jackAuth?.getToken();
  if(!token)throw new Error('Sign in with Google first.');
  const request={...options,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}};
  const address=API;
  let response;
  try{response=await fetch(address+path,request)}
  catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError')throw new Error('The laptop took too long to answer. Try a shorter recording or sentence.');
    await loadBridgeConfig().catch(()=>{});
    if(API&&API!==address){
      try{response=await fetch(API+path,request)}catch{throw new Error('Laptop connection lost. Keep the ALTRON launcher open, then try again.')}
    }else throw new Error('Laptop connection lost. Keep the ALTRON launcher open, then try again.');
  }
  if([502,503,530].includes(response.status)){
    await loadBridgeConfig().catch(()=>{});
    if(API&&API!==address){
      try{response=await fetch(API+path,request)}catch{throw new Error('Laptop connection lost. Keep the ALTRON launcher open, then try again.')}
    }
  }
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===429)throw new Error(body.error||'ALTRON is busy. Wait a minute and try again.');
    if(response.status===503&&body.error)throw new Error(body.error);
    if([502,503,530].includes(response.status))throw new Error('Laptop tunnel is offline. Keep the ALTRON launcher open and try again after it reconnects.');
    throw new Error(body.error||`Laptop AI returned ${response.status}.`);
  }
  return body;
}
async function callOllama(messages){const body=await bridgeRequest('/api/chat',{method:'POST',body:JSON.stringify({messages}),signal:AbortSignal.timeout(65000)});return JSON.parse(body.message.content)}
function refreshChallengeIfOpen(){if($('#grammar-chat')?.classList.contains('active'))renderGrammarChallenge()}
async function loadBridgeConfig(){
  const response=await fetch('bridge-config.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Laptop bridge configuration unavailable.');
  const config=await response.json();
  API=typeof config.apiBase==='string'&&/^https:\/\/[a-z0-9.-]+$/i.test(config.apiBase)?config.apiBase:'';
}
function syncVoiceButtons(){
  const disabled=!voiceAvailable||transcribing||recorder?.state==='recording';
  $('#voice-start').disabled=disabled;
  $('#translate-voice-start').disabled=disabled;
  document.querySelectorAll('.quiz-voice-start').forEach(button=>{button.disabled=disabled||button.dataset.locked==='true'});
}
async function checkModel(){
  const dot=$('#status-dot'),label=$('#model-status');dot.classList.remove('ready');
  $('#chat-send').disabled=true;$('#grammar-send').disabled=true;$('#translate-send').disabled=true;
  voiceAvailable=false;syncVoiceButtons();
  if(!window.jackAuth?.isSignedIn()){label.textContent='Sign in for AI';$('#voice-status').textContent='Sign in with Google to talk with ALTRON.';refreshChallengeIfOpen();return}
  label.textContent='Connecting to laptop…';
  try{
    const data=await bridgeRequest('/api/status',{signal:AbortSignal.timeout(8000)});
    if(!data.ready){label.textContent='Model not downloaded';$('#voice-status').textContent='Download the Qwen model on the laptop first.';refreshChallengeIfOpen();return}
    dot.classList.add('ready');label.textContent='AI ready';
    $('#chat-send').disabled=false;$('#grammar-send').disabled=false;$('#translate-send').disabled=false;notice('');
    voiceAvailable=!!data.voiceReady;syncVoiceButtons();
    $('#voice-status').textContent=data.voiceReady?'Ready. Tap Start speaking and allow microphone access.':'Voice setup needed on the laptop. Run setup_voice.bat once.';
  }catch{label.textContent='Laptop AI offline';$('#voice-status').textContent='Laptop AI is offline. Start ALTRON on the laptop.';notice('ALTRON AI needs the laptop server running. Quiz still works without it.')}
  refreshChallengeIfOpen();
}
$('#refresh-model').addEventListener('click',checkModel);
function speakEnglish(text){
  if(!('speechSynthesis' in window)){notice('This browser cannot play speech. Try Chrome or Edge.');return}
  speechSynthesis.cancel();
  const speech=new SpeechSynthesisUtterance(text.slice(0,500));
  speech.lang='en-US';speech.rate=Number(state.voiceSpeed)||0.9;
  const voices=speechSynthesis.getVoices();
  speech.voice=voices.find(v=>v.lang?.toLowerCase().startsWith('en')&&v.localService)||voices.find(v=>v.lang?.toLowerCase().startsWith('en'))||null;
  speech.onerror=event=>{if(!['interrupted','canceled'].includes(event.error))notice('Voice playback could not start. Tap Hear again or check your browser sound.');};
  speechSynthesis.speak(speech);
}
function syncVoiceControls(){
  $('#voice-auto').checked=state.autoSpeak!==false;
  $('#voice-speed').value=String(state.voiceSpeed||0.9);
}
syncVoiceControls();
$('#voice-auto').addEventListener('change',e=>{state.autoSpeak=e.target.checked;save()});
$('#voice-speed').addEventListener('change',e=>{state.voiceSpeed=Number(e.target.value);save()});
const easyQuestions={
  'Everyday life':['How are you today?','What did you eat today?','What do you like to do in the evening?'],
  College:['What did you study today?','Which subject do you like?','Tell me about a friend at college.'],
  'Job interview':['What are you good at?','Why do you want this job?','Tell me about a project you made.'],
  Travel:['Where would you like to go?','How do you travel to college?','What did you see on your last trip?'],
  Shopping:['What would you like to buy?','How much does it cost?','What is your favourite shop?'],
  'Free conversation':['What made you happy today?','What would you like to learn?','Tell me about your family.']
};
let lastEasyQuestion='';
$('#voice-question').addEventListener('click',()=>{
  const pool=(easyQuestions[state.topic]||easyQuestions['Everyday life']).filter(q=>q!==lastEasyQuestion);
  lastEasyQuestion=pool[Math.floor(Math.random()*pool.length)];
  $('#teacher-prompt').textContent='ALTRON asks: '+lastEasyQuestion;
  speakEnglish(lastEasyQuestion);
});
$('#voice-example').addEventListener('click',()=>speakEnglish('Hello! My name is ALTRON. How are you today?'));
$('#voice-stop-speech').addEventListener('click',()=>window.speechSynthesis?.cancel());
document.querySelectorAll('[data-starter]').forEach(button=>button.addEventListener('click',()=>{
  $('#chat-input').value=button.dataset.starter;$('#chat-input').focus();
}));
let recorder=null,recordingStream=null,recordingTimer=null,recordingDeadline=null,recordingChunks=[];
function stopRecording(){if(recorder?.state==='recording')recorder.stop()}
async function startRecording({start,stop,status,language='en',onText,card=null,timer=null}){
  if(busy||transcribing||!voiceAvailable||recorder?.state==='recording')return;
  if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia){status.textContent='This browser cannot record audio. Try updated Chrome or Edge.';return}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
  if(!mime){status.textContent='This browser audio format is not supported. Try Chrome or Edge.';return}
  try{
    window.speechSynthesis?.cancel();
    recordingStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    recordingChunks=[];recorder=new MediaRecorder(recordingStream,{mimeType:mime,audioBitsPerSecond:64000});
    recorder.ondataavailable=e=>{if(e.data.size)recordingChunks.push(e.data)};
    recorder.onerror=()=>{status.textContent='Recording stopped unexpectedly. Please try again.'};
    recorder.onstop=async()=>{
      clearInterval(recordingTimer);clearTimeout(recordingDeadline);
      recordingStream?.getTracks().forEach(track=>track.stop());recordingStream=null;
      stop.disabled=true;start.disabled=true;card?.classList.remove('recording');
      const audio=new Blob(recordingChunks,{type:recorder.mimeType||mime});recorder=null;
      if(audio.size<1000){status.textContent='No speech was captured. Try again.';syncVoiceButtons();return}
      if(audio.size>1500000){status.textContent='Recording was too long. Try one short sentence.';syncVoiceButtons();return}
      transcribing=true;syncVoiceButtons();status.textContent='ALTRON is turning your recording into words. This may take up to a minute…';
      try{
        const result=await bridgeRequest('/api/transcribe',{method:'POST',body:audio,
          headers:{'Content-Type':audio.type,'X-Speech-Language':language},signal:AbortSignal.timeout(100000)});
        onText(result.text);
        status.textContent='Check the words ALTRON heard, then send your answer.';
      }catch(error){status.textContent='Could not understand this recording: '+error.message}
      finally{transcribing=false;syncVoiceButtons()}
    };
    recorder.start();card?.classList.add('recording');syncVoiceButtons();stop.disabled=false;
    status.textContent=`Recording ${language==='ta'?'Tamil':'English'}… Speak one short sentence, then tap Stop.`;
    const started=Date.now();
    recordingTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);if(timer)timer.textContent=`00:${String(seconds).padStart(2,'0')}`},250);
    recordingDeadline=setTimeout(stopRecording,20000);
  }catch(error){recordingStream?.getTracks().forEach(track=>track.stop());recordingStream=null;syncVoiceButtons();status.textContent=error.name==='NotAllowedError'?'Microphone access was denied. Allow it in the browser to speak with ALTRON.':'Microphone unavailable. You can type an answer instead.'}
}
$('#voice-stop').addEventListener('click',stopRecording);
$('#voice-start').addEventListener('click',()=>startRecording({start:$('#voice-start'),stop:$('#voice-stop'),status:$('#voice-status'),card:$('.voice-card'),timer:$('#voice-timer'),onText:text=>{$('#chat-input').value=text;$('#chat-input').focus()}}));
$('#translate-voice-stop').addEventListener('click',stopRecording);
$('#translate-voice-start').addEventListener('click',()=>startRecording({start:$('#translate-voice-start'),stop:$('#translate-voice-stop'),status:$('#translate-voice-status'),language:'ta',onText:text=>{$('#translate-input').value=text;$('#translate-input').focus()}}));
function renderMessages(){
  const box=$('#messages');box.replaceChildren();
  if(!state.messages.length){box.append(el('div','empty','Start with a sentence like “I want to tell you about my day.”'));return}
  for(const m of state.messages){
    const bubble=el('div','bubble '+m.role,m.content);
    if(m.role==='assistant'){const listen=el('button','listen-button','▶ Listen to ALTRON');listen.type='button';listen.onclick=()=>speakEnglish(m.content);bubble.append(listen)}
    box.append(bubble);
    if(m.role==='assistant'&&(m.correction||m.explanation||m.tip)){
      const fb=el('div','feedback');
      if(m.correction){fb.append(el('div','',`Better way: ${m.correction}`));const listen=el('button','listen-button','▶ Hear the correct sentence');listen.type='button';listen.onclick=()=>speakEnglish(m.correction);fb.append(listen)}
      if(m.explanation)fb.append(el('div','',`Why: ${m.explanation}`));
      if(m.tip)fb.append(el('div','',`Try this: ${m.tip}`));
      box.append(fb);
    }
  }
  box.scrollTop=box.scrollHeight;
}
$('#topic').value=state.topic;$('#topic').addEventListener('change',e=>{state.topic=e.target.value;save();$('#teacher-prompt').textContent='Need an idea? Ask ALTRON an easy question, then answer by voice.'});
$('#new-chat').addEventListener('click',()=>{if(!confirm('Start a new conversation? Your current chat stays in this browser until you clear history.'))return;state.messages=[];save();renderMessages()});
$('#chat-form').addEventListener('submit',async e=>{
  e.preventDefault();const input=$('#chat-input'),text=input.value.trim();if(!text||busy)return;
  busy=true;$('#chat-send').disabled=true;notice('ALTRON is thinking…');
  const history=state.messages.slice(-8).map(m=>({role:m.role,content:m.content}));
  const system=`You are ALTRON, a kind English speaking teacher for a beginner. Topic: ${state.topic}. Use short, easy English words. Return only a JSON object with string keys reply, correction, explanation, tip. In reply, respond to the learner's meaning in 1-2 short sentences and ask exactly one easy question. If the latest learner sentence has a grammar mistake, correction rewrites only that sentence from the learner's point of view, keeping its meaning and pronouns; explanation names one actual change in simple words. If the sentence is already natural, correction and explanation are empty strings. Never invent a mistake or change the learner's meaning. Tip is one short example phrase to try next. Example input: Yesterday I go to the market. Example output: {"reply":"That sounds nice! What did you buy?","correction":"Yesterday I went to the market.","explanation":"Use went for an action in the past.","tip":"I bought some fruit."}`;
  try{
    const result=await callOllama([{role:'system',content:system},...history,{role:'user',content:text}]);
    if(typeof result.reply!=='string'||!result.reply.trim())throw Error('The model returned an incomplete answer. Try again.');
    state.messages.push({role:'user',content:text},{role:'assistant',content:result.reply,
      correction:String(result.correction||''),explanation:String(result.explanation||''),tip:String(result.tip||'')});
    save();input.value='';renderMessages();notice('');
    if(state.autoSpeak!==false)speakEnglish(result.reply);
  }catch(err){notice('Could not reach laptop AI: '+err.message)}
  finally{busy=false;$('#chat-send').disabled=!$('#status-dot').classList.contains('ready')}
});
$('#translate-sample').addEventListener('click',()=>{$('#translate-input').value='yesterday saptiya';$('#translate-input').focus()});
function renderTranslation(result){
  const box=$('#translate-result');box.replaceChildren();if(!result)return;
  const panel=el('div','result translation-result');
  panel.append(el('p','muted','Say it in English'),el('strong','english-line',result.english));
  const listen=el('button','primary','▶ Hear the correct English');listen.type='button';
  listen.onclick=()=>speakEnglish(result.english);panel.append(listen);
  if(result.why)panel.append(el('p','',`Why: ${result.why}`));
  if(result.why_tamil)panel.append(el('p','tamil-help',result.why_tamil));
  box.append(panel);
}
$('#translate-form').addEventListener('submit',async event=>{
  event.preventDefault();const source=$('#translate-input').value.trim();if(!source||busy)return;
  busy=true;$('#translate-send').disabled=true;notice('ALTRON is finding the English sentence…');
  const system='You are a kind Tamil-English teacher for beginners. The learner may type Tamil script, Tanglish (Tamil words in Latin letters), or imperfect English. Convert the learner message into ONE natural everyday English sentence or question. Keep its meaning, person, and tense. Do not answer the question. Return only JSON with string keys english, why, why_tamil. why is one short simple English grammar note. why_tamil is one short Tamil-script explanation. Example input: yesterday saptiya. Example output: {"english":"Did you eat yesterday?","why":"Use Did you ...? for a past-time question.","why_tamil":"கடந்தகால கேள்விக்கு Did you பயன்படுத்தவும்."}';
  try{
    const answer=await callOllama([{role:'system',content:system},{role:'user',content:source}]);
    if(typeof answer.english!=='string'||answer.english.length<3||answer.english.length>300||!/[a-z]/i.test(answer.english)||/[\u0b80-\u0bff]/.test(answer.english))throw Error('ALTRON could not form a clear English sentence. Try a shorter phrase.');
    const result={original:source,english:answer.english.trim(),why:String(answer.why||'').slice(0,300),why_tamil:String(answer.why_tamil||'').slice(0,300),at:new Date().toISOString()};
    state.translations.unshift(result);save();renderTranslation(result);notice('');
    if(state.autoSpeak!==false)speakEnglish(result.english);
  }catch(error){notice('Could not translate: '+error.message)}
  finally{busy=false;$('#translate-send').disabled=!$('#status-dot').classList.contains('ready')}
});
$('#grammar-form').addEventListener('submit',async e=>{e.preventDefault();const text=$('#grammar-input').value.trim();if(!text||busy)return;busy=true;$('#grammar-send').disabled=true;notice('Checking grammar…');try{const result=await callOllama([{role:'system',content:'You are a patient English grammar teacher. Return ONLY JSON with corrected (string), explanation (short string), examples (array of exactly two short strings). Keep the meaning and pronouns. If corrected differs from input, explain the actual change and never say it was already correct.'},{role:'user',content:text}]);if(!result.corrected||!result.explanation||!Array.isArray(result.examples))throw Error('The model returned an incomplete grammar answer.');state.grammar.unshift({original:text,corrected:result.corrected,explanation:result.explanation,examples:result.examples,at:new Date().toISOString()});save();renderGrammar(result);notice('')}catch(err){notice('Could not check grammar: '+err.message)}finally{busy=false;$('#grammar-send').disabled=!$('#status-dot').classList.contains('ready')}});
function renderGrammar(r){const box=$('#grammar-result');box.replaceChildren();if(!r)return;const panel=el('div','result');panel.append(el('strong','',r.corrected),el('p','',r.explanation));for(const example of r.examples||[])panel.append(el('p','',`• ${example}`));box.append(panel)}
const wordSeeds=[
  ['generous','willing to give or share freely'],
  ['fragile','easily broken or damaged'],
  ['grateful','feeling thankful'],
  ['cautious','careful to avoid danger or mistakes'],
  ['diligent','working carefully and consistently'],
  ['enormous','very large in size'],
  ['brief','lasting only a short time'],
  ['vivid','bright, clear, and detailed'],
  ['ancient','belonging to a very long time ago'],
  ['reliable','able to be trusted or depended on'],
  ['curious','eager to know or learn something'],
  ['peaceful','quiet and free from conflict']
];
let wordBank=wordSeeds,wordBankFromApi=false,lastWord='',wordRequest=0,aiRequest=0,lastAiSeed='';
function shuffle(items){
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}
  return copy;
}
$('#quiz-category').addEventListener('change',()=>{wordRequest++;aiRequest++;renderQuiz()});
function parseSpokenChoice(text,options){
  const spoken=text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!spoken)return -1;
  const letter=spoken.match(/^(?:option |answer |letter )?([abcd])$/)||spoken.match(/^(?:my answer is |i choose |i chose )(?:option )?([abcd])$/);
  if(letter)return 'abcd'.indexOf(letter[1]);
  const ordinals=['one','two','three','four'];
  const asNumber=spoken.match(/^(?:option |number )?([1-4])$/);
  if(asNumber)return Number(asNumber[1])-1;
  const ordinal=ordinals.findIndex(word=>spoken===word||spoken===`option ${word}`);
  if(ordinal>=0)return ordinal;
  const normalize=value=>value.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  return options.findIndex(option=>{const value=normalize(option);return spoken===value||spoken===`the answer is ${value}`||spoken===`i choose ${value}`});
}
function addVoiceAnswer(box,options){
  const panel=el('div','quiz-voice');
  const label=el('label','','Or answer by voice · A, B, C, D, or the full answer');
  const input=el('input');input.type='text';input.maxLength=160;input.placeholder='What ALTRON heard…';input.setAttribute('aria-label','Spoken quiz answer');
  const start=el('button','ghost quiz-voice-start','🎙 Speak answer');start.type='button';start.disabled=!voiceAvailable;
  const stop=el('button','ghost','■ Stop');stop.type='button';stop.disabled=true;
  const status=el('p','muted','Check the transcript before answering.');status.setAttribute('role','status');
  start.onclick=()=>startRecording({start,stop,status,language:'en',onText:text=>{if(box.isConnected){input.value=text;input.focus()}}});
  stop.onclick=stopRecording;
  panel.append(label,input,start,stop,status);box.append(panel);
  return {input,start,stop};
}
function showQuizQuestion(question,label,nextQuestion){
  const box=$('#quiz-content');
  box.replaceChildren(el('p','muted',label),el('div','question',question.question));
  const hear=el('button','ghost','▶ Hear question');hear.type='button';
  hear.onclick=()=>speakEnglish(`${question.question} ${question.options.map((option,i)=>`${'ABCD'[i]}, ${option}`).join('. ')}`);
  box.append(hear);
  question.options.forEach((answer,index)=>{
    const row=el('label','option'),radio=el('input');
    radio.type='radio';radio.name='answer';radio.value=String(index);
    row.append(radio,document.createTextNode(`${'ABCD'[index]}. ${answer}`));box.append(row);
  });
  const voice=addVoiceAnswer(box,question.options);
  const actions=el('div','quiz-actions'),check=el('button','primary','Check answer');
  check.onclick=()=>{
    if(recorder?.state==='recording'||transcribing){notice('Stop recording and check the words ALTRON heard first.');return}
    const chosen=box.querySelector('input[name="answer"]:checked');
    const answer=chosen?Number(chosen.value):parseSpokenChoice(voice.input.value,question.options);
    if(answer<0){notice('Choose an option or say its letter or full answer. Check the words ALTRON heard.');return}
    const correct=answer===question.answer;
    state.attempts.unshift({id:question.id,correct,at:new Date().toISOString()});save();
    box.append(el('div','quiz-feedback'+(correct?'':' bad'),
      `${correct?'Correct!':'Not quite. Correct answer: '+question.options[question.answer]} ${question.explanation}`));
    check.disabled=true;voice.input.disabled=true;voice.start.dataset.locked='true';voice.start.disabled=true;voice.stop.disabled=true;
    box.querySelectorAll('input[name="answer"]').forEach(input=>{input.disabled=true});
    const next=el('button','ghost',question.id.startsWith('WORD:')?'Another random question':question.id.startsWith('AI:')?'Another AI question':'Next question');
    next.onclick=()=>{notice('');nextQuestion()};actions.append(next);
  };
  actions.append(check);box.append(actions);
  if(question.source){const source=el('a','muted','Word meaning from Free Dictionary API ↗');source.href='https://dictionaryapi.dev/';source.target='_blank';source.rel='noopener';box.append(source)}
  if(question.fallback)box.append(el('p','muted','Using saved word meanings while live lookup is unavailable.'));
}
async function loadRandomWordQuestion(){
  const request=++wordRequest,box=$('#quiz-content');
  box.replaceChildren(el('p','muted','Getting a random English word…'));
  const choices=wordBank.filter(([word])=>word!==lastWord);
  const [word,savedMeaning]=choices[Math.floor(Math.random()*choices.length)];
  lastWord=word;
  let meaning=savedMeaning,live=false;
  try{
    const response=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      {signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Dictionary unavailable');
    const entries=await response.json();
    const definitions=entries.flatMap(entry=>(entry.meanings||[])
      .filter(item=>item.partOfSpeech==='adjective').flatMap(item=>item.definitions||[]));
    const first=definitions.find(item=>typeof item.definition==='string'&&item.definition.length>=10&&item.definition.length<=180);
    if(!first)throw Error('No suitable definition');
    meaning=first.definition;live=true;
  }catch{/* Saved word meanings keep the challenge usable when live lookup fails. */}
  if(request!==wordRequest||$('#quiz-category').value!=='Random word challenge')return;
  const alternatives=shuffle(wordBank.filter(([other])=>other!==word)).slice(0,3).map(([,definition])=>definition);
  const answer=Math.floor(Math.random()*4);
  alternatives.splice(answer,0,meaning);
  showQuizQuestion({id:`WORD:${word}`,question:`What does “${word}” mean?`,options:alternatives,
    answer,explanation:`“${word}” means ${meaning}`,source:live||wordBankFromApi,fallback:!live},
    'Random word challenge · choose the best meaning',loadRandomWordQuestion);
}
const aiQuizSeeds=[
  {id:'went',frame:'Yesterday, I ___ to the {place}.',places:['library','park','museum','market','cinema','beach'],fallback:'library',forms:['go','went','goes','going'],correct:'went',explanation:'Use “went” for a completed action yesterday.'},
  {id:'goes',frame:'Every day, she ___ to the {place}.',places:['market','library','park','gym','office','beach'],fallback:'market',forms:['go','went','goes','going'],correct:'goes',explanation:'Use “goes” with “she” for a regular action.'},
  {id:'ate',frame:'Yesterday, we ___ lunch at the {place}.',places:['cafe','restaurant','canteen','diner'],fallback:'cafe',forms:['eat','ate','eats','eating'],correct:'ate',explanation:'Use “ate”, the past tense of “eat”, for yesterday.'},
  {id:'bought',frame:'Last week, I ___ a book at the {place}.',places:['bookstore','bookshop','market','shop'],fallback:'bookstore',forms:['buy','bought','buys','buying'],correct:'bought',explanation:'Use “bought”, the past tense of “buy”, for last week.'}
];
async function loadAiQuiz(){
  const request=++aiRequest,box=$('#quiz-content');
  box.replaceChildren(el('p','muted','ALTRON is making a new grammar situation…'));
  const choices=aiQuizSeeds.filter(seed=>seed.id!==lastAiSeed);
  const seed=choices[Math.floor(Math.random()*choices.length)];lastAiSeed=seed.id;
  let place=seed.fallback,fromOllama=false;
  if($('#status-dot').classList.contains('ready')){
    try{
      const result=await callOllama([{role:'system',content:'Choose one suitable place from the user list for a beginner grammar question. Return only JSON with one key, place. Use the exact lowercase word from the list and no explanation.'},
        {role:'user',content:`Choose one place from: ${seed.places.join(', ')}. Avoid ${seed.fallback}.`}]);
      const candidate=String(result.place||'').trim().toLowerCase();
      if(seed.places.includes(candidate)){
        place=candidate;fromOllama=true;
      }
    }catch{/* A checked fallback keeps the quiz usable when Ollama is busy. */}
  }
  if(request!==aiRequest||$('#quiz-category').value!=='AI grammar challenge')return;
  const options=shuffle(seed.forms),answer=options.indexOf(seed.correct);
  const question={id:`AI:${seed.id}:${Date.now()}`,question:seed.frame.replace('{place}',place),
    options,answer,explanation:seed.explanation};
  showQuizQuestion(question,fromOllama?'Ollama made the setting · grammar answer checked locally':'Checked question · Ollama unavailable',loadAiQuiz);
}
function renderQuiz(){
  const category=$('#quiz-category').value,box=$('#quiz-content');
  if(category==='Random word challenge'){loadRandomWordQuestion();return}
  if(category==='AI grammar challenge'){loadAiQuiz();return}
  const group=questions.filter(q=>q.category===category);
  box.replaceChildren();
  if(!group.length){box.append(el('p','muted','Questions could not be loaded.'));return}
  const index=state.quizIndex[category]||0;
  if(index>=group.length){
    box.append(el('p','question','Set complete — well done!'));
    const again=el('button','primary','Practice again');
    again.onclick=()=>{state.quizIndex[category]=0;save();renderQuiz()};box.append(again);return;
  }
  showQuizQuestion(group[index],`Question ${index+1} of ${group.length}`,()=>{
    state.quizIndex[category]=index+1;save();renderQuiz();
  });
}
function nextGrammarChallenge(){
  const previous=grammarChallenge.question?.id;
  const pool=questions.filter(q=>q.category==='Grammar'&&q.id!==previous);
  grammarChallenge={question:pool[Math.floor(Math.random()*pool.length)]||null,
    answered:false,choice:null,thread:[],thinking:false};
  renderGrammarChallenge();
}
function grammarSystem(q){
  return `You are ALTRON, a friendly beginner English grammar tutor. A teacher checked this question and answer. Answer in at most two short sentences. Use only the checked explanation and example. Do not invent another rule or example. If asked for an example, repeat the checked example exactly. Return only JSON with one string key: reply. Question: ${q.question}. Options: ${JSON.stringify(q.options)}. Correct answer: ${q.options[q.answer]}. Checked explanation: ${q.explanation}. Checked example: ${q.example||q.options[q.answer]}.`;
}
function renderGrammarChallenge(){
  const box=$('#grammar-chat-content');if(!box)return;
  if(!grammarChallenge.question){
    const first=questions.filter(q=>q.category==='Grammar');
    if(!first.length){box.replaceChildren(el('p','muted','Grammar questions could not be loaded.'));return}
    grammarChallenge.question=first[Math.floor(Math.random()*first.length)];
  }
  const current=grammarChallenge,q=current.question;
  box.replaceChildren();
  const next=el('button','ghost','Ask another random question');
  next.type='button';next.disabled=current.thinking;next.onclick=nextGrammarChallenge;box.append(next);
  box.append(el('p','question',q.question));
  const hearQuestion=el('button','ghost','▶ Hear question');hearQuestion.type='button';
  hearQuestion.onclick=()=>speakEnglish(`${q.question} ${q.options.map((option,i)=>`${'ABCD'[i]}, ${option}`).join('. ')}`);
  box.append(hearQuestion);
  if(!current.answered){
    q.options.forEach((option,index)=>{
      const row=el('label','option'),radio=el('input');
      radio.type='radio';radio.name='grammar-chat-answer';radio.value=String(index);
      row.append(radio,document.createTextNode(`${'ABCD'[index]}. ${option}`));box.append(row);
    });
    const voice=addVoiceAnswer(box,q.options);
    const answer=el('button','primary','Answer ALTRON');
    answer.type='button';answer.onclick=async()=>{
      if(recorder?.state==='recording'||transcribing){notice('Stop recording and check your answer first.');return}
      const selected=box.querySelector('input[name="grammar-chat-answer"]:checked');
      const choice=selected?Number(selected.value):parseSpokenChoice(voice.input.value,q.options);
      if(choice<0){notice('Choose an option or say its letter or full answer.');return}
      current.choice=choice;current.answered=true;
      const correct=current.choice===q.answer;
      state.attempts.unshift({id:q.id,correct,at:new Date().toISOString()});save();
      notice('');renderGrammarChallenge();
      if(!$('#status-dot').classList.contains('ready'))return;
      const prompt=`I chose ${q.options[current.choice]}. Please explain this grammar rule simply.`;
      current.thinking=true;renderGrammarChallenge();
      try{
        const reply=await callOllama([{role:'system',content:grammarSystem(q)},{role:'user',content:prompt}]);
        if(grammarChallenge!==current)return;
        if(typeof reply.reply!=='string'||!reply.reply.trim())throw Error('ALTRON returned an empty reply.');
        current.thread=[{role:'user',content:prompt},{role:'assistant',content:reply.reply}];
        if(state.autoSpeak!==false)speakEnglish(reply.reply);
      }catch(error){if(grammarChallenge===current)notice('Checked answer saved; AI reply unavailable: '+error.message)}
      finally{if(grammarChallenge===current){current.thinking=false;renderGrammarChallenge()}}
    };
    box.append(answer);return;
  }
  const correct=current.choice===q.answer;
  const checked=el('div','quiz-feedback'+(correct?'':' bad'),
    `${correct?'Correct!':'Correct answer: '+q.options[q.answer]} ${q.explanation}`);
  const hearRule=el('button','listen-button','▶ Hear the rule');hearRule.type='button';
  hearRule.onclick=()=>speakEnglish(`${q.options[q.answer]}. ${q.explanation}`);checked.append(hearRule);box.append(checked);
  if(q.example)box.append(el('p','muted',`Checked example: ${q.example}`));
  for(const [index,message] of current.thread.entries()){
    if(index===0)continue;
    const bubble=el('div','bubble '+message.role,message.content);
    if(message.role==='assistant'){const hear=el('button','listen-button','▶ Listen to ALTRON');hear.type='button';hear.onclick=()=>speakEnglish(message.content);bubble.append(hear)}
    box.append(bubble);
  }
  if(current.thinking){box.append(el('p','muted','ALTRON is thinking…'));return}
  if(!$('#status-dot').classList.contains('ready')){
    box.append(el('p','muted','The checked answer works offline. Sign in and connect the laptop to chat with ALTRON.'));return;
  }
  const form=el('form','grammar-followup'),label=el('label','','Ask ALTRON a follow-up');
  const input=el('input');input.type='text';input.maxLength=500;input.placeholder='Ask about this grammar rule…';
  input.setAttribute('aria-label','Ask ALTRON a follow-up');
  const ask=el('button','primary','Ask ALTRON');ask.type='submit';
  form.append(label,input,ask);
  form.onsubmit=async event=>{
    event.preventDefault();const text=input.value.trim();if(!text)return;
    if(/\bexamples?\b/i.test(text)&&q.example){
      current.thread.push({role:'user',content:text},{role:'assistant',content:`Checked example: ${q.example}`});
      notice('');renderGrammarChallenge();return;
    }
    current.thinking=true;renderGrammarChallenge();
    try{
      const reply=await callOllama([{role:'system',content:grammarSystem(q)},
        ...current.thread.slice(-6),{role:'user',content:text}]);
      if(grammarChallenge!==current)return;
      if(typeof reply.reply!=='string'||!reply.reply.trim())throw Error('ALTRON returned an empty reply.');
      current.thread.push({role:'user',content:text},{role:'assistant',content:reply.reply});
      if(state.autoSpeak!==false)speakEnglish(reply.reply);
      notice('');
    }catch(error){if(grammarChallenge===current)notice('ALTRON could not answer: '+error.message)}
    finally{if(grammarChallenge===current){current.thinking=false;renderGrammarChallenge()}}
  };
  box.append(form);
}
function renderProgress(){
  const turns=state.messages.filter(m=>m.role==='user').length,attempts=state.attempts.length,correct=state.attempts.filter(a=>a.correct).length;
  const metrics=$('#metrics');metrics.replaceChildren();
  [['Messages',turns],['Translations',state.translations.length],['Grammar checks',state.grammar.length],['Quiz attempts',attempts],['Quiz accuracy',attempts?Math.round(correct/attempts*100)+'%':'—']].forEach(([label,value])=>{
    const box=el('div','metric');box.append(el('strong','',String(value)),el('span','',label));metrics.append(box);
  });
  const quiz=$('#quiz-history');quiz.replaceChildren();
  for(const a of state.attempts.slice(0,10))quiz.append(el('div','history-row',`${a.id} · ${a.correct?'Correct':'Try again'} · ${new Date(a.at).toLocaleDateString()}`));
  if(!state.attempts.length)quiz.append(el('p','muted','No quiz answers yet.'));
  const grammar=$('#grammar-history');grammar.replaceChildren();
  for(const g of state.grammar.slice(0,8))grammar.append(el('div','history-row',`${g.original} → ${g.corrected}`));
  if(!state.grammar.length)grammar.append(el('p','muted','No grammar checks yet.'));
  const translations=$('#translate-history');translations.replaceChildren();
  for(const item of state.translations.slice(0,8))translations.append(el('div','history-row',`${item.original} → ${item.english}`));
  if(!state.translations.length)translations.append(el('p','muted','No translations yet.'));
}
function renderDailyGoal(){let box=$('#daily-goal');if(!box){box=el('div','card');box.id='daily-goal';$('#progress').insertBefore(box,$('#metrics'))}box.replaceChildren();const today=new Date().toLocaleDateString(),done=state.attempts.filter(a=>new Date(a.at).toLocaleDateString()===today).length,goal=Number(state.dailyGoal||5);box.append(el('h3','','Daily quiz goal'),el('p','',`${Math.min(done,goal)} of ${goal} questions answered today${done>=goal?' — goal reached! 🎉':''}`));const select=el('select');select.setAttribute('aria-label','Daily question goal');for(const n of [3,5,10]){const option=el('option','',`${n} questions`);option.value=String(n);select.append(option)}select.value=String(goal);select.onchange=()=>{state.dailyGoal=Number(select.value);save();renderDailyGoal()};box.append(select);const bar=el('progress');bar.max=goal;bar.value=Math.min(done,goal);bar.style.width='100%';bar.style.marginTop='12px';box.append(bar,el('p','muted','Saved in this browser. Google sign-in separates profiles, but does not sync devices.'))}
window.jackSetLearner=(uid)=>{storageKey=uid?'jack-speaksmart-v1:'+uid:'jack-speaksmart-v1';loadState();syncVoiceControls();grammarChallenge={question:null,answered:false,choice:null,thread:[],thinking:false};renderMessages();renderGrammar(null);renderTranslation(state.translations[0]||null);renderQuiz();renderProgress();renderDailyGoal();refreshChallengeIfOpen()};
$('#clear-data').addEventListener('click',()=>{if(!confirm('Delete all ALTRON practice history stored in this browser?'))return;state=structuredClone(initial);save();syncVoiceControls();renderMessages();renderGrammar(null);renderTranslation(null);renderQuiz();renderProgress();renderDailyGoal();notice('Browser history cleared.')});
window.jackAuthChanged=checkModel;
async function init(){
  try{const r=await fetch('questions.json');if(!r.ok)throw Error();questions=await r.json()}
  catch{notice('Quiz questions could not be loaded.')}
  try{
    const r=await fetch('word_bank.json');if(!r.ok)throw Error();
    const saved=await r.json();
    if(!Array.isArray(saved)||saved.length<4||saved.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||typeof row[1]!=='string'))throw Error();
    wordBank=saved;wordBankFromApi=true;
  }catch{console.warn('Saved dictionary word bank unavailable; using built-in words.')}
  renderMessages();renderTranslation(state.translations[0]||null);renderQuiz();refreshChallengeIfOpen();checkModel();
}
init();
