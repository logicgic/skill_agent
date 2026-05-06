import path from "node:path";
import type { DocumentCatalog } from "./document-router.js";
import type { SkillPlan, SkillStep } from "./skill-plan.js";
import { resolveScriptArgPlaceholders } from "../path-manager.js";
import { runSkillScript } from "../skill/skill-sandbox.js";

/**
 * 编排步骤执行状态。
 *
 * @remarks
 * 状态用于驱动上层元事件输出与失败恢复策略。
 */
export type SkillStepStatus = "success" | "failed" | "skipped";

/**
 * 单个步骤执行结果。
 *
 * @remarks
 * 同时保留脚本执行信息和参数解析结果，便于排障。
 */
export interface SkillStepExecutionResult {
  /** 步骤定义。 */
  step: SkillStep;
  /** 执行状态。 */
  status: SkillStepStatus;
  /** 退出码。 */
  exitCode: number;
  /** 执行命令。 */
  command?: string;
  /** 执行命令参数。 */
  commandArgs?: string[];
  /** 标准输出。 */
  stdout: string;
  /** 标准错误。 */
  stderr: string;
  /** 解析后的参数。 */
  resolvedArgs: string[];
}

/**
 * 整个计划执行结果。
 *
 * @remarks
 * `stepResults` 顺序与计划步骤顺序一致。
 */
export interface SkillPlanExecutionResult {
  /** 原始计划。 */
  plan: SkillPlan;
  /** 每步执行结果。 */
  stepResults: SkillStepExecutionResult[];
}

/**
 * 步骤事件类型。
 *
 * @remarks
 * 事件用于流式通知前端或日志系统。
 */
export interface SkillStepEvent {
  /** 事件类型。 */
  type: "step_started" | "step_completed" | "step_failed" | "step_skipped";
  /** 步骤定义。 */
  step: SkillStep;
  /** 步骤序号（从 1 开始）。 */
  index: number;
}

type StepOutputMap = Record<string, { outputJson?: string; outputDir?: string }>;

/**
 * 从步骤参数推断输出位置，供后续步骤引用。
 *
 * @param resolvedArgs 已解析的步骤参数数组。
 * @returns 可供后续步骤占位符引用的输出信息。
 */
const inferStepOutputs = (resolvedArgs: string[]): { outputJson?: string; outputDir?: string } => {
  const outputJson = resolvedArgs.find((arg) => arg.toLowerCase().endsWith(".json"));
  const outputDir = resolvedArgs.find((arg) => !path.extname(arg) && arg.includes(path.sep));
  return { outputJson, outputDir };
};

/**
 * 用前序步骤输出替换参数模板。
 *
 * @param arg 原始参数。
 * @param outputs 已执行步骤的输出映射。
 * @returns 占位符替换后的参数。
 */
const replaceStepOutputPlaceholders = (arg: string, outputs: StepOutputMap): string => {
  return arg.replace(/\{\{prev\.([a-zA-Z0-9_\-]+)\.(output_json|output_dir)\}\}/g, (_source, stepId: string, key: string) => {
    const matched = outputs[stepId];
    if (!matched) {
      return "";
    }
    return key === "output_json" ? (matched.outputJson ?? "") : (matched.outputDir ?? "");
  });
};

/**
 * 解析步骤参数：先替换步骤产物占位符，再替换文件占位符。
 *
 * @param input 参数解析上下文。
 * @returns 完整解析后的步骤参数数组。
 */
const resolveStepArgs = (input: {
  args: string[];
  projectRoot: string;
  catalog: DocumentCatalog;
  outputs: StepOutputMap;
}): string[] => {
  const replaced = input.args.map((arg) => replaceStepOutputPlaceholders(arg, input.outputs));
  return resolveScriptArgPlaceholders(replaced, {
    projectRoot: input.projectRoot,
    catalog: input.catalog,
  });
};

/**
 * 顺序执行 skill 计划，失败默认降级继续。
 *
 * @param input 计划执行上下文。
 * @returns 计划执行结果，包含每一步状态与输出。
 */
export const runSkillPlan = async (input: {
  projectRoot: string;
  catalog: DocumentCatalog;
  plan: SkillPlan;
  continueOnError?: boolean;
  onStepEvent?: (event: SkillStepEvent) => void | Promise<void>;
}): Promise<SkillPlanExecutionResult> => {
  const continueOnError = input.continueOnError ?? true;
  const stepResults: SkillStepExecutionResult[] = [];
  const outputs: StepOutputMap = {};

  for (let index = 0; index < input.plan.steps.length; index += 1) {
    const step = input.plan.steps[index];
    const stepIndex = index + 1;
    await input.onStepEvent?.({ type: "step_started", step, index: stepIndex });

    const resolvedArgs = resolveStepArgs({
      args: step.args,
      projectRoot: input.projectRoot,
      catalog: input.catalog,
      outputs,
    });

    if (!step.scriptPath) {
      const skippedResult: SkillStepExecutionResult = {
        step,
        status: "skipped",
        exitCode: 0,
        stdout: "",
        stderr: "no_script_step",
        resolvedArgs,
      };
      stepResults.push(skippedResult);
      await input.onStepEvent?.({ type: "step_skipped", step, index: stepIndex });
      continue;
    }

    try {
      const execution = await runSkillScript({
        projectRoot: input.projectRoot,
        skillName: step.skillName,
        scriptPath: step.scriptPath,
        args: resolvedArgs,
        timeoutMs: 120000,
      });

      const status: SkillStepStatus = execution.exitCode === 0 ? "success" : "failed";
      const result: SkillStepExecutionResult = {
        step,
        status,
        exitCode: execution.exitCode,
        command: execution.command,
        commandArgs: execution.commandArgs,
        stdout: execution.stdout,
        stderr: execution.stderr,
        resolvedArgs,
      };
      stepResults.push(result);
      outputs[step.id] = inferStepOutputs(resolvedArgs);

      if (status === "failed") {
        await input.onStepEvent?.({ type: "step_failed", step, index: stepIndex });
        if (!continueOnError || step.required) {
          break;
        }
      } else {
        await input.onStepEvent?.({ type: "step_completed", step, index: stepIndex });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: SkillStepExecutionResult = {
        step,
        status: "failed",
        exitCode: 1,
        stdout: "",
        stderr: message,
        resolvedArgs,
      };
      stepResults.push(failedResult);
      await input.onStepEvent?.({ type: "step_failed", step, index: stepIndex });
      if (!continueOnError || step.required) {
        break;
      }
    }
  }

  return {
    plan: input.plan,
    stepResults,
  };
};
