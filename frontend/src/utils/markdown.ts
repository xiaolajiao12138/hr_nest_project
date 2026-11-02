/**
 * 轻量级安全 Markdown 文本转 HTML 格式化工具
 * 专为 HR 智能体对话气泡设计，高效支持 Markdown 表格、加粗、列表、标题与代码块排版
 */

/**
 * 转义 HTML 特殊字符，防范 XSS 跨站脚本攻击
 * 
 * @param str 原始未经处理的文本字符串
 *   - 第一个参数作用：待过滤的任意用户或大模型输出文本
 * @returns 经过实体编码后的安全文本
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 将大模型返回的 Markdown 纯文本解析并渲染为整洁优雅的 HTML 片段
 * 
 * @param text 大语言模型回复的 Markdown 原始字符串
 *   - 第一个参数作用：包含 # 标题、**加粗**、表格 |、列表 - 等语法的 Markdown 文本
 *   - 类似方法参考：Vue 中 v-html 绑定的解析函数
 * @returns 格式化后的安全 HTML 字符串
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    let tableHtml = '<div class="agent-table-wrapper"><table class="agent-data-table">';
    let isHeader = true;

    for (const row of tableBuffer) {
      // 忽略分隔线行 | --- | --- |
      if (/^\|?(\s*:?-+:?\s*\|)+\s*$/.test(row.trim())) {
        isHeader = false;
        continue;
      }

      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter((c, idx, arr) => !(idx === 0 && c === '') && !(idx === arr.length - 1 && c === ''));

      if (cells.length === 0) continue;

      tableHtml += '<tr>';
      for (const cell of cells) {
        const tag = isHeader ? 'th' : 'td';
        tableHtml += `<${tag}>${formatInline(cell)}</${tag}>`;
      }
      tableHtml += '</tr>';
    }

    tableHtml += '</table></div>';
    result.push(tableHtml);
    tableBuffer = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. 代码块处理 ```
    if (trimmed.startsWith('```')) {
      if (inTable) flushTable();

      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        inCodeBlock = false;
        const codeContent = escapeHtml(codeBuffer.join('\n'));
        result.push(`<pre class="agent-code-block"><code>${codeContent}</code></pre>`);
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(rawLine);
      continue;
    }

    // 2. 表格处理 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableBuffer.push(trimmed);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // 3. 空行
    if (!trimmed) {
      result.push('<div class="agent-paragraph-break"></div>');
      continue;
    }

    // 4. 标题解析
    if (trimmed.startsWith('### ')) {
      result.push(`<h4 class="agent-h4">${formatInline(trimmed.slice(4))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      result.push(`<h3 class="agent-h3">${formatInline(trimmed.slice(3))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      result.push(`<h2 class="agent-h2">${formatInline(trimmed.slice(2))}</h2>`);
      continue;
    }

    // 5. 引用块 >
    if (trimmed.startsWith('> ')) {
      result.push(`<blockquote class="agent-quote">${formatInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // 6. 无序列表 - 或 *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      result.push(`<div class="agent-list-item"><span class="agent-list-dot">•</span> ${formatInline(trimmed.slice(2))}</div>`);
      continue;
    }

    // 7. 有序列表 1. 2.
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      result.push(`<div class="agent-list-item"><span class="agent-list-num">${orderedMatch[1]}.</span> ${formatInline(orderedMatch[2])}</div>`);
      continue;
    }

    // 8. 普通段落行
    result.push(`<p class="agent-p">${formatInline(rawLine)}</p>`);
  }

  if (inTable) {
    flushTable();
  }

  return result.join('');
}

/**
 * 格式化行内元素（加粗、行内代码、下划线）
 * 
 * @param line 单行字符串
 *   - 第一个参数作用：待处理的单行文本
 * @returns 替换行内 HTML 标记后的字符串
 */
function formatInline(line: string): string {
  let safe = escapeHtml(line);

  // 1. 行内代码 `code`
  safe = safe.replace(/`([^`]+)`/g, '<code class="agent-inline-code">$1</code>');

  // 2. 加粗 **bold**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="agent-bold">$1</strong>');

  // 3. 斜体 *italic*
  safe = safe.replace(/\*([^*]+)\*/g, '<em class="agent-italic">$1</em>');

  return safe;
}
