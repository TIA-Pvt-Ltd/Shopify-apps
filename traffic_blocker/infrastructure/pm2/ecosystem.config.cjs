module.exports = {
  apps: [
    {
      name: "traffic-blocker-api",
      cwd: "apps/backend",
      script: "src/index.ts",
      interpreter: "node",
      node_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
    },
    {
      name: "traffic-blocker-worker",
      cwd: "apps/backend",
      script: "src/worker.ts",
      interpreter: "node",
      node_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
    },
  ],
};
