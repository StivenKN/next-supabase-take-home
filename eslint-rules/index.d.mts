import type { ESLint, Rule } from "eslint";

declare const plugin: ESLint.Plugin & {
  rules: Record<
    | "no-accumulating-spread"
    | "no-server-code-in-client"
    | "no-unreasoned-effect",
    Rule.RuleModule
  >;
};
export default plugin;
