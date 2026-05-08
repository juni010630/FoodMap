"""크롤링 설정"""

# 최소 점수 (음식이 맛있어요 / 2위 태그)
MIN_SCORE = 1.75

# 신뢰도 부족 기준 (foodCount 이하면 표시)
LOW_CONFIDENCE_THRESHOLD = 50

# 요청 간 딜레이 (초)
SEARCH_DELAY = 2.0
DETAIL_DELAY = 1.0

# 카페/디저트 카테고리 제외 키워드
EXCLUDE_CATEGORIES = [
    "카페", "디저트", "베이커리", "제과", "빵",
    "아이스크림", "케이크", "초콜릿", "도넛",
]

# 리뷰 태그 코드 (음식이 맛있어요)
FOOD_TAG_CODE = "food_good"

# 테스트 지역 (강남역 주변)
TEST_AREAS = [
    {"name": "강남역", "x": "127.0276", "y": "37.4979"},
]

# 수도권 주요 지역 (Phase 3에서 사용)
METRO_AREAS = [
    # 서울
    {"name": "강남", "x": "127.0276", "y": "37.4979"},
    {"name": "홍대", "x": "126.9246", "y": "37.5563"},
    {"name": "종로", "x": "126.9780", "y": "37.5700"},
    {"name": "이태원", "x": "126.9946", "y": "37.5340"},
    {"name": "신촌", "x": "126.9368", "y": "37.5551"},
    {"name": "잠실", "x": "127.1003", "y": "37.5133"},
    {"name": "여의도", "x": "126.9249", "y": "37.5219"},
    {"name": "마포", "x": "126.9088", "y": "37.5536"},
    {"name": "성수", "x": "127.0558", "y": "37.5445"},
    {"name": "건대", "x": "127.0688", "y": "37.5403"},
    # 경기/인천
    {"name": "분당", "x": "127.1283", "y": "37.3780"},
    {"name": "수원", "x": "127.0090", "y": "37.2636"},
    {"name": "일산", "x": "126.7717", "y": "37.6580"},
    {"name": "인천 부평", "x": "126.7230", "y": "37.5073"},
    {"name": "청라", "x": "126.6441", "y": "37.5327"},
]

HTTP_HEADERS = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "referer": "https://map.naver.com/",
}
