const TOKEN_KEY = 'hr_access_token';
const REFRESH_TOKEN_KEY = 'hr_refresh_token';
const USER_KEY = 'hr_user_info';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(refreshToken: string): void {
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getUserInfo(): any {
  const info = sessionStorage.getItem(USER_KEY);
  try {
    return info ? JSON.parse(info) : null;
  } catch (e) {
    return null;
  }
}

export function setUserInfo(user: any): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}
