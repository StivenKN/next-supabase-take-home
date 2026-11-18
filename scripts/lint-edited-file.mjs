// Claude Code PostToolUse hook: lint the file an agent just wrote and hand the errors back to it.
// Exit code 2 makes Claude Code show stderr to the agent so it fixes the file before moving on.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const LINTED = /\.(?:[cm]?[jt]s|[jt]sx)$/;

const input = JSON.parse(readFileSync(0, "utf8"));
const editedPath = input.tool_input?.file_path;

if (typeof editedPath !== "string" || !LINTED.test(editedPath) || !existsSync(editedPath)) {
  process.exit(0);
}

// Compare real paths: git and ESLint resolve symlinks, CLAUDE_PROJECT_DIR may not.
const filePath = realpathSync(editedPath);
const projectDir = realpathSync(process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());

// Subagent worktrees live inside the project, so lint with the checkout that owns the file.
const topLevel = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: path.dirname(filePath),
  encoding: "utf8",
});
const checkout = topLevel.status === 0 ? realpathSync(topLevel.stdout.trim()) : "";
const insideProject = checkout === projectDir || checkout.startsWith(projectDir + path.sep);
const hasBoundaryConfig = existsSync(path.join(checkout, "eslint.boundary.config.mjs"));
// ESLint's own entry point, run with this Node, so no shell shim is involved.
const eslintCli = (dir) => path.join(dir, "node_modules", "eslint", "bin", "eslint.js");
const ownEslint = eslintCli(checkout);
// A fresh nested worktree has no install. Borrow the project's ESLint only for checkouts with this
// lint setup; an older branch's config imports packages the project no longer has.
const borrowedEslint = eslintCli(projectDir);
const eslint = existsSync(ownEslint)
  ? ownEslint
  : hasBoundaryConfig && existsSync(borrowedEslint)
    ? borrowedEslint
    : undefined;

if (!insideProject || !eslint) process.exit(0);

const run = (args) =>
  spawnSync(process.execPath, [eslint, ...args, "--no-warn-ignored", filePath], {
    cwd: checkout,
    encoding: "utf8",
  });
let result = run(["--max-warnings", "0"]);
// The boundary pass ignores eslint-disable comments, so the server/client rule cannot be switched off.
if (result.status === 0 && hasBoundaryConfig) {
  result = run(["-c", "eslint.boundary.config.mjs", "--no-inline-config", "--quiet"]);
}

if (result.status === 0) process.exit(0);

// ESLint exits 1 for lint problems; anything else means it could not run at all.
const preamble =
  result.status === 1
    ? `ESLint reports problems in ${path.relative(checkout, filePath)}; each message says how to fix it. ` +
      `If an edit you are about to make resolves them (an import whose use comes next), carry on. ` +
      `Otherwise fix them now. A rule may be disabled only with ` +
      `\`// eslint-disable-next-line <rule> -- <reason>\`, ` +
      `except local/no-server-code-in-client, which cannot be disabled.`
    : `ESLint could not run in ${checkout}. This is not a problem in the file you edited. ` +
      `Usually node_modules is older than package.json: run \`pnpm install\` there. ` +
      `Do not edit the ESLint config to get past it.`;
const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
process.stderr.write(`${preamble}\n\n${output}`);
process.exit(2);
