#!/usr/bin/env python3
import argparse
import json
import re


def load_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def split_paragraphs(text):
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    return paragraphs


def main():
    parser = argparse.ArgumentParser(description="将原始小说文本分段，便于制作剧情场景。")
    parser.add_argument("path", help="原始文本文件路径，例如 novel.txt")
    parser.add_argument("--output", help="输出 JSON 文件路径，例如 paragraphs.json")
    args = parser.parse_args()

    text = load_text(args.path)
    paragraphs = split_paragraphs(text)

    for index, paragraph in enumerate(paragraphs, start=1):
        print(f"[{index}] {paragraph[:120]}{'...' if len(paragraph) > 120 else ''}\n")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump({"paragraphs": paragraphs}, f, ensure_ascii=False, indent=2)
        print(f"已输出到 {args.output}")


if __name__ == "__main__":
    main()
