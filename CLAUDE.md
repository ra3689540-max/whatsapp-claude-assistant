# Installing the WhatsApp Claude Assistant (instructions for Claude)

The person who opened this folder wants to install the assistant. When they say something like
"install my WhatsApp assistant", do the steps below **for them**, one at a time, explaining each step in one short,
friendly sentence in the language they write in. They may not be technical: never ask them to type commands; run
them yourself and tell them what you did.

## Rules
- Their Groq key is a secret. Ask them to paste it **into the `.env` file themselves** (open it for them in Notepad /
  their editor) rather than into the chat. Never print the `.env` file's values back.
- Never edit `bot.ts` or `logic.ts` during install. If something fails, show the error in plain words and fix the
  setup (Node, npm, .env), not the code.
- Before installing any program (Node.js), say what it is and ask for a yes.
- This is not an official WhatsApp feature. Before the QR step, tell them in one or two sentences: it links like
  WhatsApp Web; it never sends anything without their "send"; max 15 sends an hour; don't use it for bulk messages.

## Steps
1. **Node.js 22.18 or newer.** Check with `node --version`. If missing or older: on Windows ask, then run
   `winget install -e --id OpenJS.NodeJS.LTS` (macOS: `brew install node`). On Windows a new terminal may be needed
   afterwards; use the full path `C:\Program Files\nodejs\node.exe` / `npm.cmd` if `node` isn't found yet.
2. **Install the packages:** `npm install` (on Windows PowerShell use `npm.cmd install`).
3. **Settings:** copy `.env.example` to `.env`. Ask which language they want (english or roman-urdu) and their currency,
   and set `REPLY_LANGUAGE` / `CURRENCY` yourself.
4. **Groq key (free):** tell them to open https://console.groq.com/keys , sign in with Google, click
   **Create API Key**, copy it, and paste it after `GROQ_API_KEY=` in the `.env` file you opened for them, then save.
   Check it's filled in without printing it, e.g. `node -e "process.loadEnvFile('.env');console.log(!!process.env.GROQ_API_KEY)"`.
5. **Claude works in the background?** Run `npm run try`. It sends 5 test notes and the demo bill photo to Claude and
   prints what the assistant would reply. If it says **"Claude Code is not logged in for background use"** (normal
   when Claude Code only lives inside the Claude desktop app), make a token on their plan:
   open a terminal **they can see** and run `claude setup-token` (if `claude` isn't on PATH, use the `claude.exe`
   the test found, e.g. under `%LOCALAPPDATA%\Claude-Data\...\claude-code\...\claude.exe`). They log in in the
   browser; the terminal shows a long token. Ask them to paste it after `CLAUDE_CODE_OAUTH_TOKEN=` in `.env`
   themselves and save (it's a secret: not in the chat). Run `npm run try` again until it shows the 5 answers and the
   bill card.
6. **Tests:** `npm test` (no network, should say "all ... tests passed").
7. **Link WhatsApp:** start `npm start` (Windows: `npm.cmd start`) in a terminal **the person can see**, because it shows a
   QR code. Tell them: on the phone, WhatsApp > Settings > **Linked devices** > **Link a device**, and scan it.
   Wait for "✅ Connected". Then stop it (Ctrl+C).
8. **Keep it running (Windows, optional):** ask, then run
   `powershell -ExecutionPolicy Bypass -File install_task.ps1`. It starts hidden at every log-on; the log is `bot.log`.
   To remove it later: `powershell -ExecutionPolicy Bypass -File install_task.ps1 -Remove`.
   On macOS/Linux, suggest keeping `npm start` running instead.
9. **First try:** tell them to open their own chat in WhatsApp ("Message yourself", their own name at the top of the
   chat list) and send `help`, then `petrol 500`, then `kharcha`, and forward any voice note to that chat.

## What they can do afterwards (tell them at the end)
- Voice notes they receive → a summary in "Message yourself"; reply **send** to send the suggested reply.
- Type `petrol 500`, `doodh 220`… → saved to `expenses.csv` (opens in Excel); `kharcha` / `kharcha week` / `kharcha month`; `undo`.
- Type `Ali ko 5000 udhaar diya` / `Ali ne 2000 wapas kiye` → udhaar per person in `loans.csv`; `udhaar` shows the balance.
- Send a photo of a bill → amount + due date read, reminders 2 days before and on the day; `reminders` lists them.
