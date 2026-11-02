# Jack web test report

Tested on 29 October 2026.

| Check | Result |
| --- | --- |
| Four Node bridge tests: Firebase signature/claims, origin and sign-in checks, fixed Ollama limits, safe corrections | Passed |
| JavaScript syntax and PowerShell launcher syntax | Passed |
| Cloudflare Tunnel official Windows executable signature | Valid |
| Laptop bridge health, temporary HTTPS tunnel, and Firebase Hosting deploy | Passed |
| Launcher restart and automatic Firebase address update | Passed: new tunnel healthy, public config matched it, unsigned request returned HTTP 401 |
| Google sign-in and laptop model status on live Firebase site | Passed: signed-in account shown and status **AI ready** |
| Live Conversation through Firebase → tunnel → laptop Ollama | Passed: Jack answered a college message |
| Live Grammar lab through Firebase → tunnel → laptop Ollama | Passed: corrected `She go to college every day.` to `She goes to college every day.` |
| Live random Grammar chat and follow-up | Passed: checked answer and example appeared, Ollama explained the answer, and an example request returned the checked example |
| Meaning-preserving conversation feedback | A test caught an unrelated model correction; bridge guard was added and unit-tested. A later live reply showed no unrelated correction. |
| Quiz, random word challenge, daily goal | Passed in previous deployed browser checks |
| Other device / phone outside this laptop | Not tested in this run |

The stable Firebase URL works while this laptop, Ollama, bridge, and tunnel stay running. The temporary tunnel hostname changes after restart; `start_jack_internet.bat` republishes the current address. Cloudflare Quick Tunnels have no uptime guarantee.

## Reconnect check, 30 October 2026

The previous laptop bridge and temporary tunnel had stopped. Ollama was still installed and reachable. The launcher now keeps its window open, checks public tunnel health before publishing, and accepts Firebase CLI's successful deploy even when its separate update check prints a warning. The website's reconnect button reloads the latest tunnel address. JavaScript and PowerShell syntax checks passed, all four bridge tests passed, and the published Firebase `app.js` contains the reconnect fix. The new public tunnel returned HTTP 200 with `{"ok":true}`. A fresh browser session loaded the Jack site and showed Google sign-in; this run did not repeat an authenticated AI conversation or test from a second device.

## Voice teacher check, 30 October 2026

The voice feature was published to the same Firebase site. The laptop now has `faster-whisper` 1.2.1 and the local `tiny.en` model installed. A generated English speech recording containing “Yesterday I go to school” was transcribed correctly by Whisper and by the Node bridge calling Whisper. Five bridge tests pass, including sign-in, CORS, audio format, size limit, and returned transcript. JavaScript, Python, and PowerShell syntax checks pass. The live website shows the voice controls and **AI ready** in a signed-in Edge browser, including a phone-width layout check. The current public tunnel health returned HTTP 200 and the Firebase configuration matched its address.

The physical microphone recording flow and audible browser speech output were **not tested** in this run. The generated recording tests the local speech engine; it does not measure real accent or microphone accuracy. Corrections are based on the transcript and can still be imperfect with the small Qwen model. The learner can edit the transcript before sending it.

A final website update added topic-based beginner questions. In the signed-in browser, **Ask an easy question** displayed “What did you eat today?”; the speech playback button was invoked, but its audio was not independently checked. The final Firebase page and public tunnel health were verified after deployment.

## Tamil teacher and spoken quiz check, 30 October 2026

The live Firebase site now offers **Tamil to English**, voice answers for **Random grammar chat** and **Quick quiz**, and an **AI grammar challenge** whose setting comes from Ollama while its answer remains locally checked. The laptop voice engine was changed to multilingual Whisper `base`; setup and warmup completed. Five Node bridge tests passed with `node --test bridge/server.test.mjs`, including English/Tamil language selection, authentication, CORS, and audio limits. JavaScript and Python syntax checks passed.

In a signed-in Chrome tab, the Tamil/Tanglish example `yesterday saptiya` returned **“Did you eat yesterday?”** with an English and Tamil grammar note. The live AI grammar challenge generated **“Every day, she ___ to the beach.”** Typing `goes` into the spoken-answer field and checking it returned **Correct!** with the rule. Random grammar chat displayed a different checked question and a voice-answer control; typing `am` returned the correct rule and a checked example. The site showed **AI ready**. The published Firebase configuration pointed to the active tunnel, whose `/health` endpoint returned HTTP 200 and `ok: true`.

