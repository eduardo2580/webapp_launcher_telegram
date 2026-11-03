import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env');
const ignoreCheck = spawnSync('git', ['check-ignore', '--quiet', '.env'], { stdio: 'ignore' });

if (ignoreCheck.error || ignoreCheck.status !== 0) {
  console.error('Safety check failed: .env is not confirmed ignored by Git. No token was saved.');
  process.exit(1);
}

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  console.error('Run this command in an interactive terminal so the token can be entered without echo.');
  process.exit(1);
}

function readHiddenToken() {
  return new Promise((resolveToken, reject) => {
    const input = process.stdin;
    let token = '';
    let finished = false;
    const wasRaw = input.isRaw;

    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolveToken(value);
    };

    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          finish(new Error('Cancelled.'));
          return;
        }
        if (byte === 4) {
          finish(new Error('Cancelled.'));
          return;
        }
        if (byte === 13 || byte === 10) {
          finish(null, token.trim());
          return;
        }
        if (byte === 8 || byte === 127) {
          token = token.slice(0, -1);
          continue;
        }
        if (byte >= 32 && byte <= 126) token += String.fromCharCode(byte);
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

process.stdout.write('Paste the NEW token from @BotFather (input hidden): ');

let token;
try {
  token = await readHiddenToken();
} catch {
  console.error('Cancelled. No token was saved.');
  process.exit(1);
}

if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  console.error('That does not look like a Telegram bot token. No token was saved.');
  process.exit(1);
}

let existing = '';
if (existsSync(envPath)) existing = readFileSync(envPath, 'utf8');
const otherLines = existing
  .split(/\r?\n/)
  .filter((line) => !/^\s*(?:export\s+)?TELEGRAM_BOT_TOKEN\s*=/.test(line));
while (otherLines.length && otherLines[otherLines.length - 1] === '') otherLines.pop();

const contents = `${otherLines.length ? `${otherLines.join('\n')}\n` : ''}TELEGRAM_BOT_TOKEN=${token}\n`;
const temporaryPath = `${envPath}.${randomUUID()}.tmp`;
let descriptor;
try {
  descriptor = openSync(temporaryPath, 'wx', 0o600);
  writeFileSync(descriptor, contents, 'utf8');
  closeSync(descriptor);
  descriptor = undefined;
  renameSync(temporaryPath, envPath);
  console.log('Token saved to ignored .env. Restart the dev server to use it.');
} catch {
  if (descriptor !== undefined) closeSync(descriptor);
  try {
    unlinkSync(temporaryPath);
  } catch {}
  console.error('Could not save .env. No token was printed; check file permissions and try again.');
  process.exitCode = 1;
}

token = '';
