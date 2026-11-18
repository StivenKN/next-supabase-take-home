import noAccumulatingSpread from "./no-accumulating-spread.mjs";
import noServerCodeInClient from "./no-server-code-in-client.mjs";
import noUnreasonedEffect from "./no-unreasoned-effect.mjs";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "local" },
  rules: {
    "no-accumulating-spread": noAccumulatingSpread,
    "no-server-code-in-client": noServerCodeInClient,
    "no-unreasoned-effect": noUnreasonedEffect,
  },
};

export default plugin;
