/**
 * 头像静态直链规范化工具
 *
 * 采用公开只读不可枚举随机文件名直链 + 浏览器一年期 immutable 永久强缓存方案：
 * - 不再通过 Axios 拉取二进制 Blob，彻底消除每次刷新页面的重复接口请求与首屏等待；
 * - 首次渲染后直接命中浏览器本地内存/磁盘缓存（0ms），更换新头像时文件名自动变更立即刷新。
 */
export function clearAvatarCache(): void {
  // 静态直链由浏览器原生 HTTP 强缓存管理，无需手动释放内存 Blob URL
}

export function resolveAvatar(source?: string): string {
  if (!source) return '';
  if (source.startsWith('/avatars/')) {
    return source;
  }
  const avatarMatch = /^\/api(\/upload\/avatar\/[a-zA-Z0-9_.-]+)$/.exec(source);
  if (avatarMatch) {
    const apiPrefix = (import.meta.env.VITE_API_PREFIX || '/api').replace(/\/$/, '');
    return `${apiPrefix}${avatarMatch[1]}`;
  }
  return '';
}
