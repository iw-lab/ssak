#!/usr/bin/env python3
"""싹 Firestore (default, nam5 미국) → seoul (asia-northeast3) 전체 복사 — 하위 컬렉션 포함, 값은 REST 그대로(타입 보존).
사용: python3 scripts/migrate-to-seoul.py [--verify]
토큰은 firebase CLI 로그인(~/.config/configstore/firebase-tools.json)의 access_token — 먼저 `npx firebase projects:list` 로 갱신.
원본은 지우지 않는다(검증 후 따로 결정)."""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

P = "isw-writing"
SRC = f"projects/{P}/databases/(default)/documents"
DST = f"projects/{P}/databases/seoul/documents"
API = "https://firestore.googleapis.com/v1/"


def tok():
    return json.load(open(os.path.expanduser("~/.config/configstore/firebase-tools.json")))["tokens"]["access_token"]


TOKEN = tok()


def call(method, url, body=None):
    for attempt in range(5):
        req = urllib.request.Request(API + urllib.parse.quote(url, safe="/:?&=()-_.~%"), method=method, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {TOKEN}", "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 4:
                time.sleep(2 ** attempt); continue
            raise RuntimeError(f"{method} {url} → {e.code} {e.read()[:300]}")


def collections(parent):
    out, page = [], None
    while True:
        r = call("POST", f"{parent}:listCollectionIds", {"pageSize": 300, **({"pageToken": page} if page else {})})
        out += r.get("collectionIds", []); page = r.get("nextPageToken")
        if not page: return out


def docs(parent, coll):
    page = None
    while True:
        q = f"{parent}/{coll}?pageSize=300&showMissing=true" + (f"&pageToken={page}" if page else "")
        r = call("GET", q)
        for d in r.get("documents", []): yield d
        page = r.get("nextPageToken")
        if not page: return


writes, total = [], [0]


def flush():
    if not writes: return
    r = call("POST", f"projects/{P}/databases/seoul/documents:batchWrite", {"writes": writes})
    bad = [s for s in r.get("status", []) if s.get("code")]
    if bad: raise RuntimeError(f"batchWrite 실패 {bad[:3]}")
    total[0] += len(writes); writes.clear()
    print(f"  복사 {total[0]}", flush=True)


def walk(parent_src, parent_dst):
    for c in collections(parent_src):
        for d in docs(parent_src, c):
            rel = d["name"].split("/documents/", 1)[1]
            if "fields" in d:  # showMissing: 필드 없이 하위 컬렉션만 있는 문서는 쓰지 않는다
                writes.append({"update": {"name": f"{DST}/{rel}", "fields": d["fields"]}})
                if len(writes) >= 400: flush()
            walk(d["name"].split("/documents", 1)[0] + "/documents/" + rel, None)


def count(base):
    n = {}
    for c in collections(base):
        n[c] = sum(1 for _ in docs(base, c))
    return n


if "--verify" in sys.argv:
    a, b = count(SRC), count(DST)
    print(json.dumps({"src": a, "dst": b}, ensure_ascii=False))
    sys.exit(0 if a == b else 1)
walk(SRC, DST)
flush()
print(f"끝 — {total[0]}건")
