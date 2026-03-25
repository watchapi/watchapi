/**
 * Authentication service
 * Handles login, logout, token storage, and user session management
 */

import * as vscode from "vscode";
import {
  api,
  setAuthTokenProvider,
  setRefreshTokenHandler,
} from "@/infrastructure/api";
import { STORAGE_KEYS } from "@/shared/constants";
import { getDashboardUrl } from "@/shared/config";

import { AuthenticationError } from "@/shared/errors";
import type { UserInfo, AuthState } from "./auth.types";
import { logger } from "@/shared/logger";

export class AuthService {
  private context: vscode.ExtensionContext;
  private _onDidChangeAuthState = new vscode.EventEmitter<AuthState>();
  public readonly onDidChangeAuthState = this._onDidChangeAuthState.event;
  private isRefreshing = false;
  private hasShownExpiryNotification = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;

    // Provide token to tRPC client
    setAuthTokenProvider(() => this.getToken());
    setRefreshTokenHandler(() => this.refreshAccessToken());
  }

  /**
   * Initialize auth service and check existing session
   */
  async initialize(): Promise<void> {
    const token = await this.getToken();

    if (!token) {
      // No access token, try to refresh
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        return;
      }
    }

    try {
      await this.verifySession();
    } catch {
      // Session verification failed, try to refresh token
      logger.info("Session verification failed, attempting token refresh");
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Try verifying again with new token
        try {
          await this.verifySession();
        } catch {
          await this.clearSession();
        }
      } else {
        await this.clearSession();
      }
    }
  }

  /**
   * Login with email and password (OAuth flow)
   * Opens browser for authentication
   */
  async login(): Promise<void> {
    const loginUrl = new URL("/login", getDashboardUrl());
    loginUrl.searchParams.set("source", "vscode-extension");

    await vscode.env.openExternal(vscode.Uri.parse(loginUrl.toString()));
  }

  /**
   * Logout and clear stored credentials
   */
  async logout(): Promise<void> {
    await this.clearSession();
    vscode.window.showInformationMessage("Logged out successfully");
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<UserInfo | undefined> {
    return this.context.globalState.get<UserInfo>(STORAGE_KEYS.USER_INFO);
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  }

  /**
   * Get auth state
   */
  async getAuthState(): Promise<AuthState> {
    const token = await this.getToken();
    const user = await this.getCurrentUser();
    const isAuthenticated = !!token && !!user;

    return {
      isAuthenticated,
      user,
      token,
    };
  }

  /**
   * Refresh access token using refresh token
   * @returns true if refresh was successful, false otherwise
   */
  async refreshAccessToken(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing) {
      logger.debug("Token refresh already in progress, waiting...");
      // Wait for ongoing refresh to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.isRefreshing ? false : !!await this.getToken();
    }

    try {
      this.isRefreshing = true;

      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        logger.debug("No refresh token available");
        return false;
      }

      logger.info("Attempting to refresh access token");
      const { data, error } = await api.POST("/auth.refreshToken", {
        body: { refreshToken },
      });
      if (error) throw error;
      if (!data) throw new Error("No response from refresh token endpoint");

      // Store new tokens
      await this.storeToken(data.accessToken);
      if (data.refreshToken) {
        await this.storeRefreshToken(data.refreshToken);
      }

      logger.info("Access token refreshed successfully");
      this.hasShownExpiryNotification = false; // Reset flag on success
      return true;
    } catch (error) {
      logger.error("Token refresh failed", error);
      await this.handleExpiredRefreshToken();
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Handle expired refresh token scenario
   * Clears session and prompts user to log in again
   */
  private async handleExpiredRefreshToken(): Promise<void> {
    await this.clearSession();

    // Only show notification once to avoid spam
    if (this.hasShownExpiryNotification) {
      logger.debug("Session expiry notification already shown, skipping");
      return;
    }

    this.hasShownExpiryNotification = true;

    const action = await vscode.window.showWarningMessage(
      "Your session has expired. Please log in again to continue.",
      "Log In",
      "Dismiss"
    );

    if (action === "Log In") {
      await this.login();
    }
  }

  /**
   * Get stored JWT token
   */
  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get(STORAGE_KEYS.JWT_TOKEN);
  }

  /**
   * Store JWT token securely
   */
  private async storeToken(token: string): Promise<void> {
    await this.context.secrets.store(STORAGE_KEYS.JWT_TOKEN, token);
  }

  /**
   * Get stored refresh token
   */
  private async getRefreshToken(): Promise<string | undefined> {
    return this.context.secrets.get(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Store refresh token securely
   */
  private async storeRefreshToken(token: string): Promise<void> {
    await this.context.secrets.store(STORAGE_KEYS.REFRESH_TOKEN, token);
  }

  /**
   * Verify current session and get user info
   */
  private async verifySession(): Promise<void> {
    const token = await this.getToken();
    if (!token) {
      throw new AuthenticationError("No access token available");
    }

    const { data: user, error } = await api.GET("/auth.verifyToken", {
      params: { query: { token } },
    });
    if (error) throw error;
    if (!user) {
      throw new AuthenticationError("Session is invalid or expired");
    }

    // Map API user to UserInfo (role type coercion)
    const userInfo: UserInfo = {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      avatar: user.avatar ?? undefined,
      role: user.role as "ADMIN" | "MEMBER",
    };

    await this.context.globalState.update(STORAGE_KEYS.USER_INFO, userInfo);

    this._onDidChangeAuthState.fire({
      isAuthenticated: true,
      user: userInfo,
    });
  }

  /**
   * Clear session data
   */
  private async clearSession(): Promise<void> {
    await this.context.secrets.delete(STORAGE_KEYS.JWT_TOKEN);
    await this.context.secrets.delete(STORAGE_KEYS.REFRESH_TOKEN);
    await this.context.globalState.update(STORAGE_KEYS.USER_INFO, undefined);

    this._onDidChangeAuthState.fire({
      isAuthenticated: false,
      user: undefined,
    });
  }

  async handleAuthCallback(uri: vscode.Uri): Promise<void> {
    try {
      if (uri.path !== "/callback") {
        return;
      }

      const params = new URLSearchParams(uri.query);
      const token = params.get("token");
      const refreshToken = params.get("refreshToken");

      if (!token) {
        throw new AuthenticationError("Missing access token");
      }

      logger.info("Received auth callback");

      // Store tokens
      await this.storeToken(token);
      if (refreshToken) {
        await this.storeRefreshToken(refreshToken);
        logger.info("Stored refresh token");
      }

      // Load user profile
      try {
        await this.verifySession();
        vscode.window.showInformationMessage(
          "Successfully signed in to WatchAPI",
        );
      } catch {
        await this.clearSession();
        throw new AuthenticationError("Failed to verify session after sign-in");
      }
    } catch (error) {
      logger.error("Auth callback failed", error);
      vscode.window.showErrorMessage("Sign-in failed. Please try again.");
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._onDidChangeAuthState.dispose();
  }
}
