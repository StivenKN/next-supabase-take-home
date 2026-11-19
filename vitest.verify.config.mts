import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// `pnpm verify:pagination`: property checks that need the local Supabase stack
// with the CSV loaded, so they stay out of `pnpm test:run`. See
// .agents/skills/verify-coffee-health-pagination/SKILL.md.
const env = existsSync(".env.local")
  ? parseEnv(readFileSync(".env.local", "utf8"))
  : {};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["**/*.verify.ts"],
    exclude: ["node_modules/**", ".claude/worktrees/**"],
    env: Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] =>
          entry[0].startsWith("NEXT_PUBLIC_") && entry[1] !== undefined,
      ),
    ),
    testTimeout: 600_000,
    reporters: ["verbose"],
  },
});
