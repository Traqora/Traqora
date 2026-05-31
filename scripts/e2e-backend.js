const { spawn } = require("child_process")

const child = spawn("npm", ["run", "dev", "--workspace=packages/backend"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    E2E_TEST_MODE: "true",
    PORT: process.env.PORT || "3001",
    JWT_SECRET: "e2e-secret-key-at-least-32-chars-long",
    REDIS_URL: "",
    DATABASE_URL: "",
    LOG_LEVEL: "error",
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
