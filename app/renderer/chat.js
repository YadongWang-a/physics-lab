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
      const thead = '<tr>' + hdr.split('|').map(c => '<th class="text-left px-3 py-1.5 border-b border-border text-[13px]">' + c.trim() + '</th>').join('') + '</tr>';
      const tbody = rows.trim().split('\n').map(r =>
        '<tr>' + r.split('|').map(c => '<td class="px-3 py-1.5 text-[13px]">' + c.trim() + '</td>').join('') + '</tr>'
      ).join('');
      return '<table class="w-full my-2 border-collapse">' + thead + tbody + '</table>';
    })
    // 块级公式 $$...$$
    .replace(/\$\$([\s\S]*?)\$\$/g, '<div class="bg-muted rounded-lg p-4 my-2 text-center text-[14px] font-mono">$1</div>')
    // 行内公式 $...$
    .replace(/\$([^$]+)\$/g, '<code class="bg-muted px-1 rounded text-[13px] font-mono">$1</code>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 分割线
    .replace(/^---$/gm, '<hr class="border-border my-3">')
    // 换行
    .replace(/\n/g, '<br>');
  return h;
}

const AVATAR_AI = '<svg class="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>';
const AVATAR_USER = '<svg class="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

export function createChat(container, textarea, sendBtn, { onSend }) {
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
      `<div class="inline-block max-w-full rounded-xl rounded-tl-sm bg-card border border-border px-4 py-3 text-[14px] leading-relaxed text-foreground"></div>` +
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

  function setEnabled(ok) {
    textarea.disabled = !ok;
    if (sendBtn) sendBtn.disabled = !ok;
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
  function streamStart() {
    if (!streaming) { streaming = true; setEnabled(false); }
    if (!aiCard) {
      const el = bubbleAI();
      container.appendChild(el);
      aiCard = el.querySelector('.bg-card');
    }
    scrollDown();
  }

  return {
    append,
    clear,
    streamDelta(text) { streamStart(); aiCard.innerHTML = renderMD(aiCard.textContent + text); scrollDown(); },
    streamTool(name) {
      streamStart();
      const cur = aiCard ? aiCard.textContent : '';
      if (name === 'write') aiCard.innerHTML = renderMD(cur + '\n⏳ 写入文件…');
      else if (name === 'read') aiCard.innerHTML = renderMD(cur + '\n⏳ 读取示例…');
      else aiCard.innerHTML = renderMD(cur + '\n⏳ ' + name + '…');
      scrollDown();
    },
    streamDone() {
      if (aiCard) aiCard.innerHTML = renderMD(aiCard.textContent);
      streaming = false; aiCard = null; setEnabled(true); textarea.focus();
    },
    streamError(text) { streaming = false; aiCard = null; setEnabled(true); container.appendChild(bubbleError(text)); scrollDown(); },
    setEnabled,
    switchContext(title) {
      clear();
      streaming = false; aiCard = null;
      setEnabled(true);
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
  };
}
