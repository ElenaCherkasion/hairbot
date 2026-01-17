// src/utils/reply-long.js
export function splitIntoChunks(text, maxLen = 3500) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    let end = Math.min(i + maxLen, text.length);
    const nl = text.lastIndexOf("\n", end);
    if (nl > i + 500) end = nl;

    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

// Отправляет длинный текст несколькими сообщениями.
// extra (клавиатуру) ставим только на последнем сообщении.
export async function replyLong(ctx, text, lastMessageExtra = {}) {
  const chunks = splitIntoChunks(text);
  for (let idx = 0; idx < chunks.length; idx++) {
    const extra = idx === chunks.length - 1 ? lastMessageExtra : {};
    await ctx.reply(chunks[idx], extra);
  }
}
