import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const command = process.argv[2];
if (!["dev", "build", "start"].includes(command)) throw new Error("Expected dev, build or start");
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), command, ...(command === "build" ? [] : ["-p", process.env.BACKEND_PORT || "3000"])], { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, SERVICE_ROLE: "backend" } });
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
