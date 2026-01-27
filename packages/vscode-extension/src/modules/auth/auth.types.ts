/**
 * Authentication types
 */

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  email: string;
  role: "MEMBER" | "ADMIN";
  name?: string;
  organizationId?: string;
  organizations?: Array<{
    organizationId: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
    status: 'ACTIVE' | 'PENDING';
    joinedAt?: string;
  }>;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: UserInfo;
  token?: string;
}
