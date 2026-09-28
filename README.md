# ParuParu Park AI — Hệ thống camera AI quản lý mật độ công viên

Web app theo tài liệu `Thuyet-trinh-camera-AI.pptx`. Giao diện dựng theo source mockup `ParuParu Park AI v2 JP.dc.html` (file zip từ Claude Design): lấy đúng font Archivo, màu, kích thước, bố cục và câu chữ.

## Chạy

Không cần build hay server: mở `index.html` bằng Chrome/Edge.

| Trang | Nội dung |
|---|---|
| `index.html` | Canvas giống mockup: nút chuyển **ゲストアプリ / 管理システム** và phần デザインノート |
| `guest.html` | App khách. Trên PC hiển thị trong khung iPhone 402×874, trên điện thoại thì toàn màn hình. Thêm `?embed` để bỏ khung |
| `admin.html` | Hệ thống quản lý (toàn trang) |

### Chia sẻ trong mạng LAN (máy khác / điện thoại truy cập)

1. Double-click `serve.bat` (hoặc chạy `powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080`). Cửa sổ sẽ in ra địa chỉ LAN, ví dụ `http://10.1.40.7:8080/`.
2. Mở port trên Windows Firewall (chỉ cần làm một lần, chạy PowerShell **Run as Administrator**):
   ```powershell
   New-NetFirewallRule -DisplayName "ParuParu Park AI (8080)" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Any
   ```
3. Máy khác trong cùng mạng mở `http://<IP-máy-này>:8080/`. App khách xem trên điện thoại: `http://<IP>:8080/guest.html`.

Lưu ý: dữ liệu demo nằm trong `localStorage` của từng trình duyệt. Admin và app khách chỉ đồng bộ với nhau khi mở trên **cùng một trình duyệt**. Admin mở ở máy A không đẩy thông báo sang điện thoại B (cần backend thật cho việc đó).

## Màn hình

**App khách** (`#/map`, `#/list`, `#/a/<id>`, `#/route/<id>`, `#/ai`, `#/news`)
- マップ: bản đồ chính thức, pin đánh số và tô màu theo mật độ, 3 trò gần nhất.
- アトラクション: ô tìm kiếm, chip lọc/sắp xếp, cuộn là tải thêm (5 mục mỗi lần).
- Chi tiết: thời gian chờ, số người đang chờ trên sức chứa, biểu đồ theo giờ, gợi ý AI (khi đông thì đề xuất trò khác), nút 経路案内, ♥ yêu thích.
- 経路案内: 3 tuyến (ngắn nhất / tránh đông / có mái che), 4 bước chỉ đường, nút 開始 (có animation đi bộ), 待ち時間が減ったら通知, 追加 vào lộ trình AI.
- AI提案: lộ trình 90 phút, nút このルートを開始 đi lần lượt từng điểm.
- お知らせ: nhận thông báo từ admin, push banner, cảnh báo "trò đã vắng".

**Admin** (`#/dash`, `#/rides…`, `#/cams…`, `#/notices…`)
- 概況: KPI, biểu đồ khách theo giờ, mật độ theo khu vực, top đông nhất, 混雑アラート (配置調整/スキップ), 運用ログ.
- アトラクション一覧: tìm kiếm, lọc theo khu vực / trạng thái (có 収容超過) / thời gian chờ, phân trang.
- アトラクション詳細: thẻ camera, **cách tính thời gian chờ**, 配置の提案 (スタッフを配置 / ゲストへ通知を送る), カメラログ.
- アトラクション 追加・編集: form 3 bước (基本情報 / カメラ / しきい値 & アラート), có preview và 保存前チェック.
- AIカメラ: danh sách, lọc, xuất CSV. Chi tiết: 一時停止, 計測エリアを調整 (kéo 4 góc), 直近30分を再生, 再接続する, 整備チケット.
- カメラ 追加・編集: form 3 bước (機器 / 計測エリア / 処理 & アラート), 接続テスト, 取り外し.
- 通知: KPI, lọc theo loại, soạn thông báo có preview, 下書き, 予約送信.

