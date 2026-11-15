# Setting up the assistant for a friend

The assistant always runs on a **computer** that is linked to **one WhatsApp number** (like WhatsApp Web).
So for your friend's phone you need one more copy, linked to your friend's WhatsApp.

## Pick where it runs

| | A. Friend's own laptop (recommended) | B. A second copy on your laptop |
|---|---|---|
| Claude plan | Friend's own Claude Pro | Yours (Claude plans are meant for one person: check Anthropic's terms first) |
| Privacy | Friend's messages stay on their laptop | Friend's voice notes, expenses and bills go through YOUR laptop and YOUR Claude account. The `auth` folder is full access to their WhatsApp. Only with their clear OK |
| Works when | Friend's laptop is on | Your laptop is on |

## A. On your friend's laptop (Windows 10/11)

**What your friend needs:** a Claude Pro plan, a Google account (for the free Groq key), the laptop, and their phone in hand.

1. **Copy the folder.** Send `whatsapp_assistant_free.zip` to the laptop (USB, Google Drive, or WhatsApp as a file).
   Right-click > **Extract All** to a place they'll keep, e.g. `Documents\whatsapp_assistant`.
2. **Install the Claude desktop app** (claude.ai/download) and log in with **their own** Claude account.
3. Open the app's **Code** tab > choose the extracted folder.
4. Type: **install my WhatsApp assistant**
   Claude reads `CLAUDE.md` and does the rest, one step at a time. Your friend only:
   - says **yes** when Claude wants to install Node.js
   - picks the reply language (English or Roman Urdu) and currency
   - makes the free **Groq key** (console.groq.com/keys > Create API Key) and pastes it into the `.env` file Claude opens, then saves
   - runs **claude setup-token** in the window Claude opens, logs in in the browser, and pastes the token into `.env`
     (it's like a password: paste it in the file, never in a chat)
5. **Link WhatsApp.** A QR code appears. On your friend's phone: WhatsApp > Settings > **Linked devices** > **Link a device** > scan.
   Wait for **✅ Connected**.
6. **Keep it running.** Say yes when Claude offers the background task (starts by itself at every log-on).
7. **Test on the phone**, in "Message yourself" (their own name at the top of the chat list):
   `help` → `petrol 500` → `kharcha` → `Ali ko 1000 udhaar diya` → `udhaar` → a photo of any bill → forward a voice note.
8. **Laptop settings:** Settings > System > Power: never sleep while plugged in. Keep Wi-Fi on.

## B. A second copy on your laptop (only with your friend's OK)

1. Extract `whatsapp_assistant_free.zip` into a NEW folder, e.g. `Desktop\Claude Working\whatsapp_friend_<name>`.
   Never reuse your own `whatsapp_linked` folder: its `auth` folder is YOUR WhatsApp.
2. Open that folder in Claude's Code tab and type **install my WhatsApp assistant**.
   It can reuse your Groq key and Claude token (copy those two lines from your own `.env` into the new `.env`).
3. **QR step with your friend next to you:** when the QR code appears, your friend scans it with their phone
   (Linked devices > Link a device). It changes every ~20 seconds, so do it in person.
4. Accept the background task. Each folder gets its own task, "WhatsApp Claude Assistant (<folder name>)",
   so it never touches your own bot.
5. Test from your friend's phone as in A7.

## Good to know (tell your friend)
- It's not an official WhatsApp feature. It never sends anything to anyone without their **send**, max 15 replies an hour. No bulk messages.
- To stop it: on the phone, Linked devices > tap the device > **Log out**. On the laptop:
  `powershell -ExecutionPolicy Bypass -File install_task.ps1 -Remove` in the folder.
- Their data is in the folder: `expenses.csv`, `loans.csv` (open in Excel), `bills\`. Never share `.env` or `auth\`.
