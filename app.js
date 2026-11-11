// ==========================================================================
// あさタクシー 営業先エリアマップ アプリケーションロジック (2026年11月度 進捗＆残り可視化版)
// ==========================================================================

// 定数定義
const OFFICE_COORDS = [34.484222, 132.458191]; // 安東営業所 (広島市安佐南区安東5丁目7-9)
const CATEGORY_COLORS = {
    "居宅": "#0284c7",       // スカイブルー
    "施設": "#10b981",       // エメラルドグリーン
    "病院": "#ef4444",       // クリムゾンレッド
    "障害・包括": "#8b5cf6", // パープル
    "その他": "#64748b"      // スレートグレー
};

// 状態管理
let currentFilters = {
    category: "all",
    status: "all",
    distance: "all",
    search: ""
};

let currentSort = "unvisited_first";
let markers = [];
let officeMarker = null;
let userLocationMarker = null;
let markerLayer = L.layerGroup();

// 地図の初期化
const map = L.map('map', {
    zoomControl: false // スマホで邪魔になりにくくするため右下に配置
}).setView(OFFICE_COORDS, 13);

// ズームコントロールを右上に配置（下部HUD・FABと重ならないように）
L.control.zoom({ position: 'topright' }).addTo(map);

// タイルレイヤー
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

markerLayer.addTo(map);

// ==========================================================================
// アイコン生成関数
// ==========================================================================

// 営業所ピン (ゴールド/タクシー)
function createOfficeIcon() {
    const html = `
    <div class="custom-pin-wrapper office-pin" style="width:36px;height:46px;">
        <svg viewBox="0 0 36 46" width="36" height="46" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35));">
            <path fill="#f59e0b" stroke="#ffffff" stroke-width="2.5" d="M18 2C9.163 2 2 9.163 2 18c0 11.8 16 26 16 26s16-14.2 16-26c0-8.837-7.163-16-16-16z"/>
            <circle fill="#ffffff" cx="18" cy="18" r="10"/>
            <text x="18" y="22" font-size="12" text-anchor="middle" font-weight="bold" fill="#0f172a">🚖</text>
        </svg>
        <div class="pin-shadow" style="width:20px;"></div>
    </div>`;
    return L.divIcon({
        html: html,
        className: 'office-leaflet-marker',
        iconSize: [36, 46],
        iconAnchor: [18, 46],
        popupAnchor: [0, -42]
    });
}

// 営業先マーカーピン
function createPinIcon(category, isVisited) {
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS["その他"];
    const ringHtml = isVisited ? '' : '<div class="pin-unvisited-ring"></div>';
    
    // 訪問済は少し控えめな透明度にして「残り（未接触）」がすぐマップ上で際立つように工夫
    const opacityStyle = isVisited ? 'opacity: 0.72;' : 'opacity: 1;';

    // 訪問済はチェックマーク、未接触（残り）は目立つオレンジドット
    const symbol = isVisited 
        ? `<circle fill="#ffffff" cx="16" cy="15" r="6"/><path d="M13.5 15l2 2 3.5-3.5" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<circle fill="#ffffff" cx="16" cy="15" r="6"/><circle fill="#ea580c" cx="16" cy="15" r="3.5"/>`;

    const svg = `
    <div class="custom-pin-wrapper" style="width:32px;height:42px;${opacityStyle}">
        ${ringHtml}
        <svg viewBox="0 0 32 42" width="32" height="42" style="filter: drop-shadow(0 3px 5px rgba(0,0,0,0.3));">
            <path fill="${color}" stroke="#ffffff" stroke-width="2" d="M16 2C8.268 2 2 8.268 2 16c0 10.5 14 24 14 24s14-13.5 14-24c0-7.732-6.268-14-14-14z"/>
            ${symbol}
        </svg>
        <div class="pin-shadow"></div>
    </div>`;

    return L.divIcon({
        html: svg,
        className: 'custom-leaflet-marker',
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -38]
    });
}

