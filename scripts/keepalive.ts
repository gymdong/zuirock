// Keeps Render (sleep) and Neon (auto-suspend) awake: GET /api/health?deep=1 every <= 4 minutes.
// Run: pnpm keepalive   (PUBLIC_ORIGIN from the environment or .env). Stop with Ctrl-C.
const INTERVAL_MS = 4 * 60 * 1000;
const TIMEOUT_MS = 60 * 1000;

const origin = (process.env.PUBLIC_ORIGIN ?? '').replace(/\/+$/, '');
if (!origin) {
  console.error('PUBLIC_ORIGIN is not set (use `node --env-file=.env` or export it).');
  process.exit(1);
}
const url = `${origin}/api/health?deep=1`;

let stopped = false;
let timer: NodeJS.Timeout | undefined;

async function ping(): Promise<void> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Date.now() - startedAt;
    const line = `${new Date().toISOString()} ${res.status} ${ms}ms`;
    if (res.ok) console.log(line);
    else console.error(`${line} FAILED body=${(await res.text()).slice(0, 200)}`);
  } catch (error) {
    console.error(`${new Date().toISOString()} FAILED ${(error as Error).message}`);
  }
}

async function loop(): Promise<void> {
  console.log(`keepalive -> ${url} every ${INTERVAL_MS / 1000}s (Ctrl-C to stop)`);
  while (!stopped) {
    await ping();
    await new Promise<void>((resolve) => {
      timer = setTimeout(resolve, INTERVAL_MS);
    });
  }
}

function stop(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  console.log('keepalive stopped');
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

void loop();
