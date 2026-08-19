// Frees the Vite dev port before launching the Electron app, so a leftover
// dev server never causes `npm run app` to fail (strictPort) and take the
// Electron window down with it. Safe no-op if nothing is listening.
const { execSync } = require("node:child_process");

const PORT = 5180;

try {
  if (process.platform === "win32") {
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (line.includes(`:${PORT} `) && /LISTENING/i.test(line)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && pid !== "0") pids.add(pid);
      }
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`free-port: liberado 5180 (PID ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } else {
    try {
      execSync(`fuser -k ${PORT}/tcp`, { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
} catch {
  /* nothing listening — fine */
}
