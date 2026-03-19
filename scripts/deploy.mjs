import { spawn } from "node:child_process";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function runWithOutput(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let out = "";
    p.stdout.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    p.stderr.on("data", (d) => {
      const s = d.toString();
      out += s;
      process.stderr.write(s);
    });

    p.on("close", (code) => {
      if (code === 0) return resolve(out);
      reject(new Error(out || `${cmd} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function ensureBucket(bucketName) {
  try {
    await runWithOutput("npx", ["wrangler", "r2", "bucket", "create", bucketName]);
  } catch (error) {
    const message = String(error?.message || error);
    // 桶已存在时继续部署
    if (message.includes("already exists") || message.includes("409")) {
      console.log(`[deploy] R2 bucket '${bucketName}' already exists, continue...`);
      return;
    }
    throw error;
  }
}

async function main() {
  const bucketName = "r2cloud";
  console.log(`[deploy] ensure R2 bucket: ${bucketName}`);
  await ensureBucket(bucketName);

  console.log("[deploy] deploy worker...");
  await run("npx", ["wrangler", "deploy"]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
