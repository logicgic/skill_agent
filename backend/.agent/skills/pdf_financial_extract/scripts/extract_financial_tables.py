"""
从财报 PDF 中提取可用于资产负债分析的基础结构化数据。

该脚本是“财报提取 -> 财报分析”链路的第一步：
1. 读取 PDF 文本与可识别表格。
2. 按关键词提取常见资产负债项目金额（兼容旧字段）。
3. 输出 table_sections（全量表格 + 指定表格）和统一 JSON。
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber


def _normalize_cell(raw_cell: object) -> str:
    """
    统一清洗表格单元格文本。
    """
    if raw_cell is None:
        return ""
    return str(raw_cell).replace("\n", " ").replace("\t", " ").strip()


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


def _guess_table_title(page_text: str, table_matrix: list[list[str]]) -> str:
    """
    从页文本与表头中推断表格标题，用于“指定表格”匹配。
    """
    title_candidates = []
    for line in page_text.splitlines()[:30]:
        normalized = line.strip()
        if not normalized:
            continue
        if "表" in normalized or "资产负债" in normalized or "利润" in normalized or "现金流" in normalized:
            title_candidates.append(normalized)
    if title_candidates:
        return title_candidates[0]
    if table_matrix and table_matrix[0]:
        return " ".join(cell for cell in table_matrix[0] if cell)[:120]
    return "未识别标题"


def _extract_tables(pdf_path: str) -> tuple[list[dict], list[str], str, int]:
    """
    使用 pdfplumber 提取全量可识别表格。
    返回：
    - all_tables: 全量结构化表格
    - text_chunks: 全文文本片段
    - text_preview: 文本预览
    - pages_scanned: 扫描页数
    """
    all_tables: list[dict] = []
    warnings: list[str] = []
    text_chunks: list[str] = []
    pages_scanned = 0

    with pdfplumber.open(pdf_path) as pdf:
        # 控制扫描页数，兼顾时延和覆盖率。
        for page_index, page in enumerate(pdf.pages[:80]):
            pages_scanned += 1
            page_text = page.extract_text() or ""
            text_chunks.append(page_text)
            try:
                # 行列边界优先采用 lines，兼容财报网格线场景。
                extracted_tables = page.extract_tables(
                    table_settings={
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                        "intersection_tolerance": 5,
                    }
                ) or []
            except Exception as error:  # pragma: no cover - 容错路径
                warnings.append(f"第 {page_index + 1} 页表格提取失败: {str(error)}")
                extracted_tables = []

            for table_index, raw_table in enumerate(extracted_tables):
                # 清洗二维矩阵：去掉空行，保留文本原值。
                cleaned_matrix: list[list[str]] = []
                for raw_row in raw_table:
                    cleaned_row = [_normalize_cell(cell) for cell in (raw_row or [])]
                    if any(cell for cell in cleaned_row):
                        cleaned_matrix.append(cleaned_row)

                if not cleaned_matrix:
                    continue

                # 第一行默认作为表头；后续行作为数据行，便于前端直渲染。
                headers = cleaned_matrix[0]
                rows = cleaned_matrix[1:] if len(cleaned_matrix) > 1 else []
                title_guess = _guess_table_title(page_text, cleaned_matrix)
                total_cells = sum(len(row) for row in cleaned_matrix)
                non_empty_cells = sum(1 for row in cleaned_matrix for cell in row if cell)

                all_tables.append(
                    {
                        "page": page_index + 1,
                        "table_index": table_index,
                        "title_guess": title_guess,
                        "headers": headers,
                        "rows": rows,
                        "raw_matrix": cleaned_matrix,
                        "quality": {
                            "row_count": len(cleaned_matrix),
                            "column_count": max((len(row) for row in cleaned_matrix), default=0),
                            "non_empty_ratio": (non_empty_cells / total_cells) if total_cells else 0.0,
                        },
                    }
                )

    return all_tables, warnings, "\n".join(text_chunks), pages_scanned


def _select_requested_tables(all_tables: list[dict], requested_scope: str) -> tuple[list[dict], str | None]:
    """
    按用户请求筛选目标表格。
    - requested_scope=ALL: 返回全量。
    - 其他：按关键词命中 title_guess/header/raw_matrix。
    """
    if requested_scope == "ALL":
        return all_tables, None

    # 支持英文逗号与中文逗号，兼容多关键词请求。
    requested_keywords = [keyword.strip() for keyword in re.split(r"[，,]", requested_scope) if keyword.strip()]
    if not requested_keywords:
        return all_tables, None

    selected_tables: list[dict] = []
    for table in all_tables:
        searchable_text = " ".join(
            [
                table.get("title_guess", ""),
                " ".join(table.get("headers", [])),
                " ".join(" ".join(row) for row in table.get("rows", [])),
            ]
        )
        if any(keyword in searchable_text for keyword in requested_keywords):
            selected_tables.append(table)

    if selected_tables:
        return selected_tables, None
    return [], f"未命中指定表格: {requested_scope}"


def extract_financial_data(pdf_path: str, requested_scope: str = "ALL") -> dict:
    """
    从 PDF 读取文本并抽取标准化资产负债字段。
    """
    all_tables, table_warnings, full_text, pages_scanned = _extract_tables(pdf_path)
    selected_tables, unmatched_request = _select_requested_tables(all_tables, requested_scope)

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

    warnings.extend(table_warnings)

    return {
        "document_meta": {
            "source_pdf": str(Path(pdf_path).name),
            "pages_scanned": pages_scanned,
        },
        "extracted_text_preview": full_text[:1200],
        "normalized_balance_sheet": normalized_balance_sheet,
        "table_sections": {
            "requested_scope": requested_scope,
            "selected_tables": selected_tables,
            "all_tables": all_tables,
            "unmatched_request": unmatched_request,
        },
        "warnings": warnings,
    }


def main() -> None:
    """
    命令行入口：读取输入 PDF 并保存结构化 JSON。
    """
    if len(sys.argv) not in (3, 4):
        print("Usage: extract_financial_tables.py <input_pdf> <output_json> [requested_scope]")
        sys.exit(1)

    input_pdf = sys.argv[1]
    output_json = sys.argv[2]
    # requested_scope: ALL / 资产负债表 / 利润表 / 现金流量表 / 自定义关键词（逗号分隔）
    requested_scope = sys.argv[3] if len(sys.argv) == 4 else "ALL"
    extracted = extract_financial_data(input_pdf, requested_scope=requested_scope)
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved financial extraction to {output_json}")


if __name__ == "__main__":
    main()
