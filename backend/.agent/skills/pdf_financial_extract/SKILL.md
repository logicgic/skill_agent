---
name: pdf_financial_extract
description: 当用户要求从财报PDF中提取资产负债表数据、科目金额或结构化财务数据时使用该skill。适用于“先提取再分析”的财报场景。
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Financial Extraction

## Purpose

将财报 PDF 抽取为结构化 JSON，支持：

- 输出全量可识别表格（用于“提取所有表格”场景）。
- 按指定关键词输出目标表格（如“资产负债表”）。
- 保留财报分析链路依赖的字段级数据（兼容旧流程）。

## Usage

```bash
python scripts/extract_financial_tables.py <input_pdf> <output_json> [requested_scope]
```

`requested_scope` 可选，默认 `ALL`。示例：

- `ALL`：输出全部可识别表格
- `资产负债表`：优先输出命中资产负债表的表格
- `资产负债表,利润表`：支持逗号分隔的多关键词

## Output

脚本会输出 JSON，包含以下字段：

- `document_meta`: 文档基础信息
- `extracted_text_preview`: 文本预览
- `normalized_balance_sheet`: 标准化资产负债表字段
- `table_sections`: 表格结构化输出（`selected_tables` + `all_tables`）
- `warnings`: 抽取警告信息
