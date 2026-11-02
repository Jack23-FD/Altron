# SpeakSmart AI test report

Tested on **29 October 2026** on Windows with Python 3.11.1, Streamlit 1.66.1, Ollama 0.40.13, and the local `qwen3:1.7b` model.

| Check | Result |
| --- | --- |
| Ten unit tests: database, profiles, daily goal, random grammar question selection, quiz, model request shape, response validation, grounded feedback | Passed |
| Streamlit app startup and local health endpoint | Passed (`HTTP 200`) |
| Readable conversation input UI | Passed in Chrome: message box appears above history; typed text renders dark (`rgb(23, 43, 77)`) on white; sidebar and tabs are readable |
| Quiz answer selection and instant feedback in Streamlit | Passed |
| Conversation form using real local Ollama, including SQLite save | Passed again after model reinstall: “Yesterday I go to the library” received a reply and grounded correction; the new turn appeared in daily progress |
| Grammar form using real local Ollama, including SQLite save | Passed |
| Random grammar chat: checked answer, saved quiz attempt, local Ollama reply, follow-up, and a different next question | Passed in the Streamlit UI; the follow-up is kept for the current session |
| Verified example prompt with real local Ollama | Passed: the model replied `Example: Where is your school?` when asked for an example |
| Daily goal count and settings persistence | Passed in unit test and live Streamlit UI; changing the goal from 5 to 3 updated progress to 1 of 3 |
| Optional microphone transcription | Not tested: no microphone/speech model setup in this run |
| Codex CLI with local Ollama | Read-only `codex --oss` request returned `OK`; CLI emitted fallback model metadata warnings for the small model |

The small model sometimes gave incorrect grammar explanations during testing. The app now supplies grounded explanations for common one-word verb changes; more complex feedback remains AI-generated and should be reviewed by a learner or teacher.

Run the same core tests with:

```bash
python -m unittest discover -s tests -v
```

The application was launched locally at `http://127.0.0.1:8501`. This address is available only while the Streamlit process is running on the computer. The optional voice input remains untested.
