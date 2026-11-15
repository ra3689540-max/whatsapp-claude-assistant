// node test/try_claude.ts [bill photo]   (uses your Claude plan, no WhatsApp)
// Runs the real expense and bill prompts through Claude Code exactly as the bot does, and prints what the bot would send.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  billCard, billPrompt, expensePrompt, expenseSkipReason, parseBill, parseExpenses, parseLoans, reminderTimes, savedLine,
} from "../logic.ts";

const HERE = join(import.meta.dirname, "..");
if (existsSync(join(HERE, ".env"))) process.loadEnvFile(join(HERE, ".env"));

function claudeExe(): string {
  if (process.env.CLAUDE_EXE) return process.env.CLAUDE_EXE;
  const names = process.platform === "win32" ? ["claude.exe"] : ["claude"];
  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n);
  }
  const base = join(process.env.LOCALAPPDATA ?? "", "Claude-Data");
  const found: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 5 || !existsSync(d)) return;
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (n === "claude.exe") found.push(p); else if (statSync(p).isDirectory()) walk(p, depth + 1);
    }
  };
  walk(base, 0);
  found.sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return found.at(-1) ?? "claude";
}
const CLAUDE = claudeExe();

function ask(prompt: string, readOnlyIn?: string): Promise<string> {
  const tools = readOnlyIn ? ["--tools", "Read", "--allowedTools", "Read"] : ["--tools", ""];
  const cwd = readOnlyIn ?? join(HERE, ".claude_empty");
  mkdirSync(cwd, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = execFile(CLAUDE, ["-p", prompt, ...tools, "--output-format", "text", "--no-session-persistence"],
      { cwd, timeout: 120_000, windowsHide: true }, (e, out) => {
        if (/Not logged in/i.test(out ?? "")) {
          console.error([
            "", "Claude Code is not logged in for background use.",
            "Fix: run  claude setup-token  (needs a Claude Pro/Max plan), log in, and put the token in .env as",
            "CLAUDE_CODE_OAUTH_TOKEN=...   Then run this test again.", "",
          ].join("\n"));
          process.exit(1);
        }
        return e ? reject(e) : resolve(out.trim());
      });
    child.stdin?.end();
  });
}

const notes = process.env.TRY_NOTES?.split("|") ?? ["petrol 500", "doodh 220", "dinner with family 1500",
  "meeting at 3 with Ali", "bijli ka bill 8,430"];
let today = 0;
for (const n of notes) {
  const why = expenseSkipReason(n);
  if (why) { console.log(`"${n}" -> skipped before Claude (${why})`); continue; }
  const t0 = Date.now();
  const answer = await ask(expensePrompt(n));
  const list = parseExpenses(answer);
  const loans = parseLoans(answer);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (loans.length) console.log(`"${n}" -> udhaar ${JSON.stringify(loans)} (${secs}s)`);
  if (!list.length && loans.length) continue;
  if (!list.length) { console.log(`"${n}" -> not an expense (${secs}s) raw=${answer.slice(0, 60)}`); continue; }
  today += list.reduce((s, e) => s + e.amount, 0);
  console.log(`"${n}" -> ${JSON.stringify(list)} (${secs}s)\n   ${savedLine(list, today, "roman-urdu").replace(/\n/g, "\n   ")}`);
}

const photo = process.argv[2];
if (photo) {
  const dir = join(HERE, "bills", "test");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  copyFileSync(photo, join(dir, "bill.jpg"));
  const t0 = Date.now();
  const answer = await ask(billPrompt("bill.jpg"), dir);
  const b = parseBill(answer);
  console.log(`\nbill photo -> ${JSON.stringify(b)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!b) console.log("raw:", answer.slice(0, 300));
  else console.log(billCard(b, b.due ? reminderTimes(b.due, new Date()) : [], "roman-urdu", new Date()));
  rmSync(dir, { recursive: true, force: true });
}
