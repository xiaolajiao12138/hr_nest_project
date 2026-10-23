import { ref, onBeforeUnmount } from 'vue';

export interface WatermarkOptions {
  text: string;
  subText?: string;
  fontSize?: number;
  color?: string;
  rotate?: number;
  gapX?: number;
  gapY?: number;
}

const WATERMARK_ID = '__hr_system_watermark__';

/**
 * 企业级背景防截屏与防 DOM 篡改水印 Hook
 */
export function useWatermark() {
  const watermarkEl = ref<HTMLDivElement | null>(null);
  let observer: MutationObserver | null = null;
  let currentOptions: WatermarkOptions | null = null;
  let isCleaning = false;

  /**
   * 生成 Canvas 水印图并转为 Base64 背景
   */
  const createBase64Watermark = (options: WatermarkOptions): string => {
    const {
      text,
      subText = '',
      fontSize = 14,
      color = 'rgba(0, 0, 0, 0.08)',
      rotate = -22,
      gapX = 260,
      gapY = 180,
    } = options;

    const canvas = document.createElement('canvas');
    canvas.width = gapX;
    canvas.height = gapY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.rotate((rotate * Math.PI) / 180);
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 绘制第一行主文本（如用户名、工号）
    ctx.fillText(text, 20, gapY / 2);

    // 绘制第二行副文本（如时间、系统标识）
    if (subText) {
      ctx.font = `${fontSize - 2}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillText(subText, 20, gapY / 2 + fontSize + 4);
    }

    return canvas.toDataURL('image/png');
  };

  /**
   * 构造水印 DOM 样式
   */
  const applyWatermarkStyle = (el: HTMLElement, base64: string) => {
    el.id = WATERMARK_ID;
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '100vw';
    el.style.height = '100vh';
    el.style.zIndex = '9998';
    el.style.pointerEvents = 'none';
    el.style.backgroundImage = `url(${base64})`;
    el.style.backgroundRepeat = 'repeat';
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  };

  /**
   * 启动 MutationObserver 防篡改监听
   */
  const startObserver = (base64: string) => {
    stopObserver();

    observer = new MutationObserver((mutations) => {
      if (isCleaning) return;

      for (const mutation of mutations) {
        // 1. 若水印节点被删除，自动重建挂载
        if (mutation.type === 'childList') {
          const removed = Array.from(mutation.removedNodes);
          const wasRemoved = removed.some(
            (node) => (node as HTMLElement).id === WATERMARK_ID
          );
          if (wasRemoved && currentOptions) {
            renderWatermark(currentOptions);
            return;
          }
        }

        // 2. 若水印节点样式被修改（如 display: none, opacity: 0 等），自动纠正
        if (
          mutation.type === 'attributes' &&
          mutation.target === watermarkEl.value
        ) {
          applyWatermarkStyle(watermarkEl.value, base64);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
  };

  const stopObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  /**
   * 渲染或更新水印
   */
  const renderWatermark = (options: WatermarkOptions) => {
    if (typeof document === 'undefined') return;
    currentOptions = options;

    const base64 = createBase64Watermark(options);
    let el = document.getElementById(WATERMARK_ID) as HTMLDivElement | null;

    if (!el) {
      el = document.createElement('div');
      document.body.appendChild(el);
    }

    applyWatermarkStyle(el, base64);
    watermarkEl.value = el;

    startObserver(base64);
  };

  /**
   * 清除水印
   */
  const clearWatermark = () => {
    isCleaning = true;
    stopObserver();
    const el = document.getElementById(WATERMARK_ID);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
    watermarkEl.value = null;
    isCleaning = false;
  };

  onBeforeUnmount(() => {
    clearWatermark();
  });

  return {
    setWatermark: renderWatermark,
    clearWatermark,
  };
}
