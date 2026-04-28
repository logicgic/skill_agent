/**
 * 会话级消息仓库（内存版）。
 */
export class SessionStore {
    /** 以 sessionId 为键保存历史消息。 */
    sessions = new Map();
    /**
     * 读取会话历史，若不存在则返回空数组。
     */
    getHistory(sessionId) {
        return this.sessions.get(sessionId) ?? [];
    }
    /**
     * 覆盖写入会话历史。
     */
    setHistory(sessionId, messages) {
        this.sessions.set(sessionId, messages);
    }
}
