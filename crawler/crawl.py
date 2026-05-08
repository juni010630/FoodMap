"""
FoodMap 크롤러
네이버 지도에서 음식점 검색 → 리뷰 태그 파싱 → 맛집 점수 계산 → JSON 저장
"""
import requests
import re
import json
import time
import sys
import os
from config import (
    MIN_SCORE, SEARCH_DELAY, DETAIL_DELAY,
    EXCLUDE_CATEGORIES, FOOD_TAG_CODE, HTTP_HEADERS,
    TEST_AREAS, METRO_AREAS,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def search_restaurants(area):
    """특정 지역의 음식점 목록 검색 → (id, name, category, lat, lng) 리스트"""
    url = "https://pcmap.place.naver.com/restaurant/list"
    params = {
        "query": f"{area['name']} 음식점",
        "x": area["x"],
        "y": area["y"],
        "clientX": area["x"],
        "clientY": area["y"],
    }

    try:
        r = requests.get(url, params=params, headers=HTTP_HEADERS, timeout=15)
        r.encoding = "utf-8"
        if r.status_code != 200:
            print(f"  [!] search failed: HTTP {r.status_code}")
            return []
    except Exception as e:
        print(f"  [!] search error: {e}")
        return []

    html = r.content.decode("utf-8", errors="replace")
    ids = set(re.findall(r'"id":"(\d{6,})"', html))
    restaurants = []

    for pid in ids:
        idx = html.find(f'"id":"{pid}"')
        if idx < 0:
            continue

        ctx = html[max(0, idx - 100):idx + 600]
        nm = re.search(r'"name":"([^"]+)"', ctx)
        cat = re.search(r'"category":"([^"]+)"', ctx)
        lat = re.search(r'"y":"([\d.]+)"', ctx)
        lng = re.search(r'"x":"([\d.]+)"', ctx)

        name = nm.group(1) if nm else None
        category = cat.group(1) if cat else ""
        if not name or not lat or not lng:
            continue

        # 카페/디저트 제외
        if any(exc in category for exc in EXCLUDE_CATEGORIES):
            continue

        restaurants.append({
            "id": pid,
            "name": name,
            "category": category,
            "lat": float(lat.group(1)),
            "lng": float(lng.group(1)),
        })

    return restaurants


def fetch_score(place_id):
    """음식점 상세 페이지에서 맛집 점수 계산"""
    url = f"https://pcmap.place.naver.com/place/{place_id}/home"

    try:
        r = requests.get(url, headers=HTTP_HEADERS, timeout=10)
        if r.status_code != 200:
            return None
    except Exception:
        return None

    html = r.content.decode("utf-8", errors="replace")
    idx = html.find("votedKeyword")
    if idx < 0:
        return None

    chunk = html[idx:idx + 5000]

    # code + displayName + count 추출
    tags = []
    for m in re.finditer(
        r'"code":"([^"]+)"[^}]*?"displayName":"([^"]+)","count":(\d+)', chunk
    ):
        tags.append({
            "code": m.group(1),
            "name": m.group(2),
            "count": int(m.group(3)),
        })

    if len(tags) < 2:
        return None

    # "음식이 맛있어요" (code: food_good) 찾기
    food_tag = next((t for t in tags if t["code"] == FOOD_TAG_CODE), None)
    if not food_tag:
        return None

    # 2위 태그 (food_good 제외 최다)
    others = sorted(
        [t for t in tags if t["code"] != FOOD_TAG_CODE],
        key=lambda t: t["count"],
        reverse=True,
    )
    if not others or others[0]["count"] == 0:
        return None

    second = others[0]
    ratio = food_tag["count"] / second["count"]

    return {
        "score": round(ratio, 2),
        "foodCount": food_tag["count"],
        "secondTag": second["name"],
        "secondCount": second["count"],
        "totalTags": len(tags),
    }


def crawl(areas, output_file="restaurants.json"):
    """메인 크롤링 파이프라인"""
    os.makedirs(DATA_DIR, exist_ok=True)
    output_path = os.path.join(DATA_DIR, output_file)

    all_results = []
    seen_ids = set()
    total_searched = 0
    total_scored = 0

    for area in areas:
        print(f"\n[*] {area['name']} 검색 중...")
        restaurants = search_restaurants(area)
        new = [r for r in restaurants if r["id"] not in seen_ids]
        seen_ids.update(r["id"] for r in restaurants)
        print(f"  검색 결과: {len(restaurants)}개 (신규: {len(new)}개)")
        total_searched += len(new)

        time.sleep(SEARCH_DELAY)

        for i, rest in enumerate(new):
            print(f"  [{i+1}/{len(new)}] {rest['name']} ({rest['category']})...", end=" ")

            score_data = fetch_score(rest["id"])
            if not score_data:
                print("skip (no food tag)")
                time.sleep(DETAIL_DELAY)
                continue

            total_scored += 1

            if score_data["score"] < MIN_SCORE:
                print(f"score={score_data['score']:.2f} (below {MIN_SCORE})")
                time.sleep(DETAIL_DELAY)
                continue

            result = {
                "placeId": rest["id"],
                "name": rest["name"],
                "category": rest["category"],
                "lat": rest["lat"],
                "lng": rest["lng"],
                "score": score_data["score"],
                "foodCount": score_data["foodCount"],
                "secondTag": score_data["secondTag"],
                "secondCount": score_data["secondCount"],
                "area": area["name"],
            }
            all_results.append(result)
            print(f"score={score_data['score']:.2f} *** PASS ***")

            time.sleep(DETAIL_DELAY)

    # 점수 순 정렬
    all_results.sort(key=lambda r: r["score"], reverse=True)

    # JSON 저장
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"검색: {total_searched}개")
    print(f"점수 계산 가능: {total_scored}개")
    print(f"2.0+ 맛집: {len(all_results)}개")
    print(f"저장: {output_path}")

    return all_results


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"

    if mode == "test":
        print("=== 테스트 모드 (강남역) ===")
        crawl(TEST_AREAS)
    elif mode == "metro":
        print("=== 수도권 모드 ===")
        crawl(METRO_AREAS)
    else:
        print(f"Usage: python crawl.py [test|metro]")
