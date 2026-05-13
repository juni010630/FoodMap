(function () {
  "use strict";

  var DATA_URL = "data/restaurants.json?v=8";
  var allData = [];
  var clusterGroup;
  var map;
  var areaCenters = {};
  var didInitialFit = false;

  // 카테고리 그룹 — 위쪽이 우선 매칭. category 문자열에 keyword가 포함되면 해당 그룹.
  var CATEGORY_GROUPS = [
    { name: "치킨", keywords: ["치킨", "닭강정"] },
    { name: "술집", keywords: ["주점", "술집", "맥주,호프", "포장마차", "와인", "바(BAR)", "유흥주점", "단란주점", "야식"] },
    { name: "해산물", keywords: ["생선회", "해물", "생선요리", "생선구이", "주꾸미", "아귀", "낙지", "매운탕", "복어", "조개요리", "오징어요리", "굴요리", "전복", "대게", "해산물뷔페", "장어", "게요리"] },
    { name: "분식", keywords: ["종합분식", "분식", "떡볶이", "김밥", "핫도그", "도시락", "주먹밥", "호떡", "빈대떡", "라면"] },
    { name: "일식", keywords: ["일식", "일본식", "이자카야", "초밥", "롤", "우동", "소바", "오뎅", "덮밥", "샤브샤브", "오므라이스", "오니기리", "돈가스", "카레", "라멘"] },
    { name: "중식", keywords: ["중식", "마라", "딤섬", "양꼬치"] },
    { name: "아시아", keywords: ["베트남", "태국", "인도음식", "터키", "아시아음식", "퓨전음식", "중동"] },
    { name: "양식", keywords: ["양식", "이탈리아", "스파게티", "파스타", "피자", "햄버거", "패밀리레스토랑", "스테이크", "프랑스", "스페인음식", "독일", "그리스음식", "멕시코", "남미", "브런치", "샌드위치", "토스트", "후렌치", "푸드코트"] },
    { name: "고기", keywords: ["육류,고기요리", "소고기구이", "돼지고기구이", "곱창,막창,양", "정육식당", "양갈비", "족발,보쌈", "닭요리", "오리요리", "닭발", "닭볶음탕", "찜닭", "불닭"] },
    { name: "한식", keywords: ["한식", "한정식", "백반,가정식", "국밥", "곰탕,설렁탕", "해장국", "추어탕", "감자탕", "백숙,삼계탕", "막국수", "냉면", "두부요리", "찌개,전골", "쌈밥", "보리밥", "사철,영양탕", "갈비탕", "비빔밥", "이북음식", "향토음식", "순대,순댓국", "기사식당", "전,빈대떡", "닭갈비", "칼국수", "국수", "죽", "만두"] },
  ];

  function classifyCategory(catStr) {
    if (!catStr) return "기타";
    for (var i = 0; i < CATEGORY_GROUPS.length; i++) {
      var g = CATEGORY_GROUPS[i];
      for (var j = 0; j < g.keywords.length; j++) {
        if (catStr.indexOf(g.keywords[j]) >= 0) return g.name;
      }
    }
    return "기타";
  }

  function initMap() {
    map = L.map("map", {
      center: [37.5, 127.0],
      zoom: 12,
      zoomControl: true,
      preferCanvas: true,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { attribution: '&copy; CARTO &copy; OSM', maxZoom: 19, subdomains: "abcd" }
    ).addTo(map);

    clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 100,
      disableClusteringAtZoom: 16,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
    });
    map.addLayer(clusterGroup);

    L.control.locate({
      position: "topleft",
      drawCircle: true,
      flyTo: false,
      keepCurrentZoomLevel: false,
      initialZoomLevel: 15,
      strings: { title: "현재 위치로 이동" },
      locateOptions: {
        enableHighAccuracy: false,
        maximumAge: 120000,
        timeout: 5000,
      },
      cacheLocation: true,
    }).addTo(map);
  }

  function getGrade(score) {
    if (score >= 3.0) return { label: "\uAC13\uB9DB\uC9D1", cls: "god", color: "#d32f2f" };
    if (score >= 2.5) return { label: "\uB9DB\uC9D1", cls: "excellent", color: "#e64a19" };
    if (score >= 2.0) return { label: "\uAD1C\uCC2E\uC74C", cls: "good", color: "#388e3c" };
    return { label: "\uC900\uB9DB\uC9D1", cls: "decent", color: "#1976d2" };
  }

  function createIcon(score) {
    var grade = getGrade(score);
    return L.divIcon({
      className: "foodmap-marker-wrapper",
      html: '<div class="foodmap-marker" style="background:' + grade.color + '">' +
        score.toFixed(1) + '</div>',
      iconSize: [44, 26],
      iconAnchor: [22, 13],
    });
  }

  function createPopup(r) {
    var grade = getGrade(r.score);
    var naverUrl = "https://map.naver.com/p/entry/place/" + r.placeId;
    var lowConf = r.foodCount <= 50
      ? '<div class="popup-low-conf">\uC2E0\uB8B0\uB3C4 \uBD80\uC871\uD83D\uDE25</div>'
      : '';

    return '<div class="foodmap-popup">' +
      '<div class="popup-name">' + r.name + '</div>' +
      '<div class="popup-category">' + r.category + '</div>' +
      '<div class="popup-score">' +
        '<span class="score-value">' + r.score.toFixed(2) + '</span>' +
        '<span class="score-label ' + grade.cls + '">' + grade.label + '</span>' +
      '</div>' +
      lowConf +
      '<a class="popup-link" href="' + naverUrl + '">' +
        '\uB124\uC774\uBC84 \uC9C0\uB3C4\uC5D0\uC11C \uBCF4\uAE30</a>' +
      '</div>';
  }

  function renderMarkers(data) {
    clusterGroup.clearLayers();

    var newMarkers = data.map(function (r) {
      return L.marker([r.lat, r.lng], { icon: createIcon(r.score) })
        .bindPopup(createPopup(r), { maxWidth: 260 });
    });
    clusterGroup.addLayers(newMarkers);

    document.getElementById("count-badge").textContent = data.length + "\uAC1C";

    if (!didInitialFit && data.length > 0) {
      map.fitBounds(clusterGroup.getBounds().pad(0.1));
      didInitialFit = true;
    }
  }

  function applyFilters() {
    var scoreVal = parseFloat(document.getElementById("score-filter").value);
    var catVal = document.getElementById("category-filter").value;
    var filtered = allData.filter(function (r) {
      if (r.score < scoreVal) return false;
      if (catVal !== "all" && r._cat !== catVal) return false;
      return true;
    });
    renderMarkers(filtered);
  }

  function jumpToArea() {
    var sel = document.getElementById("area-filter");
    var areaVal = sel.value;
    if (areaVal === "all") return;
    var c = areaCenters[areaVal];
    if (!c) return;
    map.flyTo([c.lat, c.lng], 15, { duration: 1.0 });
    // \uC120\uD0DD \uD6C4 \uAE30\uBCF8\uAC12\uC73C\uB85C \uB418\uB3CC\uB824 \uB2E4\uC74C \uAC19\uC740 \uC9C0\uC5ED\uB3C4 \uB2E4\uC2DC \uB204\uB97C \uC218 \uC788\uAC8C
    sel.value = "all";
  }

  function buildAreaOptions() {
    var sums = {};  // area -> { latSum, lngSum, n }
    allData.forEach(function (r) {
      if (!r.area) return;
      if (!sums[r.area]) sums[r.area] = { latSum: 0, lngSum: 0, n: 0 };
      sums[r.area].latSum += r.lat;
      sums[r.area].lngSum += r.lng;
      sums[r.area].n += 1;
    });
    areaCenters = {};
    Object.keys(sums).forEach(function (a) {
      areaCenters[a] = { lat: sums[a].latSum / sums[a].n, lng: sums[a].lngSum / sums[a].n };
    });

    var select = document.getElementById("area-filter");
    Object.keys(areaCenters).sort().forEach(function (area) {
      var opt = document.createElement("option");
      opt.value = area;
      opt.textContent = area;
      select.appendChild(opt);
    });
  }

  function buildCategoryOptions() {
    var counts = {};
    allData.forEach(function (r) {
      r._cat = classifyCategory(r.category);
      counts[r._cat] = (counts[r._cat] || 0) + 1;
    });
    var select = document.getElementById("category-filter");
    // 정의 순서대로 추가 (사용자가 본 순서대로). 기타는 마지막.
    CATEGORY_GROUPS.forEach(function (g) {
      if (!counts[g.name]) return;
      var opt = document.createElement("option");
      opt.value = g.name;
      opt.textContent = g.name + " (" + counts[g.name].toLocaleString() + ")";
      select.appendChild(opt);
    });
    if (counts["기타"]) {
      var opt = document.createElement("option");
      opt.value = "기타";
      opt.textContent = "기타 (" + counts["기타"].toLocaleString() + ")";
      select.appendChild(opt);
    }
  }

  function loadData() {
    fetch(DATA_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        allData = data;
        buildAreaOptions();
        buildCategoryOptions();
        applyFilters();
      })
      .catch(function () {
        document.getElementById("count-badge").textContent = "No data";
      });
  }

  initMap();
  loadData();
  document.getElementById("area-filter").addEventListener("change", jumpToArea);
  document.getElementById("category-filter").addEventListener("change", applyFilters);
  document.getElementById("score-filter").addEventListener("change", applyFilters);
})();