// ==========================================================================
// ポップアップ HTML 構築
// ==========================================================================
function buildPopupContent(item) {
    const color = CATEGORY_COLORS[item.category] || CATEGORY_COLORS["その他"];
    const isVisited = item.status === "訪問済";
    const statusText = isVisited ? `✔ 11月訪問済 (${item.latest_visit || "日付確認"})` : `🔥 11月未接触（残り対象）`;
    const statusClass = isVisited ? "visited" : "unvisited";
    
    const distText = (item.distance !== null && item.distance !== undefined) 
        ? `安東営業所から ${item.distance} km` 
        : "";

    // Google Maps ナビ URL
    const destQuery = encodeURIComponent(item.address ? `${item.address} ${item.name}` : item.name);
    const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${destQuery}`;

    // 電話番号リンク
    const phoneBtn = item.phone 
        ? `<a href="tel:${item.phone}" class="btn-action btn-call">📞 電話をかける</a>` 
        : `<button class="btn-action btn-call" style="opacity:0.5;cursor:not-allowed;" disabled>📞 電話なし</button>`;

    return `
    <div class="popup-card">
        <div class="popup-header" style="background-color: ${color}">
            <div class="popup-top-row">
                <span class="popup-category-badge">${item.category}${item.sub_category ? ` (${item.sub_category})` : ''}</span>
                ${distText ? `<span class="popup-distance-badge">📍 ${distText}</span>` : ''}
            </div>
            <h4 class="popup-title">${item.name}</h4>
        </div>
        <div class="popup-body">
            <div class="popup-status-banner ${statusClass}">
                ${statusText}
            </div>
            <div class="popup-meta-list">
                <div class="meta-row">
                    <span class="meta-label">住所:</span>
                    <span class="meta-value">${item.address || "未登録"}</span>
                </div>
                ${item.phone ? `
                <div class="meta-row">
                    <span class="meta-label">電話:</span>
                    <span class="meta-value"><a href="tel:${item.phone}" style="color:#0284c7;font-weight:600;">${item.phone}</a></span>
                </div>` : ''}
                ${item.contact_person ? `
                <div class="meta-row">
                    <span class="meta-label">担当者:</span>
                    <span class="meta-value">${item.contact_person}</span>
                </div>` : ''}
                ${item.corp ? `
                <div class="meta-row">
                    <span class="meta-label">法人名:</span>
                    <span class="meta-value">${item.corp}</span>
                </div>` : ''}
                ${item.latest_visit ? `
                <div class="meta-row">
                    <span class="meta-label">前回訪問:</span>
                    <span class="meta-value">${item.latest_visit}</span>
                </div>` : ''}
                ${item.first_visit ? `
                <div class="meta-row">
                    <span class="meta-label">初回訪問:</span>
                    <span class="meta-value">${item.first_visit}</span>
                </div>` : ''}
                ${item.note ? `
                <div class="meta-row" style="margin-top:4px;padding-top:4px;border-top:1px dashed #e2e8f0;">
                    <span class="meta-label">メモ:</span>
                    <span class="meta-value" style="font-size:0.78rem;color:#475569;">${item.note}</span>
                </div>` : ''}
            </div>
            <div class="popup-actions">
                ${phoneBtn}
                <a href="${gmapsNavUrl}" target="_blank" rel="noopener noreferrer" class="btn-action btn-nav">🗺️ ここへナビ</a>
            </div>
        </div>
    </div>`;
}

// ==========================================================================
// データのプロットとバッジ初期化
// ==========================================================================
async function initApp() {
    let data = window.mapData;
    if (!data && typeof mapData !== 'undefined') {
        data = mapData;
    }
    
    // もしグローバルに無ければ fetch で取得を試みる
    if (!data || !Array.isArray(data) || data.length === 0) {
        try {
            const resp = await fetch('map_data.json');
            if (resp.ok) {
                data = await resp.json();
            }
        } catch (e) {
            console.warn("fetch fallback failed:", e);
        }
    }

    if (!data || !Array.isArray(data)) {
        console.error("mapData が読み込まれていません");
        return;
    }
    window.mapData = data;

    // 1. 安東営業所ピンの設置
    officeMarker = L.marker(OFFICE_COORDS, {
        icon: createOfficeIcon(),
        zIndexOffset: 1000
    }).addTo(map);

    officeMarker.bindPopup(`
        <div style="padding:10px;text-align:center;">
            <h4 style="margin:0 0 6px 0;font-size:1.05rem;">🚖 あさタクシー 安東営業所</h4>
            <p style="margin:0 0 6px 0;font-size:0.85rem;color:#475569;">広島市安佐南区安東5丁目7-9</p>
            <span style="font-size:0.75rem;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-weight:600;">営業拠点・基準点</span>
        </div>
    `, { minWidth: 220 });

    // 2. 各営業先マーカーの作成（未接触ピンを手前に表示）
    window.mapData.forEach((item, index) => {
        if (!item.lat || !item.lng) return;

        const isVisited = item.status === "訪問済";
        const icon = createPinIcon(item.category, isVisited);
        const marker = L.marker([item.lat, item.lng], {
            icon: icon,
            zIndexOffset: isVisited ? 0 : 300
        });

        marker.bindPopup(buildPopupContent(item), {
            minWidth: 280,
            maxWidth: 340,
            className: 'custom-popup-container'
        });

        markers.push({
            data: item,
            marker: marker,
            index: index
        });
    });

    // 3. バッジ＆残り件数サマリー集計
    updateStatsBadges();

    // 4. イベントハンドラーの登録
    setupEventListeners();

    // 5. 初期フィルタ適用
    applyFilters();
}

// バッジ数字・進捗バー・残り件数パネルの更新
function updateStatsBadges() {
    const data = window.mapData;
    const total = data.length;
    let visited = 0, unvisited = 0;

    const catStats = {
        "居宅": { total: 0, rem: 0 },
        "施設": { total: 0, rem: 0 },
        "病院": { total: 0, rem: 0 },
        "障害・包括": { total: 0, rem: 0 }
    };

    const distStats = {
        3: { total: 0, rem: 0 },
        5: { total: 0, rem: 0 },
        10: { total: 0, rem: 0 }
    };

    data.forEach(d => {
        const isVis = d.status === "訪問済";
        if (isVis) visited++;
        else unvisited++;

        if (catStats[d.category]) {
            catStats[d.category].total++;
            if (!isVis) catStats[d.category].rem++;
        }

        if (d.distance !== null && d.distance !== undefined) {
            [3, 5, 10].forEach(km => {
                if (d.distance <= km) {
                    distStats[km].total++;
                    if (!isVis) distStats[km].rem++;
                }
            });
        }
    });

    const pct = total > 0 ? ((visited / total) * 100).toFixed(1) : "0.0";

    // ヘッダー基本数値
    document.getElementById('totalCount').textContent = total;
    document.getElementById('visitedCount').textContent = visited;
    document.getElementById('unvisitedCount').textContent = unvisited;

    // 進捗バー
    document.getElementById('progressPercent').textContent = `${pct}%`;
    document.getElementById('progressDetailText').textContent = `完了 ${visited}件 / 残り ${unvisited}件`;
    document.getElementById('progressBarFill').style.width = `${pct}%`;

    // ステータスチップ
    document.getElementById('chipRemainCount').textContent = unvisited;
    document.getElementById('chipVisitedCount').textContent = visited;

    // カテゴリチップ（「残X/総Y」形式で一目で残りがわかる表示）
    document.getElementById('badgeKyotaku').textContent = `残${catStats["居宅"].rem}/${catStats["居宅"].total}`;
    document.getElementById('badgeShisetsu').textContent = `残${catStats["施設"].rem}/${catStats["施設"].total}`;
    document.getElementById('badgeByoin').textContent = `残${catStats["病院"].rem}/${catStats["病院"].total}`;
    document.getElementById('badgeShogai').textContent = `残${catStats["障害・包括"].rem}/${catStats["障害・包括"].total}`;

    // 距離チップ（「残X/総Y」形式）
    document.getElementById('badgeDist3').textContent = `残${distStats[3].rem}/${distStats[3].total}`;
    document.getElementById('badgeDist5').textContent = `残${distStats[5].rem}/${distStats[5].total}`;
    document.getElementById('badgeDist10').textContent = `残${distStats[10].rem}/${distStats[10].total}`;

    // マップ上HUD（残り営業先パネル）
    document.getElementById('hudRemainTotal').textContent = unvisited;
    document.getElementById('hudRemKyotaku').textContent = catStats["居宅"].rem;
    document.getElementById('hudTotKyotaku').textContent = catStats["居宅"].total;
    document.getElementById('hudRemShisetsu').textContent = catStats["施設"].rem;
    document.getElementById('hudTotShisetsu').textContent = catStats["施設"].total;
    document.getElementById('hudRemByoin').textContent = catStats["病院"].rem;
    document.getElementById('hudTotByoin').textContent = catStats["病院"].total;
    document.getElementById('hudRemShogai').textContent = catStats["障害・包括"].rem;
    document.getElementById('hudTotShogai').textContent = catStats["障害・包括"].total;

    document.getElementById('hudRemDist3').textContent = `${distStats[3].rem}件`;
    document.getElementById('hudRemDist5').textContent = `${distStats[5].rem}件`;
    document.getElementById('hudRemDist10').textContent = `${distStats[10].rem}件`;
}

// フィルタチップのUI同期
function syncChipUI() {
    ['category', 'status', 'distance'].forEach(filterType => {
        const val = currentFilters[filterType];
        document.querySelectorAll(`.chip[data-filter="${filterType}"]`).forEach(b => {
            if (b.getAttribute('data-val') === val) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    });

    // クイック残り表示ボタンのアクティブ状態
    const btnQuick = document.getElementById('btnQuickRemaining');
    if (btnQuick) {
        if (currentFilters.status === "未接触") {
            btnQuick.classList.add('active');
            btnQuick.textContent = "✔ 全件表示に戻す";
        } else {
            btnQuick.classList.remove('active');
            btnQuick.textContent = "⚠️ 残りのみ表示";
        }
    }

    // HUD内カテゴリボタンのアクティブ状態
    document.querySelectorAll('.remain-cat-item').forEach(btn => {
        const cat = btn.getAttribute('data-cat');
        if (currentFilters.category === cat && currentFilters.status === "未接触") {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // HUD内距離ボタンのアクティブ状態
    document.querySelectorAll('.remain-dist-pill').forEach(btn => {
        const dist = btn.getAttribute('data-dist');
        if (currentFilters.distance === dist && currentFilters.status === "未接触") {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// ==========================================================================
// フィルター適用処理
// ==========================================================================
function applyFilters() {
    syncChipUI();
    markerLayer.clearLayers();
    const filteredMarkers = [];
    let visibleRemainCount = 0;
    const searchLower = currentFilters.search.toLowerCase().trim();

    markers.forEach(m => {
        const d = m.data;

        // カテゴリ判定
        if (currentFilters.category !== "all" && d.category !== currentFilters.category) {
            return;
        }

        // ステータス判定
        if (currentFilters.status !== "all" && d.status !== currentFilters.status) {
            return;
        }

        // 距離判定
        if (currentFilters.distance !== "all") {
            const maxDist = parseFloat(currentFilters.distance);
            if (d.distance === null || d.distance === undefined || d.distance > maxDist) {
                return;
            }
        }

        // 検索文字列判定
        if (searchLower) {
            const matchName = (d.name || "").toLowerCase().includes(searchLower);
            const matchAddr = (d.address || "").toLowerCase().includes(searchLower);
            const matchContact = (d.contact_person || "").toLowerCase().includes(searchLower);
            const matchCorp = (d.corp || "").toLowerCase().includes(searchLower);
            const matchNote = (d.note || "").toLowerCase().includes(searchLower);
            if (!matchName && !matchAddr && !matchContact && !matchCorp && !matchNote) {
                return;
            }
        }

        markerLayer.addLayer(m.marker);
        filteredMarkers.push(m);
        if (d.status !== "訪問済") {
            visibleRemainCount++;
        }
    });

    // カウント表示の更新
    const count = filteredMarkers.length;
    document.getElementById('listCount').textContent = count;
    document.getElementById('drawerCount').textContent = count;
    document.getElementById('drawerRemainCount').textContent = visibleRemainCount;

    // HUDの表示中件数更新
    document.getElementById('hudVisibleTotal').textContent = count;
    document.getElementById('hudVisibleRemain').textContent = visibleRemainCount;

    // ドロワー内のリスト再描画
    renderDrawerList(filteredMarkers);
}

// ==========================================================================
// ドロワー（一覧リスト）の描画
// ==========================================================================
function renderDrawerList(filteredMarkers) {
    const listContainer = document.getElementById('drawerList');
    listContainer.innerHTML = '';

    if (filteredMarkers.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center;padding:30px 10px;color:#94a3b8;font-size:0.9rem;">該当する営業先は見つかりませんでした</div>`;
        return;
    }

    // ソート処理
    const sorted = [...filteredMarkers].sort((a, b) => {
        if (currentSort === "unvisited_first") {
            const visA = a.data.status === "訪問済" ? 1 : 0;
            const visB = b.data.status === "訪問済" ? 1 : 0;
            if (visA !== visB) return visA - visB;
            const distA = a.data.distance !== null ? a.data.distance : 999;
            const distB = b.data.distance !== null ? b.data.distance : 999;
            return distA - distB;
        } else if (currentSort === "distance_asc") {
            const distA = a.data.distance !== null ? a.data.distance : 999;
            const distB = b.data.distance !== null ? b.data.distance : 999;
            return distA - distB;
        } else if (currentSort === "latest_desc") {
            const dateA = a.data.latest_visit || "";
            const dateB = b.data.latest_visit || "";
            return dateB.localeCompare(dateA);
        } else if (currentSort === "name_asc") {
            return (a.data.name || "").localeCompare(b.data.name || "");
        }
        return 0;
    });

    sorted.forEach(m => {
        const d = m.data;
        const color = CATEGORY_COLORS[d.category] || CATEGORY_COLORS["その他"];
        const isVisited = d.status === "訪問済";
        const badgeBg = isVisited ? "#ecfdf5" : "#fff7ed";
        const badgeColor = isVisited ? "#065f46" : "#9a3412";
        const badgeText = isVisited ? `✔ 11月済 (${d.latest_visit || ""})` : `🔥 残り未接触`;

        const card = document.createElement('div');
        card.className = 'drawer-item-card';
        card.innerHTML = `
            <div class="drawer-card-top">
                <span class="drawer-card-title">${d.name}</span>
                <span class="drawer-card-badge" style="background:${badgeBg};color:${badgeColor}">${badgeText}</span>
            </div>
            <div class="drawer-card-bottom">
                <span style="color:${color};font-weight:600;">${d.category}${d.sub_category ? ` (${d.sub_category})` : ''}</span>
                <span>${d.distance !== null ? `📍 ${d.distance} km` : ''}</span>
                <span style="font-size:0.75rem;">${d.phone || ''}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            closeDrawer();
            map.setView([d.lat, d.lng], 16, { animate: true });
            setTimeout(() => {
                m.marker.openPopup();
            }, 300);
        });

        listContainer.appendChild(card);
    });
}

// ドロワー開閉
function openDrawer() {
    document.getElementById('listDrawer').classList.add('open');
}
function closeDrawer() {
    document.getElementById('listDrawer').classList.remove('open');
}
function toggleDrawer() {
    document.getElementById('listDrawer').classList.toggle('open');
}

// ==========================================================================
// イベントリスナーのセットアップ
// ==========================================================================
function setupEventListeners() {
    // フィルターチップクリック
    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.getAttribute('data-filter');
            const filterVal = btn.getAttribute('data-val');
            currentFilters[filterType] = filterVal;
            applyFilters();
        });
    });

    // ヘッダー「🔥 残りあと X 件」ピル & 「⚠️ 残りのみ表示」ボタン
    const toggleRemainingOnly = () => {
        if (currentFilters.status === "未接触") {
            currentFilters.status = "all";
        } else {
            currentFilters.status = "未接触";
        }
        applyFilters();
    };

    document.getElementById('pillRemaining').addEventListener('click', toggleRemainingOnly);
    document.getElementById('btnQuickRemaining').addEventListener('click', toggleRemainingOnly);

    document.getElementById('pillVisited').addEventListener('click', () => {
        if (currentFilters.status === "訪問済") {
            currentFilters.status = "all";
        } else {
            currentFilters.status = "訪問済";
        }
        applyFilters();
    });

    // マップ左上・左下HUDの開閉トグル
    document.getElementById('remainHudToggle').addEventListener('click', () => {
        document.getElementById('remainHud').classList.toggle('collapsed');
    });

    // HUD内カテゴリ別「残り」ボタンクリック（そのカテゴリの未接触を即絞り込み）
    document.querySelectorAll('.remain-cat-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.getAttribute('data-cat');
            if (currentFilters.category === cat && currentFilters.status === "未接触") {
                currentFilters.category = "all";
                currentFilters.status = "all";
            } else {
                currentFilters.category = cat;
                currentFilters.status = "未接触";
            }
            applyFilters();
        });
    });

    // HUD内距離別「残り」ボタンクリック（その距離圏内の未接触を即絞り込み）
    document.querySelectorAll('.remain-dist-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const dist = btn.getAttribute('data-dist');
            if (currentFilters.distance === dist && currentFilters.status === "未接触") {
                currentFilters.distance = "all";
                currentFilters.status = "all";
            } else {
                currentFilters.distance = dist;
                currentFilters.status = "未接触";
            }
            applyFilters();
        });
    });

    // 検索入力
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');

    searchInput.addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        clearBtn.style.display = e.target.value ? 'flex' : 'none';
        applyFilters();
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentFilters.search = '';
        clearBtn.style.display = 'none';
        applyFilters();
    });

    // フローティングボタン: 営業所へ移動
    document.getElementById('btnOffice').addEventListener('click', () => {
        map.setView(OFFICE_COORDS, 14, { animate: true });
        if (officeMarker) {
            setTimeout(() => officeMarker.openPopup(), 200);
        }
    });

    // フローティングボタン: GPS現在地
    document.getElementById('btnGps').addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("お使いの端末・ブラウザではGPS位置情報がサポートされていません。");
            return;
        }

        const btn = document.getElementById('btnGps');
        btn.style.opacity = "0.6";

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                btn.style.opacity = "1";
                const userLat = pos.coords.latitude;
                const userLng = pos.coords.longitude;

                if (userLocationMarker) {
                    map.removeLayer(userLocationMarker);
                }

                // ユーザー現在地アイコン
                const gpsIcon = L.divIcon({
                    html: `<div class="user-gps-dot"><div class="user-gps-pulse"></div></div>`,
                    className: 'user-gps-marker',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                });

                userLocationMarker = L.marker([userLat, userLng], { icon: gpsIcon, zIndexOffset: 2000 }).addTo(map);
                userLocationMarker.bindPopup("<strong>📍 あなたの現在地</strong>").openPopup();

                map.setView([userLat, userLng], 15, { animate: true });
            },
            (err) => {
                btn.style.opacity = "1";
                alert(`現在地を取得できませんでした: ${err.message}`);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });

    // フローティングボタン: リスト表示トグル
    document.getElementById('btnToggleList').addEventListener('click', toggleDrawer);
    document.getElementById('btnCloseDrawer').addEventListener('click', closeDrawer);

    // ソート切り替え
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFilters();
    });
}

// ドキュメント読み込み完了時に実行
document.addEventListener('DOMContentLoaded', initApp);
