---
name: pdf_financial_extract
description: 当用户要求从财报PDF中提取资产负债表数据、科目金额或结构化财务数据时使用该skill。适用于“先提取再分析”的财报场景。
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Financial Extraction

## Purpose

将财报 PDF 抽取为结构化 JSON，作为后续财报分析 skill 的输入。

## Usage

```bash
python scripts/extract_financial_tables.py <input_pdf> <output_json>
```

## Output

脚本会输出 JSON，包含以下字段：

- `document_meta`: 文档基础信息
- `extracted_text_preview`: 文本预览
- `normalized_balance_sheet`: 标准化资产负债表字段
- `warnings`: 抽取警告信息

