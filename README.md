# WhatsApp Claude Assistant (free)

Turn Claude into your personal WhatsApp assistant. Everything shows up in your own **"Message yourself"** chat:

| You do | The assistant does |
|---|---|
| Get a long voice note | Summarises it in ~15 s: one line, details, your to-dos, plus a suggested reply. Reply **send** and it goes out from your number |
| Type `petrol 500`, `doodh 220`, `dinner 1500` | Claude files each one by category in `expenses.csv` (opens in Excel). `kharcha` shows today's total, `kharcha week`, `kharcha month`, `undo` |
| Type `Ali ko 5000 udhaar diya`, `Ali ne 2000 wapas kiye`, `Sara se 3000 liye` | Keeps an udhaar (loan) ledger per person in `loans.csv`. `udhaar` shows who owes you and whom you owe |
| Send a photo of a bill | Claude reads the amount and due date and reminds you 2 days before and on the due date. `reminders` lists them |

Voice notes in any language (Urdu, Hindi, Punjabi, English, mixed). Summaries in English or Roman Urdu.

## Install with one sentence
1. Download this folder (green **Code** button > **Download ZIP**) and unzip it.
2. Open the folder in **Claude Code** (the Claude desktop app's Code tab, or `claude` in a terminal).
   Pick the folder that has `CLAUDE.md` inside: unzipping often makes a folder inside a folder of the same name.
3. Type: **install my WhatsApp assistant**

Claude follows `CLAUDE.md`: it installs what's missing, asks for your free Groq key, tests everything and shows you a
QR code to scan with WhatsApp (Settings > Linked devices > Link a device). You don't type any commands.

## What you need
- A **Claude Pro (or Max) plan** with Claude Code. The assistant runs on your plan; it doesn't need the paid Claude API.
- A free **Groq** key for turning voice into text: https://console.groq.com/keys
- A Windows 10/11 laptop (macOS/Linux work with `npm start`), on while you want it to work.

## Honest points (please read)
- **Not an official WhatsApp feature.** It links like WhatsApp Web. WhatsApp can ban numbers that automate messages.
  To keep you safe it **never sends anything without your "send"**, and at most 15 replies an hour. Don't use it for
  bulk or marketing messages.
- **Privacy:** voice-note audio goes to Groq to become text; that text and your bill photos go to Claude. Think twice
  before using it for very private messages.
- **Your laptop must be on.** When it's off, messages wait until it's back.
- Reminders and summaries are only sent to **your own** chat.

## Manual install
```
npm install
copy .env.example .env      (then put your Groq key in .env)
npm run try                 (tests Claude with 5 notes + the demo bill)
npm test
npm start                   (scan the QR code once)
powershell -ExecutionPolicy Bypass -File install_task.ps1   (Windows: keep it running in the background)
```

## Files
- `bot.ts`: WhatsApp connection, Groq, Claude, reminders
- `logic.ts`: prompts, commands, expenses and bill logic (tested in `test/test_logic.ts`)
- `expenses.csv`, `loans.csv`, `bills/`, `state.json`, `auth/`: your data, created on first use (never share `auth/` or `.env`)

Made by Automate & Analyze on YouTube. MIT license.
