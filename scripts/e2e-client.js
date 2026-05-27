const { spawn } = require("child_process")

const child = spawn("npm", ["run", "dev", "--workspace=packages/client"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    NEXT_PUBLIC_E2E_TEST_MODE: "true",
    PORT: process.env.PORT || "3000",
  },
  stdio: "inherit",
  shell: true,
})

const stop = () => {
  if (!child.killed) {
    child.kill("SIGTERM")
  }
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
child.on("exit", (code) => process.exit(code || 0))
