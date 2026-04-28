"""
基于 PDF 内容提取结果执行资产负债表维度分析。

Usage:
    python scripts/analyze_balance_sheet_from_extract.py <extract_json> <analysis_json>
"""

import json
import re
import sys
from pathlib import Path


def _normalize_number(raw_value: str) -> float | None:
    """
    将文本中的数字规范为 float，支持千分位与括号负数。
    """
    cleaned = raw_value.replace(",", "").replace("，", "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return None


def _safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    """
    安全除法，分母为空或 0 时返回 None。
    """
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _extract_first_number_by_patterns(text: str, patterns: list[str]) -> float | None:
    """
    从全文中按关键词匹配行并提取首个数字。
    """
    for line in text.splitlines():
        for pattern in patterns:
            if re.search(pattern, line):
                matched_number = re.search(r"[-(]?\d[\d,，]*(?:\.\d+)?\)?", line)
                if matched_number:
                    return _normalize_number(matched_number.group(0))
    return None


def _collect_text(payload: dict) -> str:
    """
    组装分析所需全文，优先使用 full_text_preview，其次拼接页预览。
    """
    full_text_preview = payload.get("full_text_preview")
    if isinstance(full_text_preview, str) and full_text_preview.strip():
        return full_text_preview

    page_texts: list[str] = []
    for page in payload.get("pages", []):
        if isinstance(page, dict):
            text_preview = page.get("text_preview")
            if isinstance(text_preview, str) and text_preview.strip():
                page_texts.append(text_preview)
    return "\n".join(page_texts)


def analyze_balance_sheet(payload: dict) -> dict:
    """
    输出核心指标、风险信号与摘要。
    """
    source_text = _collect_text(payload)
    field_patterns: dict[str, list[str]] = {
        "cash_and_equivalents": [r"货币资金", r"现金及现金等价物"],
        "accounts_receivable": [r"应收账款"],
        "inventory": [r"存货"],
        "short_term_debt": [r"短期借款", r"一年内到期的非流动负债"],
        "total_assets": [r"资产总计"],
        "total_liabilities": [r"负债合计"],
        "goodwill": [r"商誉"],
        "construction_in_progress": [r"在建工程"],
    }

    normalized_balance_sheet: dict[str, float | None] = {}
    missing_fields: list[str] = []
    for field_name, patterns in field_patterns.items():
        extracted_value = _extract_first_number_by_patterns(source_text, patterns)
        normalized_balance_sheet[field_name] = extracted_value
        if extracted_value is None:
            missing_fields.append(field_name)

    cash = normalized_balance_sheet.get("cash_and_equivalents")
    short_term_debt = normalized_balance_sheet.get("short_term_debt")
    receivables = normalized_balance_sheet.get("accounts_receivable")
    inventory = normalized_balance_sheet.get("inventory")
    total_assets = normalized_balance_sheet.get("total_assets")
    total_liabilities = normalized_balance_sheet.get("total_liabilities")
    goodwill = normalized_balance_sheet.get("goodwill")
    construction = normalized_balance_sheet.get("construction_in_progress")

    metrics = {
        "cash_to_short_debt": _safe_divide(cash, short_term_debt),
        "receivables_ratio": _safe_divide(receivables, total_assets),
        "inventory_ratio": _safe_divide(inventory, total_assets),
        "liability_ratio": _safe_divide(total_liabilities, total_assets),
        "goodwill_ratio": _safe_divide(goodwill, total_assets),
        "construction_ratio": _safe_divide(construction, total_assets),
    }

    signals: list[dict] = []
    if metrics["cash_to_short_debt"] is not None and metrics["cash_to_short_debt"] < 1:
        signals.append(
            {
                "rule_id": "liquidity_risk_001",
                "level": "high",
                "message": "货币资金低于短期债务，存在短期偿债压力。",
            }
        )
    if metrics["receivables_ratio"] is not None and metrics["receivables_ratio"] > 0.25:
        signals.append(
            {
                "rule_id": "receivables_risk_001",
                "level": "medium",
                "message": "应收账款占比较高，需要关注回款质量和坏账风险。",
            }
        )
    if metrics["construction_ratio"] is not None and metrics["construction_ratio"] > 0.15:
        signals.append(
            {
                "rule_id": "construction_risk_001",
                "level": "medium",
                "message": "在建工程占比较高，需关注资本化与减值风险。",
            }
        )
    if not signals:
        signals.append(
            {
                "rule_id": "base_info_001",
                "level": "info",
                "message": "未触发高风险规则，建议结合多期报表继续跟踪。",
            }
        )

    summary = {
        "overall_view": "分析基于资产负债表维度，聚焦偿债能力、资产质量与潜在会计风险。",
        "signal_count": len(signals),
        "top_signal": signals[0]["message"],
        "missing_field_count": len(missing_fields),
    }

    return {
        "summary": summary,
        "metrics": metrics,
        "signals": signals,
        "normalized_balance_sheet": normalized_balance_sheet,
        "missing_fields": missing_fields,
    }


def main() -> None:
    """
    命令行入口。
    """
    if len(sys.argv) != 3:
        print("Usage: analyze_balance_sheet_from_extract.py <extract_json> <analysis_json>")
        sys.exit(1)

    extract_json_path = Path(sys.argv[1])
    analysis_json_path = Path(sys.argv[2])

    payload = json.loads(extract_json_path.read_text(encoding="utf-8"))
    analyzed = analyze_balance_sheet(payload)

    analysis_json_path.parent.mkdir(parents=True, exist_ok=True)
    analysis_json_path.write_text(
        json.dumps(analyzed, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Saved balance-sheet analysis to {analysis_json_path}")


if __name__ == "__main__":
    main()
