import * as vscode from "vscode";
import { createApiClientFromConfig } from "./trpc.service";

const ACCESS_TOKEN_KEY = "watchapi.accessToken";
const REFRESH_TOKEN_KEY = "watchapi.refreshToken";
const INSTALL_ID_KEY = "watchapi.installId";

type Tokens = { accessToken: string; refreshToken: string };

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
  const [accessToken, refreshToken] = await Promise.all([
    context.secrets.get(ACCESS_TOKEN_KEY),
    context.secrets.get(REFRESH_TOKEN_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

export async function storeTokens(
  context: vscode.ExtensionContext,
  tokens: Tokens,
) {
  await Promise.all([
    context.secrets.store(ACCESS_TOKEN_KEY, tokens.accessToken),
    context.secrets.store(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
}

export async function clearTokens(context: vscode.ExtensionContext) {
  await Promise.all([
    context.secrets.delete(ACCESS_TOKEN_KEY),
    context.secrets.delete(REFRESH_TOKEN_KEY),
  ]);
}

export async function ensureGuestLogin(context: vscode.ExtensionContext) {
  const existing = await getStoredTokens(context);
  if (existing) {
    return existing;
  }

  const installId = await getOrCreateInstallId(context);
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

