const EFFECT_HOOKS = new Set([
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

// Agents read this message and act on it, so it walks the alternatives before the way out.
const MESSAGE =
  "Reconsider this effect before keeping it. " +
  "Computable from props or state? Compute it during render. " +
  "Responds to a user action? Do it in that event handler. " +
  "Resets state when a prop changes? Pass that prop as the component's `key`. " +
  "Loads data? Fetch it in a Server Component or a Route Handler, not in an effect. " +
  "Reads a value from outside React? Use useSyncExternalStore. " +
  "An effect is right only when it keeps something outside React in step with this component " +
  "while it is mounted: a DOM node, an event listener, a timer, a subscription, or a connection. " +
  "Moving the same logic into a ref to dodge this rule is not a fix. " +
  "If the effect does that, name what it syncs with on the line above: " +
  "`// eslint-disable-next-line local/no-unreasoned-effect -- <what it syncs with and why>`.";

function hookName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Report every React effect hook; one that stays carries its reason in the suppression.",
    },
    schema: [],
  },
  create(context) {
    if (TEST_FILE.test(context.filename)) return {};
    const effectNames = new Set(EFFECT_HOOKS);
    return {
      ImportDeclaration(node) {
        if (node.source.value !== "react") return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            EFFECT_HOOKS.has(
              specifier.imported.name ?? specifier.imported.value,
            )
          ) {
            effectNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (effectNames.has(hookName(node.callee) ?? "")) {
          context.report({ node: node.callee, message: MESSAGE });
        }
      },
    };
  },
};
export default rule;
