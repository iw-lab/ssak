#!/bin/bash
~/.claude/bin/research.sh --file /Users/sim-insu/Documents/dev/ssak-v1/docs/research-2026-11-20/q-kr.txt "첨부한 질문 파일대로 한국 AI 글쓰기 첨삭 서비스 25개 이상 조사해 표로 답해 줘" --out-dir /Users/sim-insu/Documents/dev/ssak-v1/docs/research-2026-11-20/kr
~/.claude/bin/research.sh --file /Users/sim-insu/Documents/dev/ssak-v1/docs/research-2026-11-20/q-global.txt "Follow the attached question file: survey 40 or more AI writing feedback products and answer in tables" --out-dir /Users/sim-insu/Documents/dev/ssak-v1/docs/research-2026-11-20/global
ls /Users/sim-insu/Documents/dev/ssak-v1/docs/research-2026-11-20/kr/*.md /Users/sim-insu/Documents/dev/ssak-v1/docs/research-2026-11-20/global/*.md >/dev/null 2>&1 || echo ALL-FAILED
echo RESEARCH-DONE
