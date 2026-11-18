import path from "node:path";

const SERVER_MODULES = [
  {
    pattern: /(?:^|\/)lib\/supabase\/server(?:\/index)?(?:\.[cm]?[jt]sx?)?$/,
    message:
      "`{{source}}` holds the cookie-bound and service-role Supabase clients and must never reach the browser. " +
      "In a Client Component use `createClient` from `@/lib/supabase/client`, " +
      "or move the privileged work into a Server Component, Server Action, or Route Handler. " +
      "Only need its types? Use `import type { … }`; `import { type … }` still loads the module.",
  },
  {
    pattern: /^next\/headers$/,
    message:
      "`next/headers` only works on the server. Read cookies or headers in a Server Component " +
      "and pass the values down as props.",
  },
  {
    pattern: /^server-only$/,
    message:
      "A `\"use client\"` file cannot import `server-only`. Split the server part into its own module.",
  },
];

const PUBLIC_ENV = /^NEXT_PUBLIC_/;
const ALWAYS_INLINED_ENV = new Set(["NODE_ENV"]);

const ENV_MESSAGE =
  "`process.env.{{name}}` is not available in a `\"use client\"` file: Next.js only inlines " +
  "`NEXT_PUBLIC_*` variables into the browser bundle, so this reads `undefined` there. " +
  "Secrets such as `SUPABASE_SECRET_KEY` must stay on the server. " +
  "Read it in a Server Component, Server Action, or Route Handler and pass down only what the browser may see.";

function isClientModule(program) {
  for (const statement of program.body) {
    if (statement.type !== "ExpressionStatement" || typeof statement.directive !== "string") {
      return false;
    }
    if (statement.directive === "use client") return true;
  }
  return false;
}

function envName(node) {
  if (!isProcessEnv(node.object)) return undefined;
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.computed && node.property.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Keep server-only modules and non-public environment variables out of "use client" files.',
    },
    schema: [],
  },
  create(context) {
    let client = false;

    function checkSource(node, sourceNode) {
      if (!client) return;
      const source = staticString(sourceNode);
      if (source === undefined) return;
      // `./server` from lib/supabase/ is the same module as `@/lib/supabase/server`.
      const resolved = source.startsWith(".")
        ? path.resolve(path.dirname(context.filename), source).split(path.sep).join("/")
        : source;
      const match = SERVER_MODULES.find(({ pattern }) => pattern.test(resolved));
      if (match) context.report({ node, message: match.message, data: { source } });
    }

    return {
      Program(node) {
        client = isClientModule(node);
      },
      ImportDeclaration(node) {
        if (!isTypeOnly(node, "importKind")) checkSource(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (!isTypeOnly(node, "exportKind")) checkSource(node, node.source);
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== "type") checkSource(node, node.source);
      },
      ImportExpression(node) {
        checkSource(node, node.source);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          checkSource(node, node.arguments[0]);
        }
      },
      MemberExpression(node) {
        if (!client) return;
        const name = envName(node);
        if (name !== undefined) reportEnv(node, name);
      },
      VariableDeclarator(node) {
        if (!client || node.id.type !== "ObjectPattern" || !isProcessEnv(node.init)) return;
        for (const property of node.id.properties) {
          if (property.type === "Property" && !property.computed && property.key.type === "Identifier") {
            reportEnv(property, property.key.name);
          }
        }
      },
    };

    function reportEnv(node, name) {
      if (PUBLIC_ENV.test(name) || ALWAYS_INLINED_ENV.has(name)) return;
      context.report({ node, message: ENV_MESSAGE, data: { name } });
    }
  },
};

/**
 * `import type` is erased at build time. `import { type X }` is not: under verbatimModuleSyntax it
 * leaves `import {}` behind, which still loads the module into the client bundle.
 */
function isTypeOnly(node, kind) {
  return node[kind] === "type";
}

function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function isProcessEnv(node) {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.object.name === "process" &&
    node.property.type === "Identifier" &&
    node.property.name === "env"
  );
}
export default rule;
