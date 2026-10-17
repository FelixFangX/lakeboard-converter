"""Regenerate Chinese web samples using only the Python standard library."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

samples = Path(__file__).resolve().parents[1] / 'web/public/samples'
translations = {
    'Lakeboard Test Root': 'Lakeboard 示例根节点',
    'Branch <strong>Alpha</strong>': '分支 <strong>甲</strong>',
    'Sub-item Alpha.1': '子节点 甲.1', 'Sub-item Alpha.2': '子节点 甲.2',
    'Branch Beta': '分支 乙', 'Sub-item Beta.1': '子节点 乙.1',
    'Branch Gamma': '分支 丙', 'Sheet 1': '画布 1',
    'XMind Test Root': 'XMind 示例根节点', 'Branch A': '分支 甲',
    'This is a note on Branch A': '这是分支甲的备注',
    'important': '重要', 'review': '待复查',
    'Sub-item A.1': '子节点 甲.1', 'Sub-item A.2': '子节点 甲.2',
    'Branch B': '分支 乙', 'Sub-item B.1': '子节点 乙.1',
    'Sub-item B.2': '子节点 乙.2', 'Deep item B.2.1': '深层节点 乙.2.1',
    'Branch C (leaf)': '分支 丙（叶节点）',
}

def translate(value):
    if isinstance(value, dict):
        return {key: translate(item) for key, item in value.items()}
    if isinstance(value, list):
        return [translate(item) for item in value]
    if isinstance(value, str):
        for english, chinese in sorted(translations.items(), key=lambda item: len(item[0]), reverse=True):
            value = value.replace(english, chinese)
    return value

def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'

lakeboard = json.loads((samples / 'sample.lakeboard').read_text())
(samples / 'sample.zh.lakeboard').write_text(encode(translate(lakeboard)))
with ZipFile(samples / 'sample.xmind') as source, ZipFile(
    samples / 'sample.zh.xmind', 'w', compression=ZIP_DEFLATED
) as target:
    for name in ('content.json', 'metadata.json', 'manifest.json'):
        data = json.loads(source.read(name))
        target.writestr(name, encode(translate(data)))
