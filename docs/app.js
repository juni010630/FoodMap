(function () {
  "use strict";

  var DATA_URL = "data/restaurants.json?v=6";
  var allData = [];
  var clusterGroup;
  var map;
  var areaCenters = {};
  var didInitialFit = false;

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

  function applyScoreFilter() {
    var scoreVal = parseFloat(document.getElementById("score-filter").value);
    var filtered = allData.filter(function (r) { return r.score >= scoreVal; });
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

  function loadData() {
    fetch(DATA_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        allData = data;
        buildAreaOptions();
        applyScoreFilter();
      })
      .catch(function () {
        document.getElementById("count-badge").textContent = "No data";
      });
  }

  initMap();
  loadData();
  document.getElementById("area-filter").addEventListener("change", jumpToArea);
  document.getElementById("score-filter").addEventListener("change", applyScoreFilter);
})();
