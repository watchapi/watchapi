import * as vscode from "vscode";
import {
  createApiClientFromConfig,
  getApiClientOptionsFromConfig,
} from "./trpc.service";

const ACCESS_TOKEN_KEY_BASE = "watchapi.accessToken";
const REFRESH_TOKEN_KEY_BASE = "watchapi.refreshToken";
const INSTALL_ID_KEY = "watchapi.installId";

type Tokens = { accessToken: string; refreshToken: string };
type JwtPayload = { exp?: number };

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

function buildTokenKey(base: string) {
  const apiUrl = getApiClientOptionsFromConfig()?.apiUrl;
  if (!apiUrl) return base;

  const normalized = apiUrl.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "default";
  return `${base}:${normalized}`;
}

function decodeJwt(token: string): JwtPayload | null {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const decoded = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const parsed = JSON.parse(decoded);
    return typeof parsed === "object" && parsed !== null ? (parsed as JwtPayload) : null;
  } catch (error) {
    console.error("Failed to decode JWT payload", error);
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  const maybeMessage = (error as { message?: unknown })?.message;
  return typeof maybeMessage === "string" ? maybeMessage : "";
}

export function isDeviceAlreadyRegisteredError(error: unknown): boolean {
  return /device is already registered/i.test(getErrorMessage(error));
}

export function isEmailAlreadyRegisteredError(error: unknown): boolean {
  return /email already exists/i.test(getErrorMessage(error));
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) {
    return false;
  }

  const expiryMs = payload.exp * 1000;
  return Date.now() >= expiryMs - TOKEN_EXPIRY_BUFFER_MS;
}

async function refreshTokens(
  context: vscode.ExtensionContext,
  installId: string,
  refreshToken: string,
): Promise<Tokens | null> {
  try {
    const client = createApiClientFromConfig({ installId });
    const tokens = await client.mutation<Tokens>("auth.refreshToken", { refreshToken });
    await storeTokens(context, tokens);
    return tokens;
  } catch (error) {
    console.warn("Failed to refresh WatchAPI tokens", error);
    await clearTokens(context);
    return null;
  }
}

export async function getOrCreateInstallId(
  context: vscode.ExtensionContext,
): Promise<string> {
  const existing = context.globalState.get<string>(INSTALL_ID_KEY);
  if (existing) {
    return existing;
  }

  const installId = crypto.randomUUID();
  await context.globalState.update(INSTALL_ID_KEY, installId);
  return installId;
}

export async function getStoredTokens(
  context: vscode.ExtensionContext,
): Promise<Tokens | null> {
  const accessTokenKey = buildTokenKey(ACCESS_TOKEN_KEY_BASE);
  const refreshTokenKey = buildTokenKey(REFRESH_TOKEN_KEY_BASE);

  const [accessToken, refreshToken] = await Promise.all([
    context.secrets.get(accessTokenKey),
    context.secrets.get(refreshTokenKey),
  ]);

  // Fallback to legacy keys for older installs
  const [legacyAccessToken, legacyRefreshToken] = await Promise.all([
    context.secrets.get(ACCESS_TOKEN_KEY_BASE),
    context.secrets.get(REFRESH_TOKEN_KEY_BASE),
  ]);

  const namespacedTokens =
    accessToken && refreshToken ? { accessToken, refreshToken } : null;
  const legacyTokens =
    legacyAccessToken && legacyRefreshToken
      ? { accessToken: legacyAccessToken, refreshToken: legacyRefreshToken }
      : null;

  return namespacedTokens ?? legacyTokens ?? null;
}

export async function storeTokens(
  context: vscode.ExtensionContext,
  tokens: Tokens,
) {
  const accessTokenKey = buildTokenKey(ACCESS_TOKEN_KEY_BASE);
  const refreshTokenKey = buildTokenKey(REFRESH_TOKEN_KEY_BASE);

  await Promise.all([
    context.secrets.store(accessTokenKey, tokens.accessToken),
    context.secrets.store(refreshTokenKey, tokens.refreshToken),
  ]);
}

export async function clearTokens(context: vscode.ExtensionContext) {
  const accessTokenKey = buildTokenKey(ACCESS_TOKEN_KEY_BASE);
  const refreshTokenKey = buildTokenKey(REFRESH_TOKEN_KEY_BASE);

  await Promise.all([
    context.secrets.delete(accessTokenKey),
    context.secrets.delete(refreshTokenKey),
    // Clean up legacy keys too
    context.secrets.delete(ACCESS_TOKEN_KEY_BASE),
    context.secrets.delete(REFRESH_TOKEN_KEY_BASE),
  ]);
}

export async function ensureGuestLogin(
  context: vscode.ExtensionContext,
  options?: { installId?: string },
) {
  const installId = options?.installId ?? (await getOrCreateInstallId(context));
  const existing = await getStoredTokens(context);
  if (existing) {
    if (isTokenExpired(existing.accessToken)) {
      const refreshed = await refreshTokens(context, installId, existing.refreshToken);
      if (refreshed) {
        return refreshed;
      }
    } else {
      // Validate against the current API URL so switching environments doesn't reuse stale tokens
      try {
        const client = createApiClientFromConfig({
          installId,
          apiToken: existing.accessToken,
        });
        const verifiedUser = await client.query("auth.verifyToken", {
          token: existing.accessToken,
        });

        if (verifiedUser) {
          return existing;
        }
      } catch (error) {
        console.warn("WatchAPI token validation failed, reauthenticating", error);
      }

      await clearTokens(context);
    }
  }

  const client = createApiClientFromConfig({ installId });

  const tokens = await client.mutation<Tokens>("auth.guestLogin");
  await storeTokens(context, tokens);

  return tokens;
}

export async function upgradeGuestWithCredentials(
  context: vscode.ExtensionContext,
  input: {
    email: string;
    password: string;
    name?: string;
    invitationToken?: string;
  },
) {
  const installId = await getOrCreateInstallId(context);
  const client = createApiClientFromConfig({ installId });

  const result = await client.mutation<{
    requiresEmailVerification: boolean;
    user: { id: string; email: string; name?: string; avatar?: string; role: string };
    tokens: Tokens;
  }>("auth.upgradeGuest", input);

  await storeTokens(context, result.tokens);
  return result;
}

export async function loginWithCredentials(
  context: vscode.ExtensionContext,
  input: {
    email: string;
    password: string;
  },
) {
  const installId = await getOrCreateInstallId(context);
  const client = createApiClientFromConfig({ installId });

  const result = await client.mutation<{
    user: { id: string; email: string; name?: string; avatar?: string; role: string };
    tokens: Tokens;
  }>("auth.login", input);

  await storeTokens(context, result.tokens);
  return result;
}
