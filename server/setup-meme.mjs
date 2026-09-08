import { spawnSync } from "node:child_process";
const commands = [
  ["python3", ["-m", "venv", ".venv-rembg"]],
  [".venv-rembg/bin/python", ["-m", "pip", "install", "rembg[cpu]==2.0.72"]],
  [
    ".venv-rembg/bin/python",
    ["server/remove-background.py", "--setup", "human"],
  ],
  [
    ".venv-rembg/bin/python",
    ["server/remove-background.py", "--setup", "fast"],
  ],
];
for (const [cmd, args] of commands) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}
