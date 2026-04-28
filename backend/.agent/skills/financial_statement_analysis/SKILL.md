---
name: financial_statement_analysis
description: 当用户要求分析财报资产负债表、资产质量、偿债风险或基于资产负债表维度评估投资信号时使用该skill。
license: Proprietary. LICENSE.txt has complete terms
---

# Financial Statement Analysis

## Purpose

读取结构化资产负债表 JSON，输出风险信号、核心指标与结论摘要。

## Usage

```bash
python scripts/analyze_balance_sheet.py <input_json> <output_json>
```

## Notes

- 当前版本聚焦资产负债表维度。
- 当用户请求“投资价值”时，会附带能力边界声明。

