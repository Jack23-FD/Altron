import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {makeServer, verifyFirebaseToken, sanitizeTutorFeedback} from './server.mjs';

const project = 'jack-speaksmart-ai-2026';
const origin = 'https://jack-speaksmart-ai-2026.web.app';
function token(privateKey, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url');
  const payload = Buffer.from(JSON.stringify({aud:project,iss:`https://securetoken.google.com/${project}`,
    sub:'learner-1',iat:now,exp:now+3600,auth_time:now-100,email_verified:true,
    firebase:{sign_in_provider:'google.com'},...claims})).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  return `${input}.${signature}`;
}

test('verifies signature, project, expiry, and Google provider', async () => {
  const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const keys=async()=>({test:publicKey.export({type:'spki',format:'pem'})});
  assert.equal(await verifyFirebaseToken(token(privateKey),keys),'learner-1');
  await assert.rejects(verifyFirebaseToken(token(privateKey,{aud:'another-project'}),keys));
  await assert.rejects(verifyFirebaseToken(token(privateKey,{exp:1}),keys));
  await assert.rejects(verifyFirebaseToken(token(privateKey,{firebase:{sign_in_provider:'anonymous'}}),keys));
});

test('bridge rejects missing or invalid sign-in and restricts origins', async () => {
  const server=makeServer({verifyToken:async()=>{throw Error('bad token')}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    let r=await fetch(base+'/api/status',{headers:{Origin:origin}});
    assert.equal(r.status,401);
    r=await fetch(base+'/api/status',{headers:{Origin:'https://evil.example',Authorization:'Bearer x'}});
    assert.equal(r.status,403);
    r=await fetch(base+'/api/chat',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}});
    assert.equal(r.status,204);
    assert.equal(r.headers.get('access-control-allow-origin'),origin);
  }finally{server.close()}
});

test('bridge fixes model and generation limits on Ollama request', async () => {
  let sent;
  const fakeFetch=async(url,options)=>{
    sent={url,body:JSON.parse(options.body)};
    return new Response(JSON.stringify({message:{content:'{"reply":"Hi!"}'}}),
      {status:200,headers:{'Content-Type':'application/json'}});
  };
  const server=makeServer({verifyToken:async()=> 'test-user',ollamaFetch:fakeFetch});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const r=await fetch(base+'/api/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer x','Content-Type':'application/json'},
      body:JSON.stringify({model:'unsafe-model',messages:[{role:'system',content:'Tutor'},{role:'user',content:'Hello'}]})});
    assert.equal(r.status,200);
    assert.equal(sent.url,'http://127.0.0.1:11434/api/chat');
    assert.equal(sent.body.model,'qwen3:1.7b');
    assert.equal(sent.body.options.num_predict,350);
    assert.equal((await r.json()).message.content,'{"reply":"Hi!"}');
  }finally{server.close()}
});

test('discarded correction cannot replace the learner meaning', () => {
  const bad=JSON.stringify({reply:'What did you study?',correction:"You didn't say what you studied.",explanation:'Missing details'});
  const fixed=JSON.parse(sanitizeTutorFeedback(bad,'Hello Jack. I went to college today.'));
  assert.equal(fixed.correction,'');
  assert.equal(fixed.explanation,'');
  const good=JSON.stringify({reply:'What did you buy?',correction:'Yesterday I went to the market.',explanation:'Went is past tense.'});
  assert.equal(JSON.parse(sanitizeTutorFeedback(good,'Yesterday I go to the market.')).correction,
    'Yesterday I went to the market.');
  const inflated=JSON.stringify({reply:'Hello',correction:'Good morning! How can I assist you today?',explanation:'Better tone'});
  assert.equal(JSON.parse(sanitizeTutorFeedback(inflated,'Good morning.')).correction,'');
  const short=JSON.stringify({corrected:'She goes.',explanation:'Already correct.',examples:['She goes home.','She goes to work.']});
  const checked=JSON.parse(sanitizeTutorFeedback(short,'She go.'));
  assert.equal(checked.corrected,'She goes.');
  assert.match(checked.explanation,/present tense/);
});

