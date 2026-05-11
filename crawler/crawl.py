"""
FoodMap 크롤러
네이버 지도에서 음식점 검색 → 리뷰 태그 파싱 → 맛집 점수 계산 → JSON 저장

사용법:
  python crawl.py test     # 강남역 테스트
  python crawl.py metro    # 수도권 전체
  python crawl.py resume   # 중단된 크롤링 이어하기
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
    TEST_AREAS, METRO_AREAS, NATIONAL_AREAS, SEARCH_TERMS,
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
PROGRESS_FILE = os.path.join(DATA_DIR, "_progress.json")
RESULT_FILE = os.path.join(DATA_DIR, "restaurants.json")


def load_progress():
    """중단된 진행 상태 불러오기"""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_progress(state):
    """진행 상태 저장 (중간 저장)"""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def clear_progress():
    """완료 후 진행 파일 삭제"""
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)


def save_results(results):
    """결과 JSON 저장"""
    os.makedirs(DATA_DIR, exist_ok=True)
    sorted_results = sorted(results, key=lambda r: r["score"], reverse=True)
    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted_results, f, ensure_ascii=False, indent=2)
    # GitHub Pages용 docs/data에도 복사
    docs_data = os.path.join(DATA_DIR, "..", "docs", "data")
    if os.path.isdir(docs_data):
        with open(os.path.join(docs_data, "restaurants.json"), "w", encoding="utf-8") as f:
            json.dump(sorted_results, f, ensure_ascii=False, indent=2)


def _search_one(area, term):
    """단일 검색어로 한 번 호출. 결과 음식점 리스트 반환 (오류면 빈 리스트)."""
    url = "https://pcmap.place.naver.com/restaurant/list"
    params = {
        "query": f"{area['name']} {term}",
        "x": area["x"],
        "y": area["y"],
        "clientX": area["x"],
        "clientY": area["y"],
    }

    try:
        r = requests.get(url, params=params, headers=HTTP_HEADERS, timeout=15)
        if r.status_code == 429:
            print(f"  [!] 429 차단됨 ({term}). 30초 대기 후 재시도...")
            time.sleep(30)
            r = requests.get(url, params=params, headers=HTTP_HEADERS, timeout=15)
        if r.status_code != 200:
            print(f"  [!] search failed ({term}): HTTP {r.status_code}")
            return []
    except Exception as e:
        print(f"  [!] search error ({term}): {e}")
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


def search_restaurants(area):
    """특정 지역에서 SEARCH_TERMS 전체로 검색해 dedup된 음식점 리스트 반환."""
    merged = {}  # id -> data
    for term in SEARCH_TERMS:
        results = _search_one(area, term)
        added = 0
        for r in results:
            if r["id"] not in merged:
                merged[r["id"]] = r
                added += 1
        print(f"    [{term}] {len(results)}개 (신규 +{added})")
        time.sleep(SEARCH_DELAY)
    return list(merged.values())


def fetch_score(place_id):
    """음식점 상세 페이지에서 맛집 점수 계산"""
    url = f"https://pcmap.place.naver.com/place/{place_id}/home"

    try:
        r = requests.get(url, headers=HTTP_HEADERS, timeout=10)
        if r.status_code == 429:
            print("429! 30초 대기...", end=" ")
            time.sleep(30)
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

    food_tag = next((t for t in tags if t["code"] == FOOD_TAG_CODE), None)
    if not food_tag:
        return None

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
    }


def crawl(areas, mode_name="metro", resume_state=None):
    """메인 크롤링 파이프라인 (중간 저장 + 이어하기 지원)"""
    os.makedirs(DATA_DIR, exist_ok=True)

    # 이어하기: 이전 상태 복원
    if resume_state:
        all_results = resume_state["results"]
        seen_ids = set(resume_state["seen_ids"])
        start_area_idx = resume_state["area_idx"]
        start_rest_idx = resume_state["rest_idx"]
        pending = resume_state.get("pending", [])
        print(f"[*] 이어하기: {len(all_results)}개 수집됨, area#{start_area_idx}부터 재개")
    else:
        # 기존 restaurants.json이 있으면 불러와서 dedup용으로 활용
        all_results = []
        seen_ids = set()
        if os.path.exists(RESULT_FILE):
            try:
                with open(RESULT_FILE, "r", encoding="utf-8") as f:
                    all_results = json.load(f)
                seen_ids = {r["placeId"] for r in all_results}
                print(f"[*] 기존 결과 불러옴: {len(all_results)}개 (dedup용)")
            except Exception as e:
                print(f"[!] 기존 결과 로드 실패: {e}")
                all_results = []
                seen_ids = set()
        start_area_idx = 0
        start_rest_idx = 0
        pending = []

    total_searched = len(seen_ids)
    total_scored = 0

    for area_idx in range(start_area_idx, len(areas)):
        area = areas[area_idx]
        print(f"\n[*] {area['name']} 검색 중... ({area_idx + 1}/{len(areas)})")

        # 이어하기 시 이미 검색한 지역은 pending 사용
        if area_idx == start_area_idx and pending:
            new = pending
            print(f"  이어하기: {len(new)}개 남은 음식점")
        else:
            restaurants = search_restaurants(area)
            new = [r for r in restaurants if r["id"] not in seen_ids]
            seen_ids.update(r["id"] for r in restaurants)
            print(f"  검색 결과: {len(restaurants)}개 (신규: {len(new)}개)")
            total_searched += len(new)
            start_rest_idx = 0

        for i in range(start_rest_idx, len(new)):
            rest = new[i]
            print(f"  [{i + 1}/{len(new)}] {rest['name']} ({rest['category']})...", end=" ")

            score_data = fetch_score(rest["id"])
            if not score_data:
                print("skip")
                time.sleep(DETAIL_DELAY)
                continue

            total_scored += 1

            if score_data["score"] < MIN_SCORE:
                print(f"{score_data['score']:.2f}")
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
            print(f"{score_data['score']:.2f} *** PASS ***")

            # 10개마다 중간 저장
            if len(all_results) % 10 == 0:
                save_progress({
                    "results": all_results,
                    "seen_ids": list(seen_ids),
                    "area_idx": area_idx,
                    "rest_idx": i + 1,
                    "pending": new,
                    "areas_mode": mode_name,
                })
                save_results(all_results)
                print(f"  [+] 중간 저장 ({len(all_results)}개)")

            time.sleep(DETAIL_DELAY)

        # 지역 완료 후 저장
        save_progress({
            "results": all_results,
            "seen_ids": list(seen_ids),
            "area_idx": area_idx + 1,
            "rest_idx": 0,
            "pending": [],
            "areas_mode": "metro" if len(areas) > 3 else "test",
        })
        save_results(all_results)
        start_rest_idx = 0

    # 완료
    save_results(all_results)
    clear_progress()

    print(f"\n{'=' * 50}")
    print(f"검색: {total_searched}개")
    print(f"1.75+ 맛집: {len(all_results)}개")
    print(f"저장: {RESULT_FILE}")

    return all_results


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"

    MODE_AREAS = {
        "test": TEST_AREAS,
        "metro": METRO_AREAS,
        "national": NATIONAL_AREAS,
    }

    if mode == "resume":
        state = load_progress()
        if not state:
            print("이어할 진행 상태가 없습니다.")
            sys.exit(1)
        saved_mode = state.get("areas_mode", "test")
        areas = MODE_AREAS.get(saved_mode, TEST_AREAS)
        print(f"=== 이어하기 모드 ({saved_mode}) ===")
        crawl(areas, mode_name=saved_mode, resume_state=state)
    elif mode in MODE_AREAS:
        label = {"test": "테스트 (강남역)", "metro": "수도권", "national": "전국 (수도권 제외)"}[mode]
        print(f"=== {label} 모드 ===")
        crawl(MODE_AREAS[mode], mode_name=mode)
    else:
        print("Usage: python crawl.py [test|metro|national|resume]")
