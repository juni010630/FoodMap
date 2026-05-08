(function () {
  "use strict";

  var DATA_URL = "../data/restaurants.json";
  var allData = [];
  var markers = [];
  var map;

  function initMap() {
    map = L.map("map", { center: [37.5, 127.0], zoom: 12, zoomControl: true });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      { attribution: '&copy; CARTO &copy; OSM', maxZoom: 19, subdomains: "abcd" }
    ).addTo(map);
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
      '<a class="popup-link" href="' + naverUrl + '" target="_blank">' +
        '\uB124\uC774\uBC84 \uC9C0\uB3C4\uC5D0\uC11C \uBCF4\uAE30</a>' +
      '</div>';
  }

  function renderMarkers(data) {
    markers.forEach(function (m) { map.removeLayer(m); });
    markers = [];

    data.forEach(function (r) {
      var marker = L.marker([r.lat, r.lng], { icon: createIcon(r.score) })
        .bindPopup(createPopup(r), { maxWidth: 260 })
        .addTo(map);
      markers.push(marker);
    });

    document.getElementById("count-badge").textContent = data.length + "\uAC1C";

    if (data.length > 0) {
      map.fitBounds(L.featureGroup(markers).getBounds().pad(0.1));
    }
  }

  function applyFilters() {
    var areaVal = document.getElementById("area-filter").value;
    var scoreVal = parseFloat(document.getElementById("score-filter").value);

    var filtered = allData.filter(function (r) {
      if (areaVal !== "all" && r.area !== areaVal) return false;
      if (r.score < scoreVal) return false;
      return true;
    });

    renderMarkers(filtered);
  }

  function buildAreaOptions() {
    var areas = {};
    allData.forEach(function (r) { if (r.area) areas[r.area] = true; });
    var select = document.getElementById("area-filter");
    Object.keys(areas).sort().forEach(function (area) {
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
        applyFilters();
      })
      .catch(function () {
        document.getElementById("count-badge").textContent = "No data";
      });
  }

  initMap();
  loadData();
  document.getElementById("area-filter").addEventListener("change", applyFilters);
  document.getElementById("score-filter").addEventListener("change", applyFilters);
})();
