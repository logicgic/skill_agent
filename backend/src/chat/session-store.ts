import type { SessionMessage } from "../types.js";

/**
 * 会话级消息仓库（内存版）。
 *
 * @remarks
 * 当前实现仅用于单进程场景，不包含持久化能力。
 */
export class SessionStore {
  /** 以 sessionId 为键保存历史消息。 */
  private readonly sessions = new Map<string, SessionMessage[]>();

  /**
   * 读取会话历史，若不存在则返回空数组。
   *
   * @param sessionId 会话唯一标识。
   * @returns 会话历史消息数组。
   */
  getHistory(sessionId: string): SessionMessage[] {
    return this.sessions.get(sessionId) ?? [];
  }

  /**
   * 覆盖写入会话历史。
   *
   * @param sessionId 会话唯一标识。
   * @param messages 最新会话历史消息数组。
   */
  setHistory(sessionId: string, messages: SessionMessage[]): void {
    this.sessions.set(sessionId, messages);
  }
}

