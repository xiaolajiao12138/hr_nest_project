const TOKEN_KEY = 'hr_access_token';
const REFRESH_TOKEN_KEY = 'hr_refresh_token';
const USER_KEY = 'hr_user_info';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(refreshToken: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getUserInfo(): any {
  const info = localStorage.getItem(USER_KEY);
  try {
    return info ? JSON.parse(info) : null;
  } catch (e) {
    return null;
  }
}

export function setUserInfo(user: any): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
