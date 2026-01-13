/**
 * tRPC router detection utilities
 */

import { CallExpression, Node, SourceFile, SyntaxKind } from "ts-morph";
import {
  ROUTER_FACTORY_NAMES,
  ROUTER_IDENTIFIER_PATTERN,
} from "./trpc-constants";
import type { DebugLogger } from "./trpc-types";

export interface RouterDetectionConfig {
  factoryNames: Set<string>;
  identifierPattern: RegExp;
}

/**
 * Build router detection configuration
 */
export function buildRouterDetectionConfig(
  routerFactories?: string[],
  routerIdentifierPattern?: string,
  debug?: DebugLogger,
): RouterDetectionConfig {
  const factoryNames = new Set(normalizeFactoryNames(routerFactories));
  const identifierPattern = buildRouterIdentifierPattern(
    routerIdentifierPattern,
    debug,
  );

  debug?.(
    `Router detection config — factories: ${Array.from(factoryNames).join(
      ", ",
    )}; identifier pattern: ${identifierPattern}`,
  );

  return { factoryNames, identifierPattern };
}

/**
 * Collect all router call sites in a source file
 */
export function collectRouterCallSites(
  sourceFile: SourceFile,
  detection: RouterDetectionConfig,
  debug: DebugLogger,
): { call: CallExpression; name: string }[] {
  const calls: { call: CallExpression; name: string }[] = [];
  const seen = new Set<number>();

  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    if (!isRouterFactoryCall(node, detection)) {
      return;
    }

    const key = node.getStart();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    const name = inferRouterName(node);
    debug(
      `Detected router factory call${
        name ? ` '${name}'` : ""
      } at line ${node.getStartLineNumber()}`,
    );
    calls.push({
      call: node,
      name: name || `router@${node.getStartLineNumber()}`,
    });
  });

  return calls;
}

/**
 * Check if a call expression is a router factory call
 */
export function isRouterFactoryCall(
  node: CallExpression,
  detection: RouterDetectionConfig,
): boolean {
  const expression = node.getExpression();
  return (
    matchesFactoryExpression(expression, detection.factoryNames) ||
    isRouterishExpression(expression, detection.identifierPattern)
  );
}

/**
 * Check if a node is a router reference (for composition)
 */
export function isRouterReference(
  node: Node,
  detection: RouterDetectionConfig,
): boolean {
  if (
    Node.isIdentifier(node) &&
    detection.identifierPattern.test(node.getText())
  ) {
    return true;
  }

  if (Node.isPropertyAccessExpression(node)) {
    if (isRouterishExpression(node, detection.identifierPattern)) {
      return true;
    }
    const expr = node.getExpression();
    if (
      Node.isIdentifier(expr) &&
      detection.identifierPattern.test(expr.getText())
    ) {
      return true;
    }
  }

  if (Node.isCallExpression(node)) {
    const expr = node.getExpression();
    if (matchesFactoryExpression(expr, detection.factoryNames)) {
      return true;
    }
    if (isRouterishExpression(expr, detection.identifierPattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the name of a router reference
 */
export function getRouterReferenceName(node: Node): string | null {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }

  if (Node.isPropertyAccessExpression(node)) {
    const prop = node.getNameNode().getText();
    const base = node.getExpression().getText();
    return `${base}.${prop}`;
  }

  if (Node.isCallExpression(node)) {
    const expr = node.getExpression();
    if (Node.isIdentifier(expr)) {
      return expr.getText();
    }
    if (Node.isPropertyAccessExpression(expr)) {
      return expr.getText();
    }
  }

  return null;
}

/**
 * Normalize router name by removing common prefixes/suffixes
 */
export function normalizeRouterName(value: string): string {
  const cleaned = value
    .replace(/\.(router|trpc)$/i, "")
    .replace(/^(create|build|make|use)/i, "")
    .replace(/Router$/i, "")
    .replace(/router$/i, "");

  const stripped = cleaned.replace(/[.\-_]+(\w)/g, (_match, char: string) =>
    char.toUpperCase(),
  );

  if (!stripped) {
    return "";
  }

  return stripped[0].toLowerCase() + stripped.slice(1);
}

/**
 * Check if expression matches factory names
 */
function matchesFactoryExpression(
  expression: Node,
  factoryNames: Set<string>,
): boolean {
  return (
    (Node.isIdentifier(expression) && factoryNames.has(expression.getText())) ||
    (Node.isPropertyAccessExpression(expression) &&
      factoryNames.has(expression.getName()))
  );
}

/**
 * Infer router name from call expression context
 */
function inferRouterName(node: CallExpression): string | null {
  const varDecl = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (varDecl) {
    return varDecl.getName();
  }

  const propAssign = node.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);
  if (propAssign) {
    const name = propAssign.getName();
    if (name) {
      return name;
    }
  }

  const func = node.getFirstAncestor(
    (ancestor) =>
      Node.isFunctionDeclaration(ancestor) ||
      Node.isFunctionExpression(ancestor) ||
      Node.isArrowFunction(ancestor),
  );

  if (func) {
    if (Node.isFunctionDeclaration(func) && func.getName()) {
      return func.getName()!;
    }

    const funcVar = func.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (funcVar) {
      return funcVar.getName();
    }
  }

  return null;
}

/**
 * Normalize factory names from user input
 */
function normalizeFactoryNames(names?: string[]): string[] {
  if (!names?.length) {
    return ROUTER_FACTORY_NAMES;
  }

  const list = names.flatMap((item) => item.split(",")).map((s) => s.trim());
  const deduped = Array.from(new Set(list.filter(Boolean)));
  return deduped.length ? deduped : ROUTER_FACTORY_NAMES;
}

/**
 * Build router identifier pattern from user input
 */
function buildRouterIdentifierPattern(
  pattern: string | undefined,
  debug?: DebugLogger,
): RegExp {
  if (!pattern) {
    return ROUTER_IDENTIFIER_PATTERN;
  }
  try {
    return new RegExp(pattern);
  } catch {
    debug?.(
      `Failed to parse router identifier pattern '${pattern}', falling back to default: ${ROUTER_IDENTIFIER_PATTERN}`,
    );
    return ROUTER_IDENTIFIER_PATTERN;
  }
}

/**
 * Check if expression looks like a router based on identifier pattern
 */
function isRouterishExpression(
  expression: Node,
  identifierPattern: RegExp,
): boolean {
  if (
    Node.isIdentifier(expression) &&
    identifierPattern.test(expression.getText())
  ) {
    return true;
  }

  if (Node.isPropertyAccessExpression(expression)) {
    if (identifierPattern.test(expression.getName())) {
      return true;
    }
    const expr = expression.getExpression();
    if (Node.isIdentifier(expr) && identifierPattern.test(expr.getText())) {
      return true;
    }
  }

  if (Node.isCallExpression(expression)) {
    return isRouterishExpression(expression.getExpression(), identifierPattern);
  }

  return false;
}
