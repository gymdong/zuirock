"""새 문제 파일이 기존 문제와 겹치는지 찾는다 (같은 지식을 다른 말로 묻는 중복).

사용: python3 scripts/check-dup.py <새 파일.json> [기존 폴더·파일 ...]
기존을 생략하면 저장소의 content/incoming 과 content/archive 를 본다 (어느 폴더에서 실행해도 된다).

찾는 것
  A. 정답 같음   : 같은 주제에서 OX가 아닌 문제의 정답이 같다 (같은 지식일 가능성 높음)
  B. 문장 비슷함 : 띄어쓰기·문장부호를 뺀 문제 문장의 글자 2-gram 유사도가 기준 이상
  C. 새 파일 안  : 새 파일 안에서 A·B
걸린 쌍은 '같은 지식을 묻는지' 사람(또는 Claude)이 최종 판단한다. 걸렸다고 모두 중복은 아니다.
import 검사(pnpm import:questions)는 문구가 완전히 같은 경우만 막는다.
"""
import glob
import json
import math
import os
import re
import sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_OLD = [os.path.join(ROOT, "content", "incoming"), os.path.join(ROOT, "content", "archive")]
SIM = 0.40  # 흔한 말투를 낮춰 잰 2-gram 유사도 기준
IDF = {}


def norm(s):
    return re.sub(r"[\s\W_]+", "", str(s)).lower()


def grams(s):
    s = norm(s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def jac(a, b):
    """IDF 가중 Jaccard: '무엇인가요', '알맞은 것은' 같은 흔한 말투는 거의 0점."""
    if not a or not b:
        return 0.0
    inter = sum(IDF.get(g, 0.0) for g in a & b)
    union = sum(IDF.get(g, 0.0) for g in a | b)
    return inter / union if union else 0.0


def load(path):
    if not os.path.exists(path):
        sys.exit(f"파일·폴더가 없어요: {path}")
    out = []
    for f in sorted(glob.glob(os.path.join(path, "*.json"))) if os.path.isdir(path) else [path]:
        try:
            with open(f, encoding="utf-8") as fh:
                arr = json.load(fh)
        except Exception as e:  # 깨진 파일은 조용히 넘기지 않는다
            print(f"경고: {f} 를 읽지 못해 건너뜀 ({e})", file=sys.stderr)
            continue
        if not isinstance(arr, list):
            print(f"경고: {f} 는 문제 배열이 아니라 건너뜀", file=sys.stderr)
            continue
        for i, q in enumerate(arr, 1):
            if isinstance(q, dict) and "question" in q:
                q = dict(q)
                q["_file"] = os.path.abspath(f)
                q["_where"] = f"{os.path.basename(f)}#{q.get('no', i)}"
                q["_g"] = grams(q["question"])
                out.append(q)
    return out


def pairs(xs, ys, same):
    hits = []
    for i, a in enumerate(xs):
        for j, b in enumerate(ys):
            if (same and j <= i) or a.get("topic") != b.get("topic"):
                continue
            why = []
            if a.get("type") != "ox" and b.get("type") != "ox" and norm(a.get("answer", "")) == norm(b.get("answer", "")):
                why.append("정답 같음")
            s = jac(a["_g"], b["_g"])
            if s >= SIM:
                why.append(f"문장 유사 {s:.2f}")
            if why:
                hits.append((why, a, b))
    return hits


def show(title, hits):
    print(f"\n## {title}: {len(hits)}건")
    for why, a, b in hits:
        print(f"- [{' · '.join(why)}] {a['_where']}  ↔  {b['_where']}")
        print(f"    새: {a['question']}  → {a.get('answer')}")
        print(f"    기존: {b['question']}  → {b.get('answer')}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    new = load(sys.argv[1])
    if not new:
        sys.exit(f"{sys.argv[1]} 에서 문제를 하나도 읽지 못했어요")
    new_files = {q["_file"] for q in new}
    # 새 파일이 이미 content/incoming 안에 있으면 기존 쪽에서 뺀다
    old = [q for p in (sys.argv[2:] or DEFAULT_OLD) for q in load(p) if q["_file"] not in new_files]
    df = Counter(g for q in new + old for g in q["_g"])
    n = len(new) + len(old)
    IDF.update({g: math.log(n / c) for g, c in df.items()})
    print(f"새 문제 {len(new)}개, 기존 문제 {len(old)}개와 비교")
    show("기존 문제와 겹침 의심", pairs(new, old, False))
    show("새 파일 안에서 겹침 의심", pairs(new, new, True))


if __name__ == "__main__":
    main()
