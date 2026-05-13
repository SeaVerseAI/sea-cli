/**
 * SSE (Server-Sent Events) parser for streaming responses.
 */
export interface SSEEvent {
  data: string;
  event?: string;
  id?: string;
}

export async function* parseSSE(res: Response): AsyncGenerator<SSEEvent> {
  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let event: Partial<SSEEvent> = {};
      for (const line of lines) {
        if (line.startsWith('data:')) {
          event.data = line.slice(5).trim();
        } else if (line.startsWith('event:')) {
          event.event = line.slice(6).trim();
        } else if (line.startsWith('id:')) {
          event.id = line.slice(3).trim();
        } else if (line === '' && event.data !== undefined) {
          yield event as SSEEvent;
          event = {};
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
