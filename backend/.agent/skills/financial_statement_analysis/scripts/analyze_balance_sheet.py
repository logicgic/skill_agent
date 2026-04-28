"""
资产负债表分析脚本。

该脚本消费“财报提取 skill”产出的结构化 JSON，并输出：
1. 核心指标 metrics。
2. 规则触发 signals。
3. 风险列表 risks。
4. 分析摘要 summary。
"""

import json
import sys
from pathlib import Path


def _safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    """
    安全除法：分母为空或为 0 时返回 None，避免运行时异常。
    """
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def analyze_balance_sheet(payload: dict) -> dict:
    """
    基于标准化字段执行规则分析。
    """
    # 统一读取提取脚本产出的资产负债字段。
    balance_sheet = payload.get("normalized_balance_sheet", {})
    cash = balance_sheet.get("cash_and_equivalents")
    short_term_debt = balance_sheet.get("short_term_debt")
    receivables = balance_sheet.get("accounts_receivable")
    inventory = balance_sheet.get("inventory")
    total_assets = balance_sheet.get("total_assets")
    total_liabilities = balance_sheet.get("total_liabilities")
    goodwill = balance_sheet.get("goodwill")
    construction = balance_sheet.get("construction_in_progress")

    # 核心指标用于给出可解释的定量结论。
    metrics = {
      "cash_to_short_debt": _safe_divide(cash, short_term_debt),
      "receivables_ratio": _safe_divide(receivables, total_assets),
      "inventory_ratio": _safe_divide(inventory, total_assets),
      "liability_ratio": _safe_divide(total_liabilities, total_assets),
      "goodwill_ratio": _safe_divide(goodwill, total_assets),
      "construction_ratio": _safe_divide(construction, total_assets),
    }

    # 风险信号列表用于后续 LLM 汇总解释。
    signals: list[dict] = []
    risks: list[dict] = []

    if metrics["cash_to_short_debt"] is not None and metrics["cash_to_short_debt"] < 1:
        signals.append({
            "rule_id": "liquidity_risk_001",
            "level": "high",
            "message": "货币资金低于短期债务，存在短期偿债压力。",
        })
        risks.append({
            "category": "liquidity",
            "level": "high",
            "evidence": {
                "cash": cash,
                "short_term_debt": short_term_debt,
                "cash_to_short_debt": metrics["cash_to_short_debt"],
            },
        })

    if metrics["receivables_ratio"] is not None and metrics["receivables_ratio"] > 0.25:
        signals.append({
            "rule_id": "receivables_risk_001",
            "level": "medium",
            "message": "应收账款占比较高，需要关注回款质量和坏账风险。",
        })

    if metrics["construction_ratio"] is not None and metrics["construction_ratio"] > 0.15:
        signals.append({
            "rule_id": "construction_risk_001",
            "level": "medium",
            "message": "在建工程占比较高且可能长期不转固，需关注资本化与减值风险。",
        })

    if not signals:
        signals.append({
            "rule_id": "base_info_001",
            "level": "info",
            "message": "未触发高风险规则，建议结合多期报表继续跟踪。",
        })

    # 分析摘要用于最终回答的可读性。
    summary = {
        "overall_view": "分析基于资产负债表维度，聚焦资产质量、偿债能力和潜在会计风险。",
        "signal_count": len(signals),
        "top_signal": signals[0]["message"] if signals else "暂无",
    }

    return {
        "summary": summary,
        "metrics": metrics,
        "signals": signals,
        "risks": risks,
    }


def main() -> None:
    """
    命令行入口：读取输入 JSON，输出分析结果 JSON。
    """
    if len(sys.argv) != 3:
        print("Usage: analyze_balance_sheet.py <input_json> <output_json>")
        sys.exit(1)

    input_json = Path(sys.argv[1])
    output_json = Path(sys.argv[2])
    payload = json.loads(input_json.read_text(encoding="utf-8"))
    analyzed = analyze_balance_sheet(payload)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(analyzed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved financial analysis to {str(output_json)}")


if __name__ == "__main__":
    main()

