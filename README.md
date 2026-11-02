# ALTRON · English Teacher

A beginner-friendly English practice mini project powered by a free local Ollama model. Practice conversations, correct grammar, answer quizzes, and learn natural English from Tamil or Tanglish.

Live website: [ALTRON](https://jack-speaksmart-ai-2026.web.app/). Online AI and recording transcription require the owner's laptop bridge to be running.

## Choose an application

| Folder | Application | Setup guide |
| --- | --- | --- |
| `web/` | Firebase website with Google sign-in, voice teacher, Tamil to English, grammar chat, quizzes, and browser progress | [Web setup](web/README.md) |
| `streamlit/` | Local Python app with learner profiles, SQLite history, grammar corrections, quizzes, and optional microphone input | [Streamlit setup](streamlit/README.md) |

## Start the local app

1. Install Python 3.11+ and [Ollama](https://ollama.com/).
2. Download the free model: `ollama pull qwen3:1.7b`.
3. On Windows, open `streamlit/run_windows.bat`. It creates a Python environment, installs the requirements, and starts the app.

For manual setup, run these commands inside `streamlit/`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m streamlit run app.py
```

## Architecture

```text
Web browser → Firebase Hosting + Google sign-in → HTTPS tunnel
            → authenticated Node bridge → Ollama / local Whisper

Local browser → Streamlit → Ollama
                         → SQLite learner history
```

The web app stores progress in the browser under the signed-in account; the Streamlit app stores its own history in SQLite. These stores do not sync. Voice transcription uses local Whisper; web speech playback uses the browser's available voices. Learners can edit transcripts before sending them.

## Web deployment

The existing Firebase project configuration is included. Deploying to that project requires an authorized Firebase account. For your own deployment, configure your Firebase project and Google sign-in, then update the Firebase client configuration and bridge project/origin settings. Firebase's client API key identifies the public web app; it is not an administrator credential.

`web/public/bridge-config.json` deliberately starts with an empty address. Run a web launcher on the AI laptop to verify its tunnel and publish the current address. Temporary Cloudflare addresses can change; the Tailscale option requires a separately installed and signed-in client with Funnel enabled. See the web setup guide for details.

## Tests

```bash
cd streamlit
python -m unittest discover -s tests -v
```

```bash
cd web
node --test bridge/server.test.mjs
```

The project has 10 Python tests and 8 Node bridge tests. Detailed checks and untested parts are recorded in [the web test report](web/TEST_REPORT.md) and [the local test report](streamlit/TEST_REPORT.md). Small models can give incorrect feedback, and speech recognition may mishear noisy or mixed-language recordings. The app corrects transcripts; it does not score pronunciation.

Local databases, recordings, logs, credentials, virtual environments, binaries, and downloaded model files are excluded from version control.
