#!/bin/zsh
# 🚇 전국 철도 원본 받기(OpenStreetMap Overpass) → build-rail.mjs 입력.
#   실행: scripts/data/fetch-rail.sh <출력디렉터리>   (임시 디렉터리 권장 — 덤프 40MB는 커밋하지 않는다)
#   갱신 주기: 지역을 새로 열 때 + 신규 노선 개통 시. 비용 0(무료 공개 API, 키 없음).
set -e
OUT=${1:?사용법: fetch-rail.sh <출력디렉터리>}
mkdir -p "$OUT"
q() { curl -s -m 900 --data-urlencode "data=$1" https://overpass-api.de/api/interpreter -o "$OUT/$2"; echo "  $2 $(du -h "$OUT/$2" | cut -f1)"; }
echo "① 역(railway=station|halt)"
q '[out:json][timeout:300];area["ISO3166-1"="KR"][admin_level=2]->.kr;(nwr["railway"="station"](area.kr);nwr["railway"="halt"](area.kr););out center tags;' ov-stations.json
echo "② 노선 관계(도시철도·광역전철·열차) — 색·이름·정차역"
for T in subway light_rail monorail tram train; do
  q "[out:json][timeout:900];area[\"ISO3166-1\"=\"KR\"][admin_level=2]->.kr;relation[\"type\"=\"route\"][\"route\"=\"$T\"](area.kr);out body geom;" "geom-$T.json"
done
echo "③ 물리 선로(국가철도 전 노선) — 관계가 없는 중앙선·영동선 등을 메운다"
q '[out:json][timeout:900];area["ISO3166-1"="KR"][admin_level=2]->.kr;way["railway"="rail"]["usage"~"^(main|branch)$"]["name"](area.kr);out geom;' track.json
echo "완료 → node scripts/data/build-rail.mjs $OUT"
