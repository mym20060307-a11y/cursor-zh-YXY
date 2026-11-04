# Windows 上 build-anchors / verify 编码与 ESM 坑

- 症状：`python scripts/build-anchors.py` 读 `dicts/zh-cn.json` 报 `UnicodeDecodeError: 'gbk' codec`；打印报告时报 `UnicodeEncodeError`（含 ⟦⟧）；`verify-platform-trees` 的 `node --check` 非 0，提示要设 `"type":"module"`。
- 根因：Windows 默认系统编码 GBK；Node 20+ 对含 import/export 的临时 `.js` 做 `--check` 时必须能解析到最近的 `package.json` 且为 ESM。
- 解决：`build-anchors.py` 全部文本 `open(..., encoding='utf-8')`，stdout 用 utf-8/`errors=replace`；跑脚本设 `PYTHONIOENCODING=utf-8`；`verify-platform-trees.mjs` 在临时根写入 `{"type":"module"}` 再 `--check`。
- 避坑：Windows 二次开发优先用 `scripts/new-version.ps1`；不要依赖 WSL（本机 HCS 可能不可用）。PowerShell `Out-File` 默认带 BOM，后续 `JSON.parse` 前先去 `\uFEFF`。
- 补充（3.28.7）：glass 编辑菜单 `&&Undo` 等从 keyed `N({key:"glassOsEdit…"})` 改为 `nls.messages` 下标；测例应对 3.28+ 查 `anchors.nls.entries`，勿再要求 glass fragments 含 `撤销(&&U)`。
- 关键词：gbk, UnicodeDecodeError, node --check, type module, build-anchors.py, new-version.ps1, glassOsEdit, nls.entries, BOM