**Ngôn ngữ admin**: nút **日本語 / Tiếng Việt** ở góc phải header. Lựa chọn lưu trong `localStorage` (`pp.v2.adminLang`), đổi ngôn ngữ thì trang tải lại.
- Code admin vẫn viết tiếng Nhật. Ở chế độ tiếng Việt, `js/i18n.js` dịch nội dung hiển thị lúc render: text, placeholder, title, aria-label.
  - Dùng từ điển cụm từ, và mẫu câu (`RULES`) cho các câu có số hoặc tên ở giữa.
- Giữ nguyên tiếng Nhật:
  - Tên trò chơi / tiện ích (tên riêng).
  - Nội dung thông báo gửi cho khách, đánh dấu bằng class `noi18n`.
  - Dữ liệu người dùng nhập trong form.
- Thêm câu chữ mới vào admin: thêm bản dịch vào `DICT` (hoặc `RULES`) trong `js/i18n.js`.

Admin và app khách mở trong cùng trình duyệt sẽ chia sẻ trạng thái qua `localStorage` (key `pp.v2.*`). Ví dụ: sửa thông số một trò ở admin thì app khách đổi thời gian chờ ngay, gửi thông báo thì app khách hiện banner.

## Dữ liệu

`data/attractions.json` lấy từ https://pal2.co.jp/attraction, gồm 33 mục: 26 trò chơi và 7 tiện ích. Vị trí pin lấy từ https://pal2.co.jp/map. `data/attractions.js` là bản sao để chạy được với `file://`.

```jsonc
{ "id": "coaster", "number": 3, "name": "メガコースター「四次元」", "zone": "エントランスゾーン", "zoneKey": "entrance",
  "isAttraction": true, "price": 900, "priceNotes": null, "tags": ["フリーパス"],
  "heightLimit": { "min": 120, "max": null, "label": null }, "ageLimit": { "min": 7, "max": 64, "label": null },
  "catchcopy": "...", "description": "...", "disclaimer": "...", "closedReason": null,   // "点検" / "長期整備" nếu đang ngưng
  "image": "assets/attractions/coaster.webp", "imageRemote": "https://images.microcms-assets.io/...", "gallery": ["..."],
  "pin": { "x": 30.5, "y": 71.09 },   // % trên bản đồ 2400×1715
  "sourceUrl": "https://pal2.co.jp/attraction/coaster" }
```

## Logic (theo mockup)

- **Thông số trò chơi** (số ghế mỗi lượt, phút mỗi lượt, sức chứa hàng chờ) lấy từ mockup, khai báo ở `SPEC` trong `js/core.js`. Admin chỉnh được trong form アトラクション編集.
- **Thời gian chờ** (công thức hiển thị trong trang chi tiết trò ở admin, làm tròn 5 phút):
  - Camera chỉ lắp ở **hàng chờ** (không có camera ở khu lên tàu). Thời gian chờ = số người trong hàng (camera hàng chờ, trung bình 3 phút gần nhất) ÷ công suất (số ghế × 60 ÷ phút mỗi lượt) × 60 × 1,15.
  - Hệ số 1,15 bù thời gian lên xuống và ghế trống. Số ghế và phút mỗi lượt chỉnh trong form アトラクション編集.
  - **Một trò có nhiều camera hàng chờ** (ví dụ メガコースター: CAM-04 đoạn trước 60%, CAM-05 đoạn sau 40%): mỗi camera chỉ đếm **đoạn hàng của mình**. Vùng đếm không chồng nhau, ranh giới là mốc cố định trên mặt đất, nên không ai bị đếm hai lần. Số người trong hàng = tổng các đoạn.
  - Tỷ lệ mỗi đoạn nhập trong form アトラクション編集 → bước カメラ, tổng phải bằng 100%. Khi một camera ngừng (mất tín hiệu / bảo trì / tạm dừng), đoạn của nó được ước tính theo tỷ lệ thường ngày và gắn nhãn 推定.
