// Initialize the map (デフォルトは広島市中心部付近)
const map = L.map('map').setView([34.460, 132.470], 12);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Colors for categories
const categoryColors = {
    "居宅": "#3498db",   // Blue
    "施設": "#2ecc71",   // Green
    "病院": "#e74c3c",   // Red
    "障害": "#9b59b6",   // Purple
    "その他": "#95a5a6"  // Gray
};

// Create legend in Header
const legendContainer = document.getElementById('legend');
for (const [cat, color] of Object.entries(categoryColors)) {
    if (cat === "その他") continue;
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-color" style="background-color: ${color}"></div><span>${cat}</span>`;
    legendContainer.appendChild(item);
}

// Function to create custom SVG marker icon based on category color
function createCustomIcon(categoryColor) {
    const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
        <path fill="${categoryColor}" stroke="#ffffff" stroke-width="2.5" d="M16 2C8.268 2 2 8.268 2 16c0 10.5 14 24 14 24s14-13.5 14-24c0-7.732-6.268-14-14-14z"/>
        <circle fill="#ffffff" cx="16" cy="16" r="6"/>
    </svg>`;
    
    return L.divIcon({
        html: svgIcon,
        className: 'custom-leaflet-marker',
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -40]  // Offset popup so it doesn't cover the marker
    });
}

// Load JSON data and plot markers
fetch('map_data.json')
    .then(response => response.json())
    .then(data => {
        let bounds = []; // To automatically calculate center/zoom

        data.forEach(item => {
            if (!item.lat || !item.lng) return;

            // Gather bounds to zoom later
            bounds.push([item.lat, item.lng]);

            // Marker Color
            const color = categoryColors[item.category] || categoryColors["その他"];
            const icon = createCustomIcon(color);
            
            // Format Priority Badge
            let priorityClass = 'priority-none';
            if (item.priority && item.priority.includes('高')) priorityClass = 'priority-high';
            else if (item.priority && item.priority.includes('中')) priorityClass = 'priority-mid';
            else if (item.priority && item.priority.includes('低')) priorityClass = 'priority-low';
            
            const priorityVal = item.priority && item.priority !== "None" ? item.priority : "設定なし";
            const priorityHtml = item.priority && item.priority !== "None" ? `<span class="badge ${priorityClass}">優先度: ${item.priority}</span>` : '';
            
            // Format Optional Fields
            const safeText = text => text === "None" || !text ? "" : text;
            const statusHtml = safeText(item.status) ? `<p><strong>ステータス:</strong> ${item.status}</p>` : '';
            const contactHtml = safeText(item.contact_person) ? `<p><strong>担当者:</strong> ${item.contact_person}</p>` : '';
            const phoneHtml = safeText(item.phone) ? `<p><strong>電話:</strong> <a href="tel:${item.phone}">${item.phone}</a></p>` : '';
            
            // Format Note with special styling
            let noteHtml = "";
            if (safeText(item.note)) {
                // Formatting long notes properly
                const formattedNote = item.note.replace(/\n/g, '<br>');
                noteHtml = `<p style="margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;"><strong>備考:</strong><br><span style="font-size:0.85rem;color:#555;">${formattedNote}</span></p>`;
            }

            // Popup HTML Template
            const popupContent = `
                <div class="popup-header" style="background-color: ${color}">
                    ${safeText(item.name) || "名称不明"}
                </div>
                <div class="popup-body">
                    ${priorityHtml}
                    <p><strong>住所:</strong> ${safeText(item.address) || "不明"}</p>
                    ${phoneHtml}
                    ${contactHtml}
                    ${statusHtml}
                    ${noteHtml}
                </div>
            `;

            // Add marker to map
            L.marker([item.lat, item.lng], { icon: icon })
                .bindPopup(popupContent, { minWidth: 280, maxWidth: 350 })
                .addTo(map);
        });

        // データの範囲に合わせて地図の中心とズームを調整
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [30, 30] });
        }
    })
    .catch(err => {
        console.error("Error loading map data:", err);
        alert("マップのデータの読み込みに失敗しました。map_data.json が同じ階層にあるか確認してください。");
    });
