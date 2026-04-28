---
name: pdf_content_extract
description: 当用户需要提取 PDF 文档内容时使用该 skill。适用于读取 PDF 文本、按页提取内容、输出结构化 JSON 结果等场景。
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Content Extraction

## Purpose

使用脚本从 PDF 中提取可读文本内容，并输出结构化 JSON，便于后续问答或二次处理。

## Usage

```bash
python scripts/extract_pdf_content.py <input_pdf> <output_json>
```

## Output

脚本会输出 JSON，包含以下字段：

- `document_meta`: 源文件名、总页数、处理页数
- `pages`: 每页文本摘要（页码、字符数、预览）
- `full_text_preview`: 全文预览
- `warnings`: 提取过程中的告警信息