- **Mức độ đông**: mặc định ≥ 75% 混雑, ≥ 45% やや混雑 (theo mockup), chỉnh được cho từng trò. Lưu ý: tài liệu pptx ghi 70% / 40%.
- **AI tự gửi thông báo theo vị trí khách** cho 3 loại sự kiện: 混雑 (vượt ngưỡng), 収容超過 (số người > sức chứa hàng chờ), 整備・休止 (trò chuyển sang bảo trì / tạm dừng).
  - App khách chỉ hiện thông báo AI về những trò nằm trong **bán kính quanh vị trí hiện tại** (mặc định 200m, chỉnh ở admin 通知一覧 → "AI通知の範囲"). Thông báo AI cũ quá 90 phút sẽ tự ẩn.
  - Vị trí khách mặc định là cổng vào. Khi dùng 経路案内 → 開始 và đi tới nơi, vị trí cập nhật theo trò đó. Nút "入口に戻す" ở màn お知らせ để đặt lại.
  - Mỗi trò: 混雑 / 収容超過 gửi lại tối đa mỗi 45 phút; 整備 gửi một lần cho mỗi lần đóng cửa. Chỉ gửi khi trò bật 「混雑時にゲストへ通知」.
  - Thông báo do admin tự soạn vẫn gửi theo khu vực như trước.
- **Camera**: 29 camera, tất cả lắp ở hàng chờ (trừ CAM-01 cổng và CAM-17 khu ăn uống), gán theo mockup (CAM-17 mất tín hiệu, CAM-21 đang bảo trì). Một camera có thể phụ trách nhiều trò.
- **フレーム過負荷 (quá tải khung hình)** được tính tự động, không gán cứng:
  - **Tải xử lý** = số người trong khung hình ÷ năng lực nhận diện tối đa của model: AXIS M3086-V 120 người/khung, AXIS P3265-LV 240, Hanwha XNV-C7083R 180 (`MODEL_CAP` trong `js/core.js`).
  - Tải > 90% → フレーム過負荷: giảm fps, tăng độ trễ, độ chính xác giảm. Chỉ trở về 稼働中 khi tải < 75%.
  - Mỗi lần đổi trạng thái được ghi vào カメラログ và 運用ログ. Trang chi tiết camera có dòng 処理負荷.
  - Đây là giới hạn của thiết bị, khác với ngưỡng 混雑 / 収容超過 của hàng chờ.
  - 信号断 / 整備中 / 未有効化 vẫn là trạng thái đặt thủ công.
- **Số người camera đếm** là dữ liệu mô phỏng: đường cong theo giờ + nhiễu có tính tất định, cập nhật 5 giây một lần. 
  - Mọi giờ tính theo **giờ Nhật (JST)**, không phụ thuộc múi giờ thiết bị. Vì vậy máy tính, điện thoại, app khách và admin cùng một thời điểm luôn thấy cùng mức đông.
  - Ngoài giờ mở cửa, app chạy đồng hồ demo lặp 14:32 → 16:27. Vị trí của đồng hồ này suy ra từ giờ thực, nên mọi thiết bị cùng thấy một giờ demo.
  - Riêng dữ liệu admin chỉnh sửa vẫn chỉ lưu trong trình duyệt đó (`localStorage`); muốn đồng bộ giữa các máy cần thêm backend.
- Khi có API camera thật: thay `live()` / `cameraCountAt()` trong `js/core.js`, các màn hình không cần sửa.

## Cấu trúc

```
index.html  guest.html  admin.html
css/  base.css (token từ mockup)  guest.css  admin.css
js/   core.js (dữ liệu, mô phỏng, store, AI)  icons.js  guest.js  admin.js  i18n.js (日本語 / Tiếng Việt cho admin)
data/ attractions.json  attractions.js
assets/ map.webp  logo.svg  zone-sample.png  attractions/*.webp
```

Xoá dữ liệu demo: DevTools → Application → Local Storage → xoá các key `pp.v2.*`.