test('voice recording requires sign-in, limits size and format, and selects English or Tamil', async () => {
  let received;
  const server=makeServer({verifyToken:async()=> 'voice-learner',transcribeAudio:async(audio,mime,language)=>{
    received={size:audio.length,mime,language};return 'Yesterday I go to school.';
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Origin:origin,Authorization:'Bearer test','Content-Type':'audio/webm;codecs=opus'};
  try{
    let r=await fetch(base+'/api/transcribe',{method:'OPTIONS',headers:{Origin:origin}});
    assert.equal(r.status,204);
    assert.match(r.headers.get('access-control-allow-headers'),/X-Speech-Language/);
    r=await fetch(base+'/api/transcribe',{method:'POST',headers:{Origin:origin,'Content-Type':'audio/webm'},body:Buffer.alloc(1200)});
    assert.equal(r.status,401);
    r=await fetch(base+'/api/transcribe',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:Buffer.alloc(1200)});
    assert.equal(r.status,415);
    r=await fetch(base+'/api/transcribe',{method:'POST',headers:{...headers,'X-Speech-Language':'fr'},body:Buffer.alloc(1200)});
    assert.equal(r.status,400);
    r=await fetch(base+'/api/transcribe',{method:'POST',headers,body:Buffer.alloc(1_500_001)});
    assert.equal(r.status,413);
    r=await fetch(base+'/api/transcribe',{method:'POST',headers,body:Buffer.alloc(1200)});
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{text:'Yesterday I go to school.',language:'en'});
    assert.deepEqual(received,{size:1200,mime:'audio/webm',language:'en'});
    r=await fetch(base+'/api/transcribe',{method:'POST',headers:{...headers,'X-Speech-Language':'ta'},body:Buffer.alloc(1200)});
    assert.equal(r.status,200);
    assert.equal((await r.json()).language,'ta');
    assert.equal(received.language,'ta');
  }finally{server.close()}
});

test('a voice recording can run while Ollama finishes a chat reply', async () => {
  let releaseChat, chatStarted;
  const started = new Promise(resolve => { chatStarted = resolve; });
  const waiting = new Promise(resolve => { releaseChat = resolve; });
  const server=makeServer({verifyToken:async()=> 'parallel-learner',
    ollamaFetch:async()=>{chatStarted();await waiting;return new Response(JSON.stringify({message:{content:'{"reply":"Hello"}'}}),{status:200});},
    transcribeAudio:async()=> 'Did you eat yesterday?'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Origin:origin,Authorization:'Bearer test'};
  try{
    const chat=fetch(base+'/api/chat',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{role:'system',content:'Tutor'},{role:'user',content:'Hello'}]})});
    await started;
    const voice=await fetch(base+'/api/transcribe',{method:'POST',headers:{...headers,'Content-Type':'audio/webm'},body:Buffer.alloc(1200)});
    assert.equal(voice.status,200);
    assert.equal((await voice.json()).text,'Did you eat yesterday?');
    releaseChat();
    assert.equal((await chat).status,200);
  }finally{releaseChat();server.close()}
});

test('normal practice has room for twenty requests per minute', async () => {
  const server=makeServer({verifyToken:async()=> 'quiz-learner',
    ollamaFetch:async()=>new Response(JSON.stringify({message:{content:'{"reply":"Hello"}'}}),{status:200})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(let n=0;n<21;n++){
      const response=await fetch(base+'/api/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer test','Content-Type':'application/json'},
        body:JSON.stringify({messages:[{role:'system',content:'Tutor'},{role:'user',content:'Hello'}]})});
      assert.equal(response.status,n===20?429:200);
      if(n===20)assert.equal(response.headers.get('Retry-After'),'60');
    }
  }finally{server.close()}
});

test('voice decoder errors return a useful message with the Jack CORS header', async () => {
  const server=makeServer({verifyToken:async()=> 'voice-error-learner',
    transcribeAudio:async()=>{const error=new Error('Decoder failed');error.stderr='Invalid data found when processing input';throw error;}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(base+'/api/transcribe',{method:'POST',
      headers:{Origin:origin,Authorization:'Bearer test','Content-Type':'audio/webm'},body:Buffer.alloc(1200)});
    assert.equal(response.status,503);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    assert.match((await response.json()).error,/recording could not be read/i);
  }finally{server.close()}
});
