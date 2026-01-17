// src/utils/reply-long.js

export function splitIntoChunks(text, maxLen = 3500) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    let end = Math.min(i + maxLen, text.length);

    // режем по \n чтобы не ломать абзацы
    const nl = text.lastIndexOf("\n", end);
    if (nl > i + 500) end = nl;

    chunks.push(text.slice(i, end));
    i = end;
  }

  return chunks;
}

/**
 * Отправляет длинный текст несколькими сообщениями.
 * lastMessageExtra (клавиатуру) добавляем только на последнем сообщении.
 */
export async function replyLong(ctx, text, lastMessageExtra = {}) {
  const chunks = splitIntoChunks(String(text || ""));
  for (let idx = 0; idx < chunks.length; idx++) {
    const extra = idx === chunks.length - 1 ? lastMessageExtra : {};
    await ctx.reply(chunks[idx], extra);
  }
}
