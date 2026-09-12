#!/bin/zsh
# 📍 전국 장소 원본 받기(OpenStreetMap Overpass) → build-places.mjs 입력.
#   실행: scripts/data/fetch-places.sh <출력디렉터리>   (덤프 43MB는 커밋하지 않는다)
#   비용 0(무료 공개 API, 키 없음). 갱신은 지역 확장·대형 시설 개장 때 수동으로.
set -e
OUT=${1:?사용법: fetch-places.sh <출력디렉터리>}
mkdir -p "$OUT"
read -r -d '' Q <<'QQ' || true
[out:json][timeout:900];
area["ISO3166-1"="KR"][admin_level=2]->.kr;
(
  nwr["shop"~"^(department_store|mall)$"]["name"](area.kr);
  nwr["amenity"~"^(university|college|hospital|townhall|courthouse|theatre|cinema|library|marketplace|bus_station)$"]["name"](area.kr);
  nwr["tourism"~"^(museum|zoo|theme_park|aquarium|attraction|hotel|resort)$"]["name"](area.kr);
  nwr["leisure"~"^(stadium|sports_centre|water_park|park)$"]["name"](area.kr);
  nwr["aeroway"="aerodrome"]["name"](area.kr);
  nwr["office"="government"]["name"](area.kr);
  nwr["landuse"="residential"]["residential"="apartments"]["name"](area.kr);
  nwr["building"="apartments"]["name"](area.kr);
);
out center tags;
QQ
curl -s -m 900 --data-urlencode "data=$Q" https://overpass-api.de/api/interpreter -o "$OUT/ov-places.json"
echo "완료 $(du -h "$OUT/ov-places.json" | cut -f1) → node scripts/data/build-places.mjs $OUT"
