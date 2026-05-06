/**
 * 单个编排步骤定义。
 *
 * @remarks
 * 每个步骤对应一次 skill 调用或一个无脚本占位步骤。
 */
export interface SkillStep {
  /** 步骤唯一 ID。 */
  id: string;
  /** 要执行的 skill 名称。 */
  skillName: string;
  /** skill 内脚本相对路径。 */
  scriptPath: string;
  /** 脚本参数列表。 */
  args: string[];
  /** 步骤原因说明。 */
  reason: string;
  /** 是否关键步骤。关键步骤失败可触发提前终止。 */
  required: boolean;
}

/**
 * 单轮对话的 skill 执行计划。
 *
 * @remarks
 * 计划由自动路由、LLM 或二者混合生成。
 */
export interface SkillPlan {
  /** 计划中的步骤列表。 */
  steps: SkillStep[];
  /** 计划触发来源。 */
  triggerSource: "auto" | "llm" | "hybrid";
  /** 计划说明。 */
  planReason: string;
}
