// chat.js — 聊天面板：气泡构建 + 流式显示 + 轻量 markdown 渲染
// 接口：createChat(container, { onSend }) → { appendBubble, clear, streamDelta, streamTool, streamDone, streamError, setEnabled, switchContext }

// 轻量 markdown → HTML（粗体/公式/表格/代码/换行）
function renderMD(text) {
  if (!text) return '';
  let h = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    // 代码块
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="bg-muted rounded-lg p-3 my-2 text-[13px] leading-relaxed overflow-x-auto"><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-[13px]">$1</code>')
    // 表格
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (_, hdr, rows) => {
      const thead = '<tr>' + hdr.split('|').filter(c=>c.trim()).map(c => '<th class="text-left px-3 py-1.5 border-b border-border text-[13px]">' + c.trim() + '</th>').join('') + '</tr>';
      const tbody = rows.trim().split('\n').filter(r=>r.trim()).map(r =>
        '<tr>' + r.split('|').filter(c=>c.trim()).map(c => '<td class="px-3 py-1.5 text-[13px]">' + c.trim() + '</td>').join('') + '</tr>'
      ).join('');
      return '<table class="w-full my-2 border-collapse">' + thead + tbody + '</table>';
    })
    // 块级公式 $$...$$
    .replace(/\$\$([\s\S]*?)\$\$/g, '<div class="bg-muted rounded-lg p-4 my-2 text-center text-[14px] font-mono">$1</div>')
    // 行内公式 $...$
    .replace(/\$([^$]+)\$/g, '<code class="bg-muted px-1 rounded text-[13px] font-mono">$1</code>')
    // 标题（吞尾随换行，避免后置 <br>）
    .replace(/^#### (.+)\n?/gm, '<h4 class="text-[14px] font-semibold mt-3 mb-1">$1</h4>')
    .replace(/^### (.+)\n?/gm, '<h3 class="text-[15px] font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)\n?/gm, '<h2 class="text-[17px] font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^# (.+)\n?/gm, '<h1 class="text-[19px] font-bold mt-4 mb-2">$1</h1>')
    // 粗体/斜体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 有序/无序列表（吞尾随换行）
    .replace(/^(\d+)\. (.+)\n?/gm, '<div class="flex gap-2 ml-2"><span class="text-muted-foreground">$1.</span><span>$2</span></div>')
    .replace(/^[-*] (.+)\n?/gm, '<div class="flex gap-2 ml-2"><span class="text-muted-foreground">·</span><span>$1</span></div>')
    // 分割线
    .replace(/^---\n?/gm, '<hr class="border-border my-3">')
    // 剩余换行
    .replace(/\n/g, '<br>');
  return h;
}

const AVATAR_AI = '<svg class="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>';
const AVATAR_USER = '<svg class="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
// 发送/停止按钮图标（streaming 时 send 按钮切换为停止按钮，复用同一 DOM）
const ICON_SEND = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
const ICON_STOP = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';

export function createChat(container, textarea, sendBtn, { onSend, onStop }) {
  let streaming = false;

  function scrollDown() { container.scrollTop = container.scrollHeight; }

  function bubbleUser(text) {
    const el = document.createElement('div');
    el.className = 'flex gap-3 flex-row-reverse';
    el.innerHTML =
      `<div class="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">${AVATAR_USER}</div>` +
      `<div class="flex-1 min-w-0 flex flex-col items-end">` +
      `<div class="text-[12px] text-muted-foreground mb-1">你</div>` +
      `<div class="inline-block max-w-[90%] rounded-xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-3 text-[14px] leading-relaxed"></div>` +
      `</div>`;
    el.querySelector('.bg-primary').textContent = text;
    return el;
  }

  function bubbleAI() {
    const el = document.createElement('div');
    el.className = 'flex gap-3';
    el.innerHTML =
      `<div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">${AVATAR_AI}</div>` +
      `<div class="flex-1 min-w-0">` +
      `<div class="text-[12px] text-muted-foreground mb-1">Physics Lab Agent</div>` +
      `<div class="inline-block max-w-full rounded-xl rounded-tl-sm bg-card border border-border px-4 py-3 text-[14px] leading-relaxed text-foreground whitespace-pre-wrap"></div>` +
      `</div>`;
    return el;
  }

  function bubbleError(text) {
    const el = bubbleAI();
    const card = el.querySelector('.bg-card');
    card.style.borderColor = 'var(--pl-state-error)';
    card.style.color = 'var(--pl-state-error)';
    card.textContent = text;
    return el;
  }

  // send 按钮在"发送"与"停止"两种模式间切换：streaming 时变停止按钮（可中断），空闲时变发送按钮。
  function setSendMode(mode) {
    if (!sendBtn) return;
    sendBtn.dataset.mode = mode;
    sendBtn.disabled = false; // 两种模式都可点
    sendBtn.innerHTML = mode === 'stop' ? ICON_STOP : ICON_SEND;
    sendBtn.title = mode === 'stop' ? '停止生成' : '发送';
  }
  setSendMode('send'); // 初始发送态

  function setEnabled(ok) {
    textarea.disabled = !ok;
    // send 按钮的禁用只在发送态生效；停止态（streaming）强制可用
    if (sendBtn && sendBtn.dataset.mode !== 'stop') sendBtn.disabled = !ok;
  }

  function append(type, text) {
    if (type === 'user') {
      container.appendChild(bubbleUser(text));
    } else if (type === 'ai') {
      const w = bubbleAI();
      w.querySelector('.bg-card').innerHTML = renderMD(text);
      container.appendChild(w);
    } else if (type === 'error') {
      container.appendChild(bubbleError(text));
    }
    scrollDown();
  }

  function clear() { container.innerHTML = ''; }

  let aiCard = null;
  let rawText = ''; // 原始 markdown 累加器（避免 textContent 剥掉格式）

  // thinking 滚动尾窗：定高框显示思考全文，每个 delta 滚到底，思考结束即移除。
  // 策略（前 120 字 teaser）已升级为尾窗式滚动 teaser，仍属 UI 细节，不单开 ADR（ADR 0011 附注）。
  const THINKING_TAIL = 120; // 尾窗字数：超过则只保留最新 N 字，避免框无限增长
  let thinkingEl = null;
  let rawThinking = '';
  let thinkingRaf = 0; // requestAnimationFrame 句柄，合并同帧多次 delta 防跳
  function scrollThinking() {
    thinkingRaf = 0;
    if (thinkingEl) thinkingEl.scrollTop = thinkingEl.scrollHeight;
  }
  function streamThinking(text) {
    rawThinking += text;
    if (!thinkingEl) {
      const el = document.createElement('div');
      el.className = 'flex gap-3';
      el.innerHTML =
        `<div class="flex-1 min-w-0">` +
        `<div class="text-[12px] text-muted-foreground mb-1">Physics Lab Agent · 思考中</div>` +
        `<div class="thinking-teaser rounded-xl rounded-tl-sm bg-muted/50 px-4 py-2 text-[13px] leading-relaxed text-muted-foreground"></div>` +
        `</div>`;
      container.appendChild(el);
      thinkingEl = el.querySelector('.thinking-teaser');
    }
    // 尾窗：超过 N 字只保留最新部分，使内容持续向上滚出而非冻在头部
    const tail = rawThinking.length > THINKING_TAIL
      ? rawThinking.slice(-THINKING_TAIL)
      : rawThinking;
    thinkingEl.textContent = tail;
    scrollDown();
    // 平滑滚动到底；一帧内多次 delta 合并（reasoning 可能高频，避免逐字跳）
    if (!thinkingRaf) thinkingRaf = requestAnimationFrame(scrollThinking);
  }
  function streamThinkingEnd() {
    if (thinkingRaf) { cancelAnimationFrame(thinkingRaf); thinkingRaf = 0; }
    if (thinkingEl) {
      const row = thinkingEl.closest('.flex');
      if (row) row.remove();
      thinkingEl = null;
      rawThinking = '';
      scrollDown();
    }
  }

  function streamStart() {
    streamThinkingEnd(); // 安全兜底：答案流开始时移除残留 teaser
    if (!streaming) { rawText = ''; streaming = true; setEnabled(false); setSendMode('stop'); }
    if (!aiCard) {
      const el = bubbleAI();
      container.appendChild(el);
      aiCard = el.querySelector('.bg-card');
    }
    scrollDown();
  }

  // 流式渲染策略（方案 b）：streaming 期间用 textContent 显示累积原文，
  // 不调 renderMD/不设 innerHTML -> 不触发 Tailwind 运行时 MutationObserver 全量重扫
  // （长回答下 Tailwind 重扫是渲染进程内存爆/满核"未响应"的根因）。streamDone 时一次性 renderMD 渲染格式。
  // whitespace-pre-wrap（见 bubbleAI）保证 textContent 的 \n 流式期间可见。

  return {
    append,
    clear,
    streamDelta(text) { streamStart(); rawText += text; aiCard.textContent = rawText; scrollDown(); },
    streamTool(name) {
      streamStart();
      if (name === 'write_demo') rawText += '\n⏳ 写入演示文件…';
      else if (name === 'edit_demo') rawText += '\n⏳ 修改演示文件…';
      else if (name === 'validate_demo') rawText += '\n⏳ 校验演示…';
      else if (name === 'read') rawText += '\n⏳ 读取示例…';
      else rawText += '\n⏳ ' + name + '…';
      aiCard.textContent = rawText;
      scrollDown();
    },
    streamThinking,
    streamThinkingEnd,
    streamDone() {
      streamThinkingEnd();
      // 结束时一次性渲染完整 markdown 格式（streaming 期间只显示纯文本）
      if (aiCard) aiCard.innerHTML = renderMD(rawText);
      streaming = false; rawText = ''; aiCard = null; setEnabled(true); setSendMode('send'); textarea.focus();
    },
    streamError(text) { streamThinkingEnd(); streaming = false; aiCard = null; setEnabled(true); setSendMode('send'); container.appendChild(bubbleError(text)); scrollDown(); },
    setEnabled,
    switchContext(title) {
      clear();
      streaming = false; aiCard = null;
      setEnabled(true); setSendMode('send'); // 切 tab 时若处于停止态，图标必须复位，否则按钮停在"停止"却实际在发送
      const w = bubbleAI();
      w.querySelector('.bg-card').innerHTML = renderMD('**当前演示：' + (title || '新建演示') + '**\n\n输入物理题或演示需求。');
      container.appendChild(w);
    },

    // 发送
    send() {
      const text = textarea.value.trim();
      if (!text || streaming) return;
      textarea.value = '';
      append('user', text);
      aiCard = null;
      onSend(text);
    },
    // send 按钮点击分发：streaming 时中断，否则发送
    handleSendClick() {
      if (streaming) { if (onStop) onStop(); }
      else this.send();
    },
  };
}
