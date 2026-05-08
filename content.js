(function () {
  "use strict";

  var BADGE_ID = "foodmap-score-badge";
  var hostname = location.hostname;

  // ============================================================
  //  pcmap.place.naver.com (iframe) - 데이터 수집 + 부모로 전송
  // ============================================================
  if (hostname === "pcmap.place.naver.com" || hostname === "m.place.naver.com") {
    var lastPlaceId = "";

    function getPlaceId() {
      var parts = location.pathname.split("/");
      if (parts.length >= 3 && parts[2]) return parts[2];
      return null;
    }

    function fetchAndSend(placeId) {
      fetch("/place/" + placeId + "/home")
        .then(function (r) { return r.text(); })
        .then(function (html) {
          var idx = html.indexOf("votedKeyword");
          if (idx < 0) return;
          var chunk = html.substring(idx, idx + 5000);
          var tags = [];
          var re = /"displayName":"([^"]+)","count":(\d+)/g;
          var m;
          while ((m = re.exec(chunk)) !== null) {
            tags.push({ name: m[1], count: parseInt(m[2]) });
          }
          if (tags.length >= 2) {
            window.top.postMessage({
              type: "foodmap-data",
              placeId: placeId,
              tags: tags
            }, "*");
          }
        })
        .catch(function () {});
    }

    function run() {
      var id = getPlaceId();
      if (!id || id === lastPlaceId) return;
      lastPlaceId = id;
      fetchAndSend(id);
    }

    var lastUrl = location.href;
    setInterval(function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        run();
      }
    }, 1000);

    run();
    return;
  }

  // ============================================================
  //  map.naver.com (부모 프레임) - 뱃지 렌더링
  // ============================================================
  if (window !== window.top) return;

  var closedPlaceId = null;
  var currentPlaceId = null;

  // ── 점수 계산 ──────────────────────────────────────────
  function calculateScore(tags) {
    if (tags.length < 2) return null;
    tags.sort(function (a, b) { return b.count - a.count; });

    var foodTag = null;
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].name.indexOf("\uB9DB\uC788\uC5B4\uC694") >= 0) {
        foodTag = tags[i]; break;
      }
    }
    if (!foodTag) return null;

    var secondTag = null;
    for (var j = 0; j < tags.length; j++) {
      if (tags[j] !== foodTag) { secondTag = tags[j]; break; }
    }
    if (!secondTag || secondTag.count === 0) return null;

    return {
      ratio: foodTag.count / secondTag.count,
      foodCount: foodTag.count,
      secondName: secondTag.name,
      secondCount: secondTag.count,
      isTopTag: tags[0] === foodTag
    };
  }

  // ── 등급 ───────────────────────────────────────────────
  function getGrade(ratio, isTop) {
    if (!isTop) return { emoji: "\u26A0\uFE0F", label: "\uB9DB 1\uC704 \uC544\uB2D8", cls: "foodmap-warn" };
    if (ratio >= 2.5) return { emoji: "\uD83D\uDD25", label: "\uAC13\uB9DB\uC9D1", cls: "foodmap-god" };
    if (ratio >= 2.0) return { emoji: "\uD83D\uDD25", label: "\uB9DB\uC9D1", cls: "foodmap-excellent" };
    if (ratio >= 1.5) return { emoji: "\uD83D\uDC4D", label: "\uAD1C\uCC2E\uC74C", cls: "foodmap-good" };
    return { emoji: "\uD83D\uDE10", label: "\uBCF4\uD1B5", cls: "foodmap-normal" };
  }

  // ── 뱃지 표시 ──────────────────────────────────────────
  function showBadge(score) {
    var badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = BADGE_ID;
      document.body.appendChild(badge);
      makeDraggable(badge);
    }

    var g = getGrade(score.ratio, score.isTopTag);

    badge.className = "foodmap-badge " + g.cls;
    badge.innerHTML =
      '<div class="foodmap-close">\u00D7</div>' +
      '<div class="foodmap-header">' +
        '<span class="foodmap-emoji">' + g.emoji + '</span>' +
        '<span class="foodmap-label">' + g.label + '</span>' +
        '<span class="foodmap-ratio">' + score.ratio.toFixed(2) + '</span>' +
      '</div>' +
      '<div class="foodmap-detail">' +
        '\uB9DB\uC788\uC5B4\uC694 ' + score.foodCount +
        ' \u00F7 ' + score.secondName + ' ' + score.secondCount +
      '</div>';
    badge.style.display = "flex";

    badge.querySelector(".foodmap-close").onclick = function (e) {
      e.stopPropagation();
      badge.style.display = "none";
      closedPlaceId = currentPlaceId;
    };
  }

  function hideBadge() {
    var badge = document.getElementById(BADGE_ID);
    if (badge) badge.style.display = "none";
  }

  // ── 드래그 ─────────────────────────────────────────────
  function makeDraggable(el) {
    var dragging = false, sx, sy, ox, oy;

    el.addEventListener("mousedown", function (e) {
      if (e.target.classList.contains("foodmap-close")) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      el.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      el.style.left = ox + e.clientX - sx + "px";
      el.style.top = oy + e.clientY - sy + "px";
      el.style.right = "auto";
    });

    document.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = "grab";
    });
  }

  // ── 메시지 수신 (iframe → 부모) ────────────────────────
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "foodmap-data") return;

    var placeId = e.data.placeId;
    var tags = e.data.tags;

    // 다른 가게로 이동하면 closed 상태 리셋
    if (placeId !== currentPlaceId) {
      currentPlaceId = placeId;
      closedPlaceId = null;
    }

    // 유저가 닫은 가게면 표시 안 함
    if (placeId === closedPlaceId) return;

    var score = calculateScore(tags);
    if (!score) { hideBadge(); return; }
    showBadge(score);
  });
})();