A generated English WAV clip was transcribed by local Whisper `base` and through the Node bridge as **“Yesterday I go to school.”** Qwen returned the correct English sentence for both typed Tanglish and Tamil-script examples in direct model checks. At this stage, a physical microphone, Tamil audio transcription, and audible speech playback were **not tested**; see the later repair check for the microphone result. Browser speech output depends on the voices installed in the user's browser or operating system. Short mixed Tamil/English speech may be misheard; the learner can edit the transcript before submitting. This remains an educational prototype; AI explanations may be imperfect.

## Voice and connection repair, 30 October 2026

The user reported repeated HTTP 429 responses, a recording stuck at “Jack is listening,” and Cloudflare HTTP 530/CORS failures. The bridge had a shared limit of eight requests per user per minute, fifty per site per hour, and one active request across chat and voice. Its tunnel log also showed a lost edge connection and reconnect failures. The limits are now 20 per user per minute and 300 per site per hour, with two chat requests and one voice transcription allowed concurrently. The launcher checks the public tunnel every 15 seconds and restarts and republishes it after three consecutive failed checks. The website reloads the published tunnel address after a network failure and shows a direct connection message rather than a generic CORS error.

Seven bridge tests passed, including a voice transcription concurrent with a pending Ollama chat and the new per-user limit. JavaScript and PowerShell syntax checks passed. The repaired site was deployed to the same Firebase URL and showed **AI ready** with Google sign-in. In a live Chrome microphone test, **Start speaking → Stop recording** uploaded audio, the local Whisper model returned a transcript, and the transcript appeared in the editable conversation field. That private test transcript was cleared without sending it to the chatbot. The **Hear a practice sentence** button was clicked without a visible error; audible sound could not be independently verified through browser automation. The tunnel needs the laptop and internet connection to remain available; automatic recovery cannot make a disconnected laptop serve AI.

A separate live chat message received a new Ollama reply after the repair. The tester clicked **Listen to Jack** without a visible playback error. To test recovery, only Jack's tunnel process was stopped. The running launcher detected the exit, created a new tunnel, and successfully republished the Firebase site. An already-open browser tab then generated a new **AI grammar challenge** through the new tunnel without a page reload. The published `app.js` matched the local source hash, the new tunnel `/health` returned HTTP 200, and the browser showed **AI ready**.

## Rotating tunnel and transcription diagnostics, 30 October 2026

The user reported repeated browser CORS messages for an older `trycloudflare.com` address and HTTP 503 responses from a newer transcription address. The current bridge answered both chat and transcription CORS preflights with HTTP 204 and the Jack origin header. The old address had expired. The website now fetches Firebase's current address before each AI request, rather than waiting for a failed request to discover that the tunnel changed. The launcher now waits through eight failed health checks before replacing a tunnel, avoiding address churn from brief network interruptions. Voice exceptions are recorded in the laptop's `bridge-err.log` and shown as a useful message to the learner.

All eight bridge tests passed, including the new voice error response. A browser-format WebM/Opus sample passed through the complete local HTTP → Node → Whisper route with HTTP 200, a transcript, and the correct CORS header. Direct Python and Node transcription of the same sample passed. The newly deployed `app.js` matched the source hash; the public tunnel returned HTTP 200 for health and HTTP 204 with the Jack CORS header for chat preflight. A real Edge microphone test could not be completed because browser control disconnected before the action returned. The reported 503's original cause remains unconfirmed; the next failure will be logged locally for diagnosis. No named Cloudflare tunnel is configured, so the public connection still uses a temporary Quick Tunnel without an uptime guarantee.

## Stable-address preparation, 30 October 2026

Added `start_jack_stable.bat` and `start_jack_stable.ps1` for a Tailscale Funnel address. The launcher checks that Tailscale is installed and signed in before disturbing the existing bridge, starts the authenticated local bridge, enables a background Funnel on port 8765, verifies public health, and publishes the stable `*.ts.net` address to Firebase only after it answers. The missing-install path was run and exited with a clear instruction while the existing Cloudflare bridge remained healthy. PowerShell and JavaScript syntax checks passed; all eight Node bridge tests passed when run with local networking available. The currently published Firebase config loaded in Node, its temporary tunnel returned HTTP 200, and its chat CORS preflight returned HTTP 204 with the Jack origin.

Tailscale is not installed yet. `winget`, direct `curl`, PowerShell WebRequest, and Windows BITS downloads from Tailscale's official package host all failed because the secure connection was reset or terminated. A real Funnel, first-use account sign-in/approval, Firebase republish, and end-to-end stable-address test remain pending installation. The user was asked to install the official Windows client and sign in locally; no password is needed in this project.
