"""
从 PDF 中提取文本内容并输出结构化 JSON。

Usage:
    python scripts/extract_pdf_content.py <input_pdf> <output_json>
"""

import json
import sys
from pathlib import Path

import pdfplumber


def extract_pdf_content(input_pdf: str) -> dict:
    """
    读取 PDF，并按页提取文本信息。
    """
    input_path = Path(input_pdf)
    pages: list[dict] = []
    warnings: list[str] = []
    full_text_parts: list[str] = []

    with pdfplumber.open(str(input_path)) as pdf:
        total_pages = len(pdf.pages)
        # 限制扫描页数，避免超大文件导致处理时间过长。
        max_pages = min(total_pages, 200)

        for page_index, page in enumerate(pdf.pages[:max_pages], start=1):
            page_text = (page.extract_text() or "").strip()
            if not page_text:
                warnings.append(f"第 {page_index} 页未提取到文本")
                continue

            full_text_parts.append(page_text)
            pages.append(
                {
                    "page_number": page_index,
                    "char_count": len(page_text),
                    "text_preview": page_text[:800],
                }
            )

    full_text = "\n\n".join(full_text_parts)
    return {
        "document_meta": {
            "source_pdf": input_path.name,
            "total_pages": total_pages,
            "pages_processed": len(pages),
        },
        "pages": pages,
        "full_text_preview": full_text[:4000],
        "warnings": warnings,
    }


def main() -> None:
    """
    命令行入口：提取 PDF 内容并写入 JSON。
    """
    if len(sys.argv) != 3:
        print("Usage: extract_pdf_content.py <input_pdf> <output_json>")
        sys.exit(1)

    input_pdf = sys.argv[1]
    output_json = sys.argv[2]

    extracted = extract_pdf_content(input_pdf)
    output_path = Path(output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved PDF content extraction to {output_json}")


if __name__ == "__main__":
    main()
