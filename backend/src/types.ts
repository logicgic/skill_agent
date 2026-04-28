/**
 * 单条聊天消息的数据结构。
 */
export interface SessionMessage {
  /** 消息发送角色。 */
  role: "system" | "user" | "assistant";
  /** 消息正文内容。 */
  content: string;
}

/**
 * 一次流式响应里传回前端的事件。
 */
export interface StreamEvent {
  /** 事件类型，前端根据类型决定如何渲染。 */
  type: "meta" | "chunk" | "done" | "error";
  /** 事件文本内容。 */
  content: string;
}
