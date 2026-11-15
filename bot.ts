// Linked-device voice-note assistant (runs on your laptop now, a free server later).
//   npm start            first time: scan the QR with WhatsApp > Linked devices > Link a device
//
// What it does:
//   • every voice note you receive -> summary in your "Message yourself" chat (+ suggested reply for 1:1 chats)
//   • you reply "send" / "send: your words" to that summary -> it sends that reply from your number
//   • "petrol 500" typed in "Message yourself" -> saved to expenses.csv; "kharcha" -> totals by category
//   • a photo of a bill sent to "Message yourself" -> amount + due date read, reminders 2 days before and on the day
//   • it NEVER sends anything to anyone without that command from you (reminders go only to your own chat)
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import makeWASocket, {
  Browsers, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion, isJidGroup, jidNormalizedUser,
  normalizeMessageContent, useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import {
  billCard, billPrompt, buildPrompt, canSend, CSV_HEADER, csvLine, emptyState, expensePrompt, expenseReport, expenseSkipReason,
  findPending,
  formatCard, HELP, loanCsvLine, loanReport, loanSavedLine, LOANS_HEADER, parseAnswer, parseBill, parseCommand, parseCsv,
  parseExpenses, parseLoanCsv, parseLoans, prune, reminderMessage,
  reminderTimes, replyLanguage, said, savedLine, total, type State, type VoiceJob, BOT,
} from "./logic.ts";

// libsignal (inside Baileys) prints whole encryption sessions to the console: hide those, keep everything else
for (const level of ["info", "warn", "log"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...a: unknown[]) => {
    if (typeof a[0] === "string" && /^(Closing (open )?session|Removing old closed session|Session error)/.test(a[0])) return;
    orig(...a);
  };
}

const HERE = import.meta.dirname;
if (existsSync(join(HERE, ".env"))) process.loadEnvFile(join(HERE, ".env"));
const env = (k: string, d = "") => (process.env[k] ?? d).trim();
const LANG = replyLanguage(env("REPLY_LANGUAGE", "roman-urdu"));
const GROUPS = !/^(no|off|false|0)$/i.test(env("GROUPS", "yes"));
const MAX_SENDS_PER_HOUR = Number(env("MAX_SENDS_PER_HOUR", "15"));
const DEBUG = /^(yes|on|true|1)$/i.test(env("DEBUG", "yes"));   // logs only message TYPE info, never content
const CUR = env("CURRENCY", "Rs");
const EXPENSES = env("EXPENSES_FILE") || join(HERE, "expenses.csv");
const BILLS_DIR = join(HERE, "bills");
const REMINDER_HOUR = Number(env("REMINDER_HOUR", "10"));
const DEMO_SECONDS = Number(env("REMINDER_DEMO_SECONDS", "0"));  // recording only: first reminder after N seconds
if (!env("GROQ_API_KEY")) { console.error("Missing GROQ_API_KEY in .env (free key: https://console.groq.com/keys)"); process.exit(1); }
// CLAUDE_CODE_OAUTH_TOKEN is optional: without it, the Claude Code login on this computer is used.

// ------------------------------------------------------------------ only one copy at a time
// Two copies on the same WhatsApp link keep kicking each other off, so a second copy just exits.
const LOCK = join(HERE, "bot.lock");
try {
  const other = Number(readFileSync(LOCK, "utf8"));
  if (other && other !== process.pid) {
    process.kill(other, 0);                                // throws if that process is gone
    console.log(new Date().toLocaleTimeString(), `Already running (process ${other}). This copy exits.`);
    process.exit(0);
  }
} catch { /* no lock, or a stale one from a crash */ }
writeFileSync(LOCK, String(process.pid));
const unlock = () => { try { if (readFileSync(LOCK, "utf8") === String(process.pid)) unlinkSync(LOCK); } catch { /* gone */ } };
process.on("exit", unlock);
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"] as const) process.on(sig, () => process.exit(0));

// ------------------------------------------------------------------ state
const STATE = join(HERE, "state.json");
const load = (): State => {
  try { return { ...emptyState(), ...JSON.parse(readFileSync(STATE, "utf8")) }; } catch { return emptyState(); }
};
const save = (st: State) => writeFileSync(STATE, JSON.stringify(st, null, 1));
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

// ------------------------------------------------------------------ Groq + Claude
async function transcribe(audio: Buffer): Promise<{ text: string; language?: string }> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/ogg" }), "voice.ogg");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}` }, body: form,
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error(`Groq ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return { text: d.text ?? "", language: d.language };
}

function claudeExe(): string {
  if (env("CLAUDE_EXE")) return env("CLAUDE_EXE");
  // a Claude Code installed on its own (claude.exe / claude on PATH) first: it has its own login
  const names = process.platform === "win32" ? ["claude.exe"] : ["claude"];
  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n);
  }
  // otherwise the copy inside the Claude desktop app (needs CLAUDE_CODE_OAUTH_TOKEN from "claude setup-token")
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const base = join(process.env.LOCALAPPDATA, "Claude-Data");
    const found: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 5 || !existsSync(d)) return;
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (n === "claude.exe") found.push(p);
        else if (statSync(p).isDirectory()) walk(p, depth + 1);
      }
    };
    walk(base, 0);
    found.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
    if (found.length) return found.at(-1)!;
  }
  return "claude";
}
const CLAUDE = claudeExe();
const EMPTY = join(HERE, ".claude_empty");
mkdirSync(EMPTY, { recursive: true });

/** Claude Code on your Claude Pro plan. No tools by default: it can only read the text and write an answer.
 *  For bill photos it gets the Read tool only, inside a folder that holds just that one photo. */
function askClaude(prompt: string, readOnlyIn?: string): Promise<string> {
  const tools = readOnlyIn ? ["--tools", "Read", "--allowedTools", "Read"] : ["--tools", ""];
  return new Promise((resolve, reject) => {
    const child = execFile(CLAUDE, ["-p", prompt, ...tools, "--output-format", "text", "--no-session-persistence"], {
      cwd: readOnlyIn ?? EMPTY, timeout: 120_000, maxBuffer: 1 << 20, windowsHide: true,
      env: env("CLAUDE_CODE_OAUTH_TOKEN") ? { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: env("CLAUDE_CODE_OAUTH_TOKEN") } : process.env,
    }, (err, out) => {
      if (/Not logged in/i.test(out ?? "")) {
        return reject(new Error("Claude Code is not logged in. Run \"claude setup-token\" and put the token in .env as CLAUDE_CODE_OAUTH_TOKEN."));
      }
      return err ? reject(new Error(String(err).slice(0, 200))) : resolve(out.trim());
    });
    child.stdin?.end();
  });
}

// ------------------------------------------------------------------ WhatsApp
const quiet = pino({ level: "silent" });
let queue: Promise<unknown> = Promise.resolve();          // one voice note at a time
const groupNames = new Map<string, string>();
const seenIds = new Set<string>();                         // a message can arrive twice ("notify" and "append")
let sendToMe: ((text: string) => Promise<unknown>) | null = null;   // set while connected
let drops = 0;                                                       // failed reconnects in a row

// ------------------------------------------------------------------ expenses.csv and loans.csv
const LOANS = env("LOANS_FILE") || join(HERE, "loans.csv");
const readExpenses = () => (existsSync(EXPENSES) ? parseCsv(readFileSync(EXPENSES, "utf8")) : []);
const readLoans = () => (existsSync(LOANS) ? parseLoanCsv(readFileSync(LOANS, "utf8")) : []);
function addRow(file: string, header: string, line: string) {
  if (!existsSync(file)) writeFileSync(file, "﻿" + header + "\r\n");   // BOM: Excel shows Urdu/₹ right
  appendFileSync(file, line + "\r\n");
}
function removeLastRow(file: string): string | null {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const last = lines.pop()!;
  writeFileSync(file, lines.join("\r\n") + "\r\n");
  return last;
}

// ------------------------------------------------------------------ reminders: checked every 30 s
setInterval(() => {
  if (!sendToMe) return;
  const st = load();
  const due = (st.reminders ?? []).filter((r) => !r.done && r.at <= Date.now());
  if (!due.length) return;
  for (const r of due) { r.done = true; }
  save(st);
  for (const r of due) {
    sendToMe(r.text).then(() => log(`reminder sent for bill #${r.bill} (${r.kind})`)).catch((e) => log("reminder failed:", String(e)));
  }
}, 30_000);

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(join(HERE, "auth"));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: quiet, browser: Browsers.windows("Claude Assistant"),
    markOnlineOnConnect: false, syncFullHistory: false });
  sock.ev.on("creds.update", saveCreds);

  const me = () => [sock.user?.id, (sock.user as any)?.lid].filter(Boolean).map((j) => jidNormalizedUser(j!));
  const selfChat = () => me()[0];
  const isSelfChat = (jid?: string | null) => !!jid && me().includes(jidNormalizedUser(jid));
  const toMe = (text: string, quoted?: any) => sock.sendMessage(selfChat(), { text }, quoted ? { quoted } : undefined);

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("\nScan this with WhatsApp on your phone: Settings > Linked devices > Link a device\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      drops = 0;
      sendToMe = (text: string) => toMe(text);
      log("✅ Connected as", selfChat()?.split("@")[0].slice(0, 4) + "…", "| replies in", LANG);
      if (DEBUG) log(`[debug] my ids: ${me().map((j) => j.split("@")[1]).join(" + ")}`);
    }
    if (connection === "close") {
      sendToMe = null;
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) { log("Logged out from the phone. Delete the auth folder and start again."); process.exit(1); }
      // wait longer after each failed try (3 s, 6 s, 12 s … max 60 s) instead of hammering WhatsApp every 3 s
      const wait = code === DisconnectReason.restartRequired ? 1000 : Math.min(60_000, 3000 * 2 ** Math.min(drops, 5));
      drops++;
      const why = String((lastDisconnect?.error as any)?.message ?? "").slice(0, 80);
      const hint = code === DisconnectReason.connectionReplaced ? " (another copy of the bot, or the same link, connected elsewhere)"
        : code === DisconnectReason.timedOut ? " (internet/phone not answering)" : "";
      log(`Connection dropped: code ${code ?? "?"} ${why}${hint}. Retry in ${wait / 1000}s`);
      setTimeout(start, wait);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    for (const raw of messages) {
      const jid = raw.key.remoteJid;
      if (DEBUG && jid !== "status@broadcast" && (raw.key.fromMe || isSelfChat(jid))) {
        log(`[debug] upsert=${type} fromMe=${raw.key.fromMe} selfChat=${isSelfChat(jid)} chatType=${jid?.split("@")[1]} ` +
          `stub=${raw.messageStubType ?? "-"} content=${Object.keys(normalizeMessageContent(raw.message) ?? {}).join(",") || "none"}`);
      }
      // unwrap disappearing-message / edited wrappers so commands are found either way
      const m = { ...raw, message: normalizeMessageContent(raw.message) };
      if (!jid || jid === "status@broadcast" || !m.message) continue;
      if (m.key.id) { if (seenIds.has(m.key.id)) continue; seenIds.add(m.key.id); if (seenIds.size > 2000) seenIds.clear(); }
      const ageSec = Date.now() / 1000 - Number(m.messageTimestamp ?? 0);

      // your commands, typed in "Message yourself" (your phone's own messages can arrive as "append", so accept
      // those too, but only if they're fresh: never act on old history)
      const text = m.message.conversation ?? m.message.extendedTextMessage?.text;
      if (m.key.fromMe && text && !text.startsWith(BOT) && DEBUG) {
        log(`[debug] your text: upsert=${type} selfChat=${isSelfChat(jid)} chatType=${jid.split("@")[1]} age=${Math.round(ageSec)}s command=${!!parseCommand(text)}`);
      }
      if (m.key.fromMe && isSelfChat(jid) && text && !text.startsWith(BOT) && ageSec < 120) {
        const quotedId = m.message.extendedTextMessage?.contextInfo?.stanzaId ?? undefined;
        queue = queue.then(() => command(text, quotedId, m)).catch((e) => log("command failed:", String(e)));
        continue;
      }

      // a photo you send to your own chat: read it as a bill
      if (m.key.fromMe && isSelfChat(jid) && m.message.imageMessage && ageSec < 120) {
        queue = queue.then(() => bill(m)).catch((e) => log("bill photo failed:", String(e)));
        continue;
      }

      // voice notes: from others, or ones you forward to yourself (new ones only)
      if (type !== "notify" && ageSec > 120) continue;
      const audio = m.message.audioMessage;
      if (!audio) continue;
      if (m.key.fromMe && !isSelfChat(jid)) continue;      // your own voice notes to others
      const group = isJidGroup(jid);
      if (group && !GROUPS) continue;
      queue = queue.then(() => voice(m, jid, group, audio.seconds ?? undefined)).catch((e) => log("voice note failed:", String(e)));
    }
  });

  async function voice(m: any, jid: string, group: boolean, seconds?: number) {
    const t0 = Date.now();
    const self = isSelfChat(jid);
    let groupName: string | undefined;
    if (group) {
      groupName = groupNames.get(jid) ?? (await sock.groupMetadata(jid).then((g) => g.subject).catch(() => "a group"));
      groupNames.set(jid, groupName!);
    }
    const from = self ? "You (forwarded)" : (m.pushName || "Someone");
    const audio = await downloadMediaMessage(m, "buffer", {}, { logger: quiet, reuploadRequest: sock.updateMediaMessage }) as Buffer;
    const t = await transcribe(audio);
    if (!t.text.trim()) return;
    const job: VoiceJob = { from, group: groupName, seconds, transcript: t.text, wantReply: !group && !self, lang: LANG };
    const { summary, reply } = parseAnswer(await askClaude(buildPrompt(job)));

    const st = load();
    const id = st.next++;
    const card = await toMe(formatCard(id, job, summary, reply));
    st.pending.push({ id, to: jid, name: from, suggestion: reply, cardId: card?.key.id ?? undefined, at: Date.now() });
    prune(st, Date.now());
    save(st);
    log(`#${id} summarised a ${seconds ?? "?"}s voice note${group ? " (group)" : ""} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  async function command(text: string, quotedId: string | undefined, m: any) {
    const cmd = parseCommand(text);
    if (!cmd) {                                            // ordinary notes to yourself are left alone,
      const why = expenseSkipReason(text);                 // unless Claude says it's money you spent
      if (!why) await expense(text, m);
      else log(`note to self: not checked as an expense (${why})`);
      return;
    }
    if (cmd.kind === "help") { await toMe(HELP); return; }
    if (cmd.kind === "expenses") { await toMe(expenseReport(readExpenses(), new Date(), cmd.period, LANG, CUR), m); return; }
    if (cmd.kind === "loans") { await toMe(loanReport(readLoans(), LANG, CUR), m); return; }
    if (cmd.kind === "undo") {                             // removes the newest saved line (expense or udhaar)
      const st0 = load();
      const last = removeLastRow(st0.lastEntry === "loan" ? LOANS : EXPENSES);
      st0.lastEntry = undefined;
      save(st0);
      await toMe(last ? `${BOT} ↩️ ${LANG === "roman-urdu" ? "Hata diya" : "Removed"}: ${last.split(",").slice(2).join(" · ")}`
        : `${BOT} ${LANG === "roman-urdu" ? "Hatane ko kuch nahi mila." : "Nothing to remove."}`, m);
      return;
    }
    if (cmd.kind === "reminders") {
      const up = (load().reminders ?? []).filter((r) => !r.done).sort((a, b) => a.at - b.at);
      const fmt = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      await toMe(up.length ? `${BOT} ⏰ *${LANG === "roman-urdu" ? "Aane wale reminders" : "Upcoming reminders"}:*\n` +
        up.map((r) => `• ${fmt(r.at)}: ${r.text.replace(/^🤖 ⏰ \*[^*]+\* ?/, "")}`).join("\n")
        : `${BOT} ⏰ ${LANG === "roman-urdu" ? "Koi reminder nahi." : "No reminders."}`, m);
      return;
    }
    const st = load();
    const p = findPending(st, cmd, quotedId);
    if (!p) { await toMe(`${BOT} I couldn't find that summary. Reply directly to the summary card, or use its # number.`, m); return; }
    if (p.done) { await toMe(`${BOT} #${p.id} was already ${p.done}.`, m); return; }
    if (cmd.kind === "skip") { p.done = "skipped"; save(st); await toMe(said(LANG, "skipped", p.name, p.id), m); return; }

    const body = cmd.text ?? p.suggestion;
    if (!body) { await toMe(`${BOT} #${p.id} has no suggested reply. Use *send: your words*.`, m); return; }
    if (!canSend(st, Date.now(), MAX_SENDS_PER_HOUR)) {
      save(st);
      await toMe(`${BOT} Paused: already ${MAX_SENDS_PER_HOUR} replies sent this hour (keeps your number safe). Try again later.`, m);
      return;
    }
    await sock.sendMessage(p.to, { text: body });
    p.done = "sent";
    st.sends.push(Date.now());
    save(st);
    await toMe(said(LANG, "sent", p.name, p.id), m);
    log(`#${p.id} reply sent (${cmd.text ? "your words" : "suggested"})`);
  }

  async function expense(text: string, m: any) {
    const t0 = Date.now();
    const answer = await askClaude(expensePrompt(text));
    const list = parseExpenses(answer);
    const loans = parseLoans(answer);
    if (!list.length && !loans.length) { log("note to self: Claude says no expense or udhaar"); return; }
    const now = new Date();
    for (const e of list) addRow(EXPENSES, CSV_HEADER, csvLine(e, now));
    for (const l of loans) addRow(LOANS, LOANS_HEADER, loanCsvLine(l, now));
    const st = load();
    st.lastEntry = loans.length ? "loan" : "expense";
    save(st);
    const parts: string[] = [];
    if (list.length) parts.push(savedLine(list, total(readExpenses(), now, "today"), LANG, CUR));
    if (loans.length) parts.push(loanSavedLine(loans, readLoans(), LANG, CUR));
    await toMe(parts.join("\n\n").replace(new RegExp(`\\n\\n${BOT} `, "g"), "\n\n"), m);
    log(`${list.length} expense(s), ${loans.length} udhaar saved in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  async function bill(m: any) {
    const t0 = Date.now();
    const st = load();
    const id = st.next++;
    save(st);
    const dir = join(BILLS_DIR, String(id));                // one photo per folder: Claude can read only this
    mkdirSync(dir, { recursive: true });
    const img = await downloadMediaMessage(m, "buffer", {}, { logger: quiet, reuploadRequest: sock.updateMediaMessage }) as Buffer;
    writeFileSync(join(dir, "bill.jpg"), img);
    const b = parseBill(await askClaude(billPrompt("bill.jpg"), dir));
    if (!b) {
      await toMe(`${BOT} 🧾 ${LANG === "roman-urdu" ? "Is photo mein bill nahi mila." : "I didn't find a bill in this photo."}`, m);
      log(`photo #${id}: not a bill`);
      return;
    }
    const now = new Date();
    const times = b.due ? reminderTimes(b.due, now, REMINDER_HOUR, DEMO_SECONDS) : [];
    const st2 = load();
    st2.bills!.push({ ...b, id, at: Date.now() });
    for (const x of times) st2.reminders!.push({ id: st2.next++, bill: id, at: x.at, kind: x.kind, text: reminderMessage(b, x.kind, LANG, CUR) });
    prune(st2, Date.now());
    save(st2);
    await toMe(billCard(b, times, LANG, now, CUR), m);
    log(`bill #${id} read in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${times.length} reminder(s)`);
  }
}

log(`Starting… Claude: ${CLAUDE === "claude" ? "claude (PATH)" : "Claude Code from the desktop app"}`);
start();
