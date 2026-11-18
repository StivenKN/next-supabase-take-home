const REDUCERS = new Set(["reduce", "reduceRight"]);
// Callbacks these call once per element, so reassigning an outer variable inside them is a loop.
const ITERATORS = new Set(["forEach", "map", "flatMap"]);
const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const TYPE_WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
]);
const FUNCTIONS = new Set([
  "FunctionExpression",
  "ArrowFunctionExpression",
  "FunctionDeclaration",
]);

const MESSAGE =
  "Spreading or concatenating `{{name}}` copies it on every iteration, so building n items costs O(n²). " +
  "This app's rows grow into the hundreds of thousands. " +
  "Mutate the accumulator you own instead (`acc[key] = value`, `acc.push(item)`), " +
  "or build the result with a `for` loop, `Map`, `Object.fromEntries`, or `Array.prototype.map`.";

function isCallbackOf(fn, methods) {
  const call = fn.parent;
  return (
    call?.type === "CallExpression" &&
    call.arguments[0] === fn &&
    call.callee.type === "MemberExpression" &&
    !call.callee.computed &&
    call.callee.property.type === "Identifier" &&
    methods.has(call.callee.property.name)
  );
}

/** True when `identifier` refers to the accumulator parameter of the reduce callback around it. */
function isReducerAccumulator(
  identifier,
  sourceCode,
  { arrayInitial = false } = {},
) {
  for (let ancestor = identifier.parent; ancestor; ancestor = ancestor.parent) {
    if (!FUNCTIONS.has(ancestor.type)) continue;
    if (!isCallbackOf(ancestor, REDUCERS)) return false;
    if (
      arrayInitial &&
      unwrapTypes(ancestor.parent.arguments[1])?.type !== "ArrayExpression"
    ) {
      return false;
    }
    const name = accumulatorName(ancestor);
    if (name !== identifier.name) return false;
    // Compare bindings, so an inner variable that reuses the name is not mistaken for it.
    const accumulator = sourceCode
      .getDeclaredVariables(ancestor)
      .find((v) => v.name === name);
    return resolve(sourceCode.getScope(identifier), name) === accumulator;
  }
  return false;
}

function unwrapTypes(node) {
  let current = node;
  while (TYPE_WRAPPERS.has(current?.type)) current = current.expression;
  return current;
}

function accumulatorName(fn) {
  const first = fn.params[0];
  if (first?.type === "Identifier") return first.name;
  if (first?.type === "AssignmentPattern" && first.left.type === "Identifier") {
    return first.left.name;
  }
  return undefined;
}

/** True for `acc = [...acc, x]` or `acc = { ...acc, k: v }` repeated by a loop or per-item callback. */
function reassignedInLoop(spread, name, sourceCode) {
  let value = spread.parent;
  while (TYPE_WRAPPERS.has(value.parent?.type)) value = value.parent;
  const assignment = value.parent;
  if (
    assignment?.type !== "AssignmentExpression" ||
    assignment.right !== value ||
    assignment.operator !== "=" ||
    assignment.left.type !== "Identifier" ||
    assignment.left.name !== name
  ) {
    return false;
  }
  let repeater;
  for (
    let ancestor = assignment.parent;
    ancestor && !repeater;
    ancestor = ancestor.parent
  ) {
    // A `for` initializer runs once, so an assignment there is not repeated by that loop.
    const inForInit =
      ancestor.type === "ForStatement" &&
      contains(ancestor.init ?? {}, assignment);
    if (LOOPS.has(ancestor.type) && !inForInit) repeater = ancestor;
    else if (FUNCTIONS.has(ancestor.type)) {
      if (!isCallbackOf(ancestor, ITERATORS)) return false;
      repeater = ancestor;
    }
  }
  if (!repeater) return false;
  // A variable declared inside the loop starts fresh each time, so nothing accumulates.
  // A `for (let acc = [];;)` initializer runs once, so that one does accumulate.
  const declaration = resolve(sourceCode.getScope(assignment), name)?.defs[0]
    ?.name;
  if (!declaration) return true;
  if (
    repeater.type === "ForStatement" &&
    repeater.init &&
    contains(repeater.init, declaration)
  ) {
    return true;
  }
  return !contains(repeater, declaration);
}

function resolve(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

function contains(outer, inner) {
  return (
    Boolean(outer.range) &&
    outer.range[0] <= inner.range[0] &&
    inner.range[1] <= outer.range[1]
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow copying an accumulator on every iteration of a reduce or loop.",
    },
    schema: [],
  },
  create(context) {
    return {
      SpreadElement(node) {
        if (node.argument.type !== "Identifier") return;
        const name = node.argument.name;
        if (
          isReducerAccumulator(node.argument, context.sourceCode) ||
          reassignedInLoop(node, name, context.sourceCode)
        ) {
          context.report({ node, message: MESSAGE, data: { name } });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "concat" ||
          callee.object.type !== "Identifier"
        ) {
          return;
        }
        const name = callee.object.name;
        // Only array accumulators: string concat in a reduce is not quadratic in practice.
        if (
          isReducerAccumulator(callee.object, context.sourceCode, {
            arrayInitial: true,
          })
        ) {
          context.report({ node, message: MESSAGE, data: { name } });
        }
      },
    };
  },
};
export default rule;
