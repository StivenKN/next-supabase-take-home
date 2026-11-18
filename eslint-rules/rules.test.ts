// @vitest-environment node
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import local from "./index.mjs";

const {
  "no-accumulating-spread": noAccumulatingSpread,
  "no-server-code-in-client": noServerCodeInClient,
  "no-unreasoned-effect": noUnreasonedEffect,
} = local.rules;

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-unreasoned-effect", noUnreasonedEffect, {
  valid: [
    "const value = useMemo(() => compute(a), [a]);",
    "useState(0);",
    { code: "useEffect(() => {}, []);", filename: "app/table.test.tsx" },
  ],
  invalid: [
    { code: "useEffect(() => setRows(filter(data)), [data]);", errors: 1 },
    { code: "React.useLayoutEffect(() => {}, []);", errors: 1 },
    { code: 'import { useEffect as useFx } from "react";\nuseFx(() => {}, []);', errors: 1 },
    { code: "useInsertionEffect(() => {});", errors: 1 },
  ],
});

ruleTester.run("no-accumulating-spread", noAccumulatingSpread, {
  valid: [
    "rows.reduce((acc, row) => { acc[row.id] = row; return acc; }, {});",
    "rows.reduce((acc, row) => [...row.tags, acc], []);",
    "const merged = { ...defaults, ...overrides };",
    "for (const row of rows) { const next = [...previous, row]; }",
    "for (const row of rows) { list.forEach((acc) => { acc = [...acc]; }); }",
    "rows.forEach((row) => { const next = [...out, row]; send(next); });",
    "for (const row of rows) { let batch = []; batch = [...batch, row]; }",
    "rows.reduce((acc, row) => { acc.push(...row.children.concat(extra)); return acc; }, []);",
    "const all = first.concat(second);",
    "rows.reduce((acc, row) => { for (const acc of row.groups) consume([...acc]); return acc; }, []);",
    "for (let out of rows) { out = [...out, 1]; }",
    "let out = rows; for (out = [...out]; out.length; ) { consume(out.pop()); }",
    'rows.reduce((acc, row) => acc.concat(row.id), "");',
  ],
  invalid: [
    { code: "rows.reduce((acc, row) => ({ ...acc, [row.id]: row }), {});", errors: 1 },
    { code: "rows.reduce((acc, row) => [...acc, row.id], []);", errors: 1 },
    { code: "rows.reduceRight((acc = [], row) => [...acc, row], []);", errors: 1 },
    { code: "let out = []; for (const row of rows) { out = [...out, row]; }", errors: 1 },
    { code: "for (let out = [], i = 0; i < n; i++) { out = [...out, i]; }", errors: 1 },
    { code: "let map = {}; while (next()) { map = { ...map, [k]: v }; }", errors: 1 },
    { code: "let out = []; rows.forEach((row) => { out = [...out, row]; });", errors: 1 },
    { code: "rows.reduce((acc, row) => acc.concat(row.tags), []);", errors: 1 },
    { code: "rows.reduce((acc, row) => acc.concat(row.tags), [] as string[]);", errors: 1 },
    { code: "let out: Row[] = []; for (const row of rows) { out = [...out, row] as Row[]; }", errors: 1 },
  ],
});

const CLIENT = '"use client";\n';

ruleTester.run("no-server-code-in-client", noServerCodeInClient, {
  valid: [
    'import { createClient } from "@/lib/supabase/server";',
    'import { cookies } from "next/headers";',
    "const key = process.env.SUPABASE_SECRET_KEY;",
    `${CLIENT}import { createClient } from "@/lib/supabase/client";`,
    `${CLIENT}import { helpers } from "@/lib/supabase/server-helpers";`,
    { code: `${CLIENT}import { Row } from "./server";`, filename: "app/table/widget.tsx" },
    `${CLIENT}const url = process.env.NEXT_PUBLIC_SUPABASE_URL;`,
    `${CLIENT}const dev = process.env.NODE_ENV === "development";`,
    `${CLIENT}const { NEXT_PUBLIC_SUPABASE_URL } = process.env;`,
    '"use strict";\nconst key = process.env.SUPABASE_SECRET_KEY;',
    'const a = 1;\n"use client";\nimport { createAdminClient } from "@/lib/supabase/server";',
    `${CLIENT}import type { SupabaseClient } from "@/lib/supabase/server";`,
    `${CLIENT}export type { SupabaseClient } from "@/lib/supabase/server";`,
    `${CLIENT}export type * from "@/lib/supabase/server";`,
  ],
  invalid: [
    { code: `${CLIENT}import { createAdminClient } from "@/lib/supabase/server";`, errors: 1 },
    { code: `${CLIENT}import { createClient } from "../../lib/supabase/server";`, errors: 1 },
    { code: `${CLIENT}import { createClient } from "../lib/supabase/server.js";`, errors: 1 },
    {
      code: `${CLIENT}import { createClient } from "./server";`,
      filename: "lib/supabase/widget.tsx",
      errors: 1,
    },
    { code: `${CLIENT}import { createClient } from "@/lib/supabase/server/index";`, errors: 1 },
    { code: `${CLIENT}export { createClient } from "@/lib/supabase/server";`, errors: 1 },
    { code: `${CLIENT}const mod = import("@/lib/supabase/server");`, errors: 1 },
    { code: `${CLIENT}const mod = import(\`@/lib/supabase/server\`);`, errors: 1 },
    { code: `${CLIENT}const mod = require("@/lib/supabase/server");`, errors: 1 },
    { code: `${CLIENT}import { cookies } from "next/headers";`, errors: 1 },
    { code: `${CLIENT}import "server-only";`, errors: 1 },
    { code: `${CLIENT}import { type A, createClient } from "@/lib/supabase/server";`, errors: 1 },
    { code: `${CLIENT}import { type SupabaseClient } from "@/lib/supabase/server";`, errors: 1 },
    { code: `${CLIENT}const key = process.env.SUPABASE_SECRET_KEY;`, errors: 1 },
    { code: `${CLIENT}const key = process.env["SUPABASE_SECRET_KEY"];`, errors: 1 },
    { code: `${CLIENT}const { SUPABASE_SECRET_KEY } = process.env;`, errors: 1 },
    { code: `'use strict';\n'use client';\nconst k = process.env.SECRET;`, errors: 1 },
  ],
});
