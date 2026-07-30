import { spawnSync } from "node:child_process"

const git = (args) => spawnSync("git", args, { stdio: "ignore" })

if (git(["rev-parse", "--verify", "HEAD^"]).status !== 0) process.exit(1)

process.exit(
  git([
    "diff",
    "--quiet",
    "HEAD^",
    "HEAD",
    "--",
    "src",
    "public",
    "packages",
    "contracts",
    "config",
    "legal",
    "quality",
    "scripts",
    "site.config.js",
    "next-sitemap.config.js",
    "next.config.js",
    "vercel.json",
    "tsconfig.json",
    "package.json",
    "yarn.lock",
    "Dockerfile",
    "index.d.ts",
    "next-env.d.ts",
  ]).status ?? 1,
)
