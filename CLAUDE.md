# FoodMap 프로젝트 컨텍스트

## 프로젝트 개요
네이버 지도 방문자 리뷰 태그 비율로 맛집을 점수화하는 서비스.
"음식이 맛있어요" / 2위 태그 비율이 높을수록 맛에 특화된 맛집.

## 핵심 지표
- **맛집 점수** = "음식이 맛있어요" count / 2위 태그 count
- 예: 696 / 305 = 2.28 → 맛집
- 수집 기준: 1.75 이상
- foodCount <= 50이면 "신뢰도 부족" 마크 표시

## 프로젝트 구조
```
FoodMap/
├── crawler/              # Python 크롤러
│   ├── crawl.py          # 메인 (test/metro/resume 모드)
│   ├── config.py         # 지역 좌표, 딜레이, 필터 설정
│   └── requirements.txt  # requests
├── data/
│   ├── restaurants.json  # 크롤링 결과
│   └── _progress.json    # 중간 저장 (자동 생성/삭제)
├── docs/                 # GitHub Pages (정적 웹)
│   ├── index.html        # Leaflet + CartoDB Voyager 타일
│   ├── app.js            # 지도 렌더링, 마커, 팝업, 필터
│   ├── style.css
│   └── data/
│       └── restaurants.json  # docs용 복사본 (crawl.py가 자동 복사)
├── extension/            # 크롬 확장프로그램 (v1)
│   ├── manifest.json     # Manifest V3
│   ├── content.js        # pcmap iframe에서 fetch → 부모 프레임에 postMessage
│   ├── styles.css
│   └── popup.html
└── CLAUDE.md
```

## 크롤링 파이프라인

### 데이터 소스
네이버 지도 HTML에 Apollo GraphQL 캐시가 내장되어 있음.
`pcmap.place.naver.com/place/{id}/home` fetch → `votedKeyword` 섹션 파싱.

### 핵심 파싱 로직
```python
# HTML에서 votedKeyword 찾기
idx = html.find("votedKeyword")
chunk = html[idx:idx+5000]

# code + displayName + count 추출
re.finditer(r'"code":"([^"]+)"[^}]*?"displayName":"([^"]+)","count":(\d+)', chunk)

# "음식이 맛있어요" = code: "food_good"
```

### 음식점 검색
`pcmap.place.naver.com/restaurant/list?query={지역} 음식점&x={lng}&y={lat}`
→ HTML에서 `"id":"(\d{6,})"` 패턴으로 place ID 추출
→ 주변 컨텍스트에서 name, category, lat, lng 추출

### 인코딩 주의
`r.content.decode("utf-8", errors="replace")` 필수.
`r.text` 사용하면 Latin-1로 오감지되어 한글 깨짐.

### 429 대응
네이버가 자동화 요청 차단함. 현재 대응:
- 요청 간 1초 딜레이 (DETAIL_DELAY)
- 429 응답 시 30초 대기 후 재시도
- 10개 수집마다 중간 저장 → `python crawl.py resume`으로 이어하기

## 크롤러 사용법
```bash
cd crawler
pip install -r requirements.txt
python crawl.py test      # 강남역 테스트
python crawl.py metro     # 수도권 전체 (146개 지역, 서울/인천/경기)
python crawl.py national  # 전국 광역시·도청소재지·주요도시 (101개, 수도권 제외)
python crawl.py resume    # 중단된 크롤링 이어하기
```

기존 restaurants.json이 있으면 자동으로 placeId dedup. 한 번에 모드를 바꿔
실행해도 결과는 누적됨 (`metro` → `national` 이어 실행 가능).

## 웹 지도
- Leaflet + CartoDB Voyager 타일 (무료, API 키 불필요)
- 마커: 점수별 색상 (빨강=갓맛집3.0+, 주황=맛집2.5+, 초록=괜찮음2.0+, 파랑=준맛집1.75+)
- 팝업: 가게명, 카테고리, 점수, 등급, 네이버 지도 링크
- foodCount <= 50이면 "신뢰도 부족😥" 표시
- 필터: 지역별, 점수별

## 배포
- GitHub Pages: https://juni010630.github.io/FoodMap/
- `docs/` 폴더 기준 배포
- 크롤링 후 `git push`만 하면 자동 반영

## 크롬 확장프로그램 (v1)
네이버 지도에서 개별 음식점 볼 때 실시간 맛집 점수 표시.
- pcmap.place.naver.com iframe에서 HTML fetch → votedKeyword 파싱
- window.top.postMessage로 부모 프레임(map.naver.com)에 점수 전달
- 부모 프레임에서 뱃지 렌더링 (iframe 밖에 표시)
- X 클릭 시 closedPlaceId 기억, 다른 가게 이동하면 리셋

## 남은 작업
1. 수도권 전체 크롤링 실행 (python crawl.py metro)
2. config.py의 METRO_AREAS 지역 확대 (현재 15개, 더 촘촘하게)
3. 크롤링 완료 후 git push → 사이트 반영
4. PWA (manifest.json + service worker) 추가 → 모바일 홈화면 설치
