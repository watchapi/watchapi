import { CallExpression, Node, SourceFile, SyntaxKind } from "ts-morph";

import type { AnalyzerOptions } from "../types.js";
import {
    ROUTER_FACTORY_NAMES,
    ROUTER_IDENTIFIER_PATTERN,
} from "./constants.js";

export interface RouterDetectionConfig {
    factoryNames: Set<string>;
    identifierPattern: RegExp;
}

export function buildRouterDetectionConfig(
    options: AnalyzerOptions,
    debug: (msg: string) => void,
): RouterDetectionConfig {
    const factoryNames = new Set(
        normalizeFactoryNames(options.routerFactories),
    );
    const identifierPattern = buildRouterIdentifierPattern(
        options.routerIdentifierPattern,
        debug,
    );

    debug(
        `Router detection config – factories: ${Array.from(factoryNames).join(", ")}; identifier pattern: ${identifierPattern}`,
    );

    return { factoryNames, identifierPattern };
}

export function collectRouterCallSites(
    sourceFile: SourceFile,
    detection: RouterDetectionConfig,
    debug: (msg: string) => void,
) {
    const calls: { call: CallExpression; name: string }[] = [];
    const seen = new Set<number>();

    sourceFile.forEachDescendant((node) => {
        if (!Node.isCallExpression(node)) return;
        if (!isRouterFactoryCall(node, detection)) return;

        const key = node.getStart();
        if (seen.has(key)) return;
        seen.add(key);

        const name = inferRouterName(node, detection);
        debug(
            `Detected router factory call${name ? ` '${name}'` : ""} at line ${node.getStartLineNumber()}`,
        );
        calls.push({
            call: node,
            name: name || `router@${node.getStartLineNumber()}`,
        });
    });

    return calls;
}

export function isRouterFactoryCall(
    node: CallExpression,
    detection: RouterDetectionConfig,
) {
    const expression = node.getExpression();
    return (
        matchesFactoryExpression(expression, detection.factoryNames) ||
        isRouterishExpression(expression, detection.identifierPattern)
    );
}

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
        if (isRouterishExpression(node, detection.identifierPattern))
            return true;
        const expr = node.getExpression();
        if (
            Node.isIdentifier(expr) &&
            detection.identifierPattern.test(expr.getText())
        )
            return true;
    }

    if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (matchesFactoryExpression(expr, detection.factoryNames)) return true;
        if (isRouterishExpression(expr, detection.identifierPattern))
            return true;
    }

    return false;
}

function matchesFactoryExpression(
    expression: Node,
    factoryNames: Set<string>,
): boolean {
    return (
        (Node.isIdentifier(expression) &&
            factoryNames.has(expression.getText())) ||
        (Node.isPropertyAccessExpression(expression) &&
            factoryNames.has(expression.getName()))
    );
}

function inferRouterName(
    node: CallExpression,
    detection: RouterDetectionConfig,
) {
    const varDecl = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (varDecl) return varDecl.getName();

    const propAssign = node.getFirstAncestorByKind(
        SyntaxKind.PropertyAssignment,
    );
    if (propAssign) {
        const name = propAssign.getName();
        if (name) return name;
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

        const funcVar = func.getFirstAncestorByKind(
            SyntaxKind.VariableDeclaration,
        );
        if (funcVar) return funcVar.getName();
    }

    return null;
}

function normalizeFactoryNames(names?: string[]) {
    if (!names?.length) return ROUTER_FACTORY_NAMES;

    const list = names.flatMap((item) => item.split(",")).map((s) => s.trim());
    const deduped = Array.from(new Set(list.filter(Boolean)));
    return deduped.length ? deduped : ROUTER_FACTORY_NAMES;
}

function buildRouterIdentifierPattern(
    pattern: string | undefined,
    debug: (msg: string) => void,
) {
    if (!pattern) return ROUTER_IDENTIFIER_PATTERN;
    try {
        return new RegExp(pattern);
    } catch (error) {
        debug(
            `Failed to parse router identifier pattern '${pattern}', falling back to default: ${ROUTER_IDENTIFIER_PATTERN}`,
        );
        return ROUTER_IDENTIFIER_PATTERN;
    }
}

function isRouterishExpression(expression: Node, identifierPattern: RegExp) {
    if (
        Node.isIdentifier(expression) &&
        identifierPattern.test(expression.getText())
    ) {
        return true;
    }

    if (Node.isPropertyAccessExpression(expression)) {
        if (identifierPattern.test(expression.getName())) return true;
        const expr = expression.getExpression();
        if (Node.isIdentifier(expr) && identifierPattern.test(expr.getText())) {
            return true;
        }
    }

    if (Node.isCallExpression(expression)) {
        return isRouterishExpression(
            expression.getExpression(),
            identifierPattern,
        );
    }

    return false;
}
