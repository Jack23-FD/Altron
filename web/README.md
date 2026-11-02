# ALTRON · English Teacher Web

Website: https://jack-speaksmart-ai-2026.web.app/

ALTRON is a free English practice website with a voice teacher, Tamil-to-English practice, conversation, grammar feedback, spoken quizzes, random grammar chat, a daily quiz goal, and Google sign-in. The open source Qwen model (`qwen3:1.7b`) runs on this laptop through Ollama. Local multilingual Whisper `base` transcribes short English or Tamil recordings; browser speech synthesis reads English answers aloud. Firebase Hosting serves the website. A small Node bridge verifies Firebase Google ID tokens and forwards bounded requests through an HTTPS Cloudflare Tunnel. The website never calls Ollama's unauthenticated API directly.

## Use ALTRON from any browser

1. Keep the laptop on, connected to the internet, and running Ollama with `qwen3:1.7b` downloaded. For voice input, double-click `setup_voice.bat` once on the laptop. It installs `faster-whisper` in a private Python environment and downloads the free multilingual `base` speech model. The first setup needs internet and a few hundred MB of disk space.
2. Double-click `start_jack_internet.bat` in this folder. Wait until it prints **Deploy complete** and **ALTRON is online**. Keep that launcher window open while using AI. It starts the bridge and temporary tunnel, checks the new address, and updates the Firebase website. For a stable address, follow **Stable Tailscale address** below instead.
3. Open https://jack-speaksmart-ai-2026.web.app/ in a browser or phone. Click **Sign in with Google**. When the sidebar says **AI ready**, choose a practice mode:
   - **Conversation:** Choose a topic, ask ALTRON an easy question, record or type an English answer, check the transcript, and press **Send**. ALTRON replies, explains a grammar correction when needed, and can read the reply or corrected sentence aloud.
   - **Tamil to English:** Say a short Tamil phrase or type Tamil/Tanglish. Review what Whisper heard and press **Show me the English**. ALTRON gives one natural English sentence, a simple grammar note in English and Tamil, and spoken English playback. Example: `yesterday saptiya` → `Did you eat yesterday?`
   - **Quick quiz:** Select **AI grammar challenge** for an Ollama-created setting with a locally checked answer. Tap **Hear question**, then choose an option or say its letter or full answer. Review the transcript before **Check answer**. The other quiz categories and checked grammar questions remain available without Ollama.
   - **Random grammar chat:** Hear a checked question, answer by voice or tap, and ask a follow-up about the rule.
   Recordings stop automatically after 20 seconds. Each recording needs microphone permission in that browser.
4. After a laptop restart, run `start_jack_internet.bat` again. The tunnel address changes each time; the launcher republishes the Firebase site automatically. While the launcher is open, it checks the tunnel and reconnects after sustained failures. The website reads the latest address before each AI request. Refresh an already-open ALTRON tab after a website update so it loads the newest code. Leave the laptop, Ollama, and launcher window running for AI features.

The checked quiz categories and checked answers in Grammar chat work even when the laptop is off; AI question settings, AI follow-up, translation, and voice transcription need the laptop. Browser history and the daily goal are stored in that browser under the signed-in account ID; **they do not sync between devices**. Grammar chat follow-up text is kept only until that page is reloaded. The separate local Streamlit app at http://127.0.0.1:8501 still has SQLite history; its data is separate from the Firebase website.

## Stable Tailscale address

Tailscale Funnel gives this laptop one HTTPS `*.ts.net` address that remains the same when the bridge restarts. Its public URL still requires ALTRON's Google sign-in token for chat and voice. The Firebase website stays at https://jack-speaksmart-ai-2026.web.app/.

