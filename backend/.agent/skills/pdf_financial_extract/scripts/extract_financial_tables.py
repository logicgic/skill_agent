"""
从财报 PDF 中提取可用于资产负债分析的基础结构化数据。

该脚本是“财报提取 -> 财报分析”链路的第一步：
1. 读取 PDF 文本。
2. 按关键词尝试提取常见资产负债项目金额。
3. 输出统一 JSON，供后续分析脚本消费。
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber


def _normalize_number(raw_value: str) -> float | None:
    """
    把文本金额转成浮点数。
    支持逗号分隔与括号负数；无法转换时返回 None。
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


def _extract_first_number_by_patterns(text: str, patterns: list[str]) -> float | None:
    """
    根据候选关键词在全文中查找第一处金额。
    该实现是 v1 简化规则：匹配关键词后，抓取同行内第一个数字串。
    """
    lines = text.splitlines()
    for line in lines:
        for pattern in patterns:
            if re.search(pattern, line):
                number_match = re.search(r"[-(]?\d[\d,，]*(?:\.\d+)?\)?", line)
                if number_match:
                    return _normalize_number(number_match.group(0))
    return None


def extract_financial_data(pdf_path: str) -> dict:
    """
    从 PDF 读取文本并抽取标准化资产负债字段。
    """
    text_chunks: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        # 仅抽取前 30 页，控制时延并覆盖大多数半年报核心页。
        for page in pdf.pages[:30]:
            text_chunks.append(page.extract_text() or "")
    full_text = "\n".join(text_chunks)

    # 字段映射用于统一输出键名，便于后续分析脚本计算指标。
    field_patterns: dict[str, list[str]] = {
        "cash_and_equivalents": [r"货币资金", r"现金及现金等价物"],
        "accounts_receivable": [r"应收账款"],
        "inventory": [r"存货"],
        "short_term_debt": [r"短期借款", r"一年内到期的非流动负债"],
        "fixed_assets": [r"固定资产"],
        "construction_in_progress": [r"在建工程"],
        "goodwill": [r"商誉"],
        "long_term_receivables": [r"长期应收款"],
        "total_assets": [r"资产总计"],
        "total_liabilities": [r"负债合计"],
        "owners_equity": [r"所有者权益合计", r"股东权益合计"],
    }

    normalized_balance_sheet: dict[str, float | None] = {}
    warnings: list[str] = []
    for field_name, patterns in field_patterns.items():
        extracted_value = _extract_first_number_by_patterns(full_text, patterns)
        normalized_balance_sheet[field_name] = extracted_value
        if extracted_value is None:
            warnings.append(f"未识别字段: {field_name}")

    return {
        "document_meta": {
            "source_pdf": str(Path(pdf_path).name),
            "pages_scanned": len(text_chunks),
        },
        "extracted_text_preview": full_text[:1200],
        "normalized_balance_sheet": normalized_balance_sheet,
        "warnings": warnings,
    }


def main() -> None:
    """
    命令行入口：读取输入 PDF 并保存结构化 JSON。
    """
    if len(sys.argv) != 3:
        print("Usage: extract_financial_tables.py <input_pdf> <output_json>")
        sys.exit(1)

    input_pdf = sys.argv[1]
    output_json = sys.argv[2]
    extracted = extract_financial_data(input_pdf)
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved financial extraction to {output_json}")


if __name__ == "__main__":
    main()