1. Install the official Windows client from [Tailscale](https://tailscale.com/download/windows) and sign in to your own Tailscale account on this laptop. Do not put an account password in ALTRON's files. Installation and first sign-in need to be done once.
2. Close the old `start_jack_internet.bat` window if it is running. Double-click `start_jack_stable.bat`. On first use, follow Tailscale's browser page to enable Funnel for your account. The launcher starts ALTRON's local bridge, requests a Funnel for port 8765, checks public health, and publishes the stable address to Firebase. Wait for **ALTRON is online**.
3. Keep the launcher window open for chat and voice. After a restart, run `start_jack_stable.bat` again; the Funnel address stays the same. The laptop, Ollama, Tailscale, and internet connection must remain on. To inspect the Funnel, run `tailscale funnel status` in PowerShell.

The first Funnel setup needs Tailscale approval in your browser and a working route to Tailscale's service. If Tailscale is unavailable, the temporary Cloudflare launcher remains an option. Do not run both launchers at once, as both try to control the same local bridge and Firebase address.

## Requirements

- Windows, Node.js, PowerShell, Firebase CLI signed in to project `jack-speaksmart-ai-2026`, Ollama, and model `qwen3:1.7b`. Voice also needs Python 3.9+ and the one-time `setup_voice.bat` step. On this laptop it was installed with Python 3.11.
- The launcher downloads the official signed Windows `cloudflared` executable into `bridge/tools/` on first use. It has no Cloudflare account or paid API requirement. Cloudflare Quick Tunnels are intended for development, have no uptime guarantee, and change hostname when restarted. For a permanent production address, set up a named Cloudflare Tunnel with a domain.
- A Google account is required for AI. Any Google account that can sign in to this Firebase project may use the laptop model. The bridge limits each user to 20 practice requests per minute and the site to 300 per hour. It handles up to two chat requests and one voice recording at a time.

## Architecture and privacy

`Browser → Firebase website + Google sign-in → HTTPS Cloudflare Tunnel → Node bridge on 127.0.0.1:8765 → Ollama (chat) / local Whisper (voice input)`

The bridge checks the token signature, project, expiry, Google provider, and verified email against Google's public signing certificates. It allows only the ALTRON Firebase origins, limits audio to 1.5 MB and 20 seconds in the browser, limits request size and output length, and never exposes Ollama's raw API. Voice recordings travel encrypted to the laptop and are deleted from its temporary storage after transcription. The transcript remains in the browser only if the learner sends it or saves it there. The speech language is chosen explicitly (English for chat/quiz, Tamil for Tamil to English) because short clips are hard to auto-detect. This is an educational MVP. Small models can give wrong translations or explanations, so learners should review important feedback. Whisper can mishear accented, mixed-language, or noisy speech; ALTRON corrects the **transcript**, not pronunciation, and the learner can edit it before sending. AI quiz settings are generated by Ollama, but the answer and rule are checked locally. The bridge hides conversation corrections that clearly replace the learner's meaning.

The Google ID token is sent to the bridge over HTTPS. The bridge validates it with Google's signing certificates and does not log it. The token check does not query Firebase for revocation on every request; signed-in tokens expire and refresh normally.

## Tests and deployment

Run bridge tests: `node --test bridge/server.test.mjs`. To check the local voice model: `bridge\speech\.venv\Scripts\python.exe bridge\speech\transcribe.py --warmup`.

To republish static website changes without restarting the laptop tunnel: `firebase deploy --only hosting --project jack-speaksmart-ai-2026`.

If you open `public/index.html` as a local `file://` page, it redirects to the hosted website. Opening files directly cannot load Firebase modules and quiz JSON correctly.

If an already-open tab shows errors for an old `trycloudflare.com` address, refresh ALTRON so it loads the latest website code. The current code reads the published tunnel address before each AI request. If voice transcription shows a laptop model error, run `setup_voice.bat` again and check `bridge/bridge-err.log` for the precise local error. A browser microphone test should use one short sentence. The temporary Quick Tunnel can still go offline while the laptop or network is disconnected; a permanent public address requires a named tunnel and a domain.

The random word challenge uses the free [Free Dictionary API](https://dictionaryapi.dev/) and falls back to a bundled word bank when the API is unavailable. To refresh the bank, install `requirements-updater.txt`, run `python update_word_bank.py`, and deploy again.
