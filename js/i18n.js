/* Admin language switch (日本語 / Tiếng Việt)
 * The admin pages are written in Japanese. In Vietnamese mode every rendered text node,
 * placeholder, title and aria-label is translated on the fly (MutationObserver), so page code stays unchanged.
 * - attraction / facility names are proper nouns and stay in Japanese
 * - elements with class "noi18n" (guest-facing notice text, the switch itself) are never translated */
(function () {
  'use strict';
  const P = window.PP;
  const KEY = 'pp.v2.adminLang';
  let lang = 'ja';
  try { lang = localStorage.getItem(KEY) === 'vi' ? 'vi' : 'ja'; } catch (e) { /* storage blocked */ }

  /* ---------- sentence templates (word order differs, so match whole sentences) ---------- */
  const DOW = { '日': 'CN', '月': 'T2', '火': 'T3', '水': 'T4', '木': 'T5', '金': 'T6', '土': 'T7' };
  const RULES = [
    [/^(CAM-[\w-]+)の区間（(\d+%)(・推定)?）$/, (m, c, p, e) => `Đoạn của ${c} (${p}${e ? ' · ước tính' : ''})`],
    [/^(.+?)が停止中のため、その区間は通常の比率（(.+?)）で推定しています。$/, '$1 đang dừng nên đoạn đó được ước tính theo tỷ lệ thường ngày ($2).'],
    [/^区間の比率の合計が(\d+)%です（100%にしてください）$/, 'Tổng tỷ lệ các đoạn là $1% (cần bằng 100%)'],
    [/^(\d+)\/(\d+)（(.)）(\d+:\d+)$/, (m, mo, d, w, t) => `${DOW[w] || w}, ${d}/${mo} ${t}`],
    // dashboard
    [/^([+-]?\d+)%（先週同時刻比）$/, '$1% (so với cùng giờ tuần trước)'],
    [/^ピーク (.+)$/, 'Cao điểm $1'],
    [/^(\d+) \/ (\d+) 人・(\d+) 件$/, '$1 / $2 người · $3 trò'],
    [/(\d+)件は計測対象外（整備／休止）/, '$1 trò không đo (bảo trì / tạm ngừng)'],
    [/^フレーム過負荷 (\d+)台・信号断 (\d+)台・整備中 (\d+)台$/, 'Quá tải khung $1 · Mất tín hiệu $2 · Bảo trì $3'],
    [/^(\d+)台・稼働中 (\d+)台・フレーム過負荷 (\d+)台・信号断 (\d+)台・整備中 (\d+)台$/, '$1 camera · Đang hoạt động $2 · Quá tải khung $3 · Mất tín hiệu $4 · Bảo trì $5'],
    [/^(.+?)：現在の収容率 (\d+%)$/, '$1: tỷ lệ lấp đầy hiện tại $2'],
    [/^(.+?)の入口誘導へスタッフ(\d+)名の配置を推奨します。$/, 'Đề xuất bố trí $2 nhân viên hướng dẫn tại lối vào $1.'],
    [/^入口誘導へスタッフ(\d+)名の配置を推奨します。$/, 'Đề xuất bố trí $1 nhân viên hướng dẫn tại lối vào.'],
    [/^(.+?)から(.+?)入口へスタッフ(\d+)名を配置$/, 'Điều $3 nhân viên từ $1 đến lối vào $2'],
    [/^(.+?)の待機列が(\d+)分間、増加し続けています$/, 'Hàng chờ $1 tăng liên tục trong $2 phút'],
    [/^(.+?)の収容率が(\d+%)に達しています$/, 'Tỷ lệ lấp đầy của $1 đã đạt $2'],
    [/^(\d+:\d+)に待ち時間(\d+)分へ到達する見込みです。$/, 'Dự kiến thời gian chờ đạt $2 phút lúc $1.'],
    [/^現在の待ち時間は(\d+)分です。補助列の開放を推奨します。$/, 'Thời gian chờ hiện tại là $1 phút. Đề xuất mở làn chờ phụ.'],
    [/^補助列を開放：(.+)$/, 'Mở làn chờ phụ: $1'],
    [/^(.+?)は近隣カメラで推定中です。$/, '$1 đang được ước tính bằng camera lân cận.'],
    [/^(.+?)の画面内人数が処理上限の(\d+%)（(\d+)人\/フレーム）に達し、(\d+) fps に間引いて計測を継続中です。$/,
      'Số người trong khung hình tại $1 đã đạt $2 giới hạn xử lý ($3 người/khung); đang giảm còn $4 fps để tiếp tục đo.'],
    [/^(CAM-[\w-]+)（(.+?)）の点検を保守へ依頼$/, 'Yêu cầu bộ phận bảo trì kiểm tra $1 ($2)'],
    // ride detail
    [/^待機列が(1時間以上|\d+分間)、収容率(\d+)%を超えています。改札スタッフ(\d+)名の増員と補助列の開放を推奨します。$/,
      (m, t, p, n) => `Hàng chờ đã vượt ${p}% sức chứa ${t === '1時間以上' ? 'hơn 1 giờ' : 'trong ' + parseInt(t, 10) + ' phút'}. Đề xuất tăng thêm ${n} nhân viên soát vé và mở làn chờ phụ.`],
    [/^(.+?)のため運行を停止しています。再開前に待機列の案内表示を確認してください。$/, 'Đang ngừng vận hành do $1. Hãy kiểm tra biển hướng dẫn hàng chờ trước khi mở lại.'],
    [/^待機列の計測：(\d+) 人（(\d+)分前比 ([+-]?\d+)）$/, 'Đo hàng chờ: $1 người (so với $2 phút trước: $3)'],
    [/^計測 (\d+) 人（(\d+)分前比 ([+-]?\d+)）$/, 'Đo được $1 người (so với $2 phút trước: $3)'],
    [/^計測 (\d+) 人$/, 'Đo được $1 người'],
    [/^(CAM-[\w-—]+)が計測エリアを再調整$/, '$1 đã hiệu chỉnh lại vùng đo'],
    [/^AI計測 (.+?) 人$/, 'AI đo $1 người'],
    [/^AI計測中 (\d+) 人$/, 'AI đang đo $1 người'],
    [/^一時停止中 (\d+) 人$/, 'Đang tạm dừng · $1 người'],
    [/^(\d+)人超過$/, 'Vượt $1 người'],
    [/^(\d+)件を表示$/, 'Hiển thị $1 mục'],
    [/^待機列の人数（直近(\d+)分の平均・(.+)）$/, 'Số người trong hàng chờ (TB $1 phút gần nhất · $2)'],
    [/^参考：乗車人数（直近(\d+)分・(.+)）$/, 'Tham khảo: số người lên tàu ($1 phút gần nhất · $2)'],
    [/^乗車人数（直近(\d+)分・(.+)）$/, 'Số người lên tàu ($1 phút gần nhất · $2)'],
    [/^(\d+) 人／時（実測は(\d+)%）$/, '$1 người/giờ (thực đo $2%)'],
    [/^(\d+) 人（理論の(\d+)%）$/, '$1 người ($2% lý thuyết)'],
    [/^ゲスト表示（(\d+)分単位）$/, 'Hiển thị cho khách (làm tròn $1 phút)'],
    [/^(\d+) 席 × (\S+) 回／時$/, '$1 ghế × $2 lượt/giờ'],
    [/^乗車ペース（(.+)）$/, 'Tốc độ lên tàu ($1)'],
    [/^直近(\d+)分の乗車人数$/, 'Số người lên tàu $1 phút gần nhất'],
    [/^直近(\d+)分を再生$/, 'Phát lại $1 phút gần nhất'],
    [/^直近(\d+)分の再生が終了しました$/, 'Đã phát xong $1 phút gần nhất'],
    // ride form
    [/^カメラ(\d+)台を割当済み$/, 'Đã gán $1 camera'],
    [/^待機列の収容率（(.+?) 人\)\.$/, 'Tỷ lệ lấp đầy hàng chờ (sức chứa $1 người).'],
    // cameras
    [/^(\d+%)（上限 (\d+)人\/フレーム）$/, '$1 (giới hạn $2 người/khung)'],
    [/^高負荷・(\d+:\d+)から$/, 'Tải cao · từ $1'],
    [/^信号断 (\d+)分$/, 'Mất tín hiệu $1 phút'],
    [/^計測停止・(\d+:\d+)から整備中$/, 'Dừng đo · bảo trì từ $1'],
    [/^(\d+:\d+)からデータなし・カメラ整備中$/, 'Không có dữ liệu từ $1 · camera đang bảo trì'],
    [/^(\d+:\d+)からデータなし・近隣カメラで推定中$/, 'Không có dữ liệu từ $1 · đang ước tính bằng camera lân cận'],
    [/^(\d+:\d+)からデータなし$/, 'Không có dữ liệu từ $1'],
    [/^計測エリアのサンプル画角（(\d+)人）・(CAM-[\w-]+) のライブ計測値:$/, 'Góc quay mẫu của vùng đo ($1 người) · giá trị đo trực tiếp của $2:'],
    [/毎(\d+) 秒/, 'mỗi $1 giây'],
    [/^処理負荷が(\d+)%を超過・フレームを間引き（(\d+) fps）$/, 'Tải xử lý vượt $1% · bỏ bớt khung hình ($2 fps)'],
    [/処理負荷 (\d+%)：フレーム過負荷（(\d+) fps に間引き）/, 'tải xử lý $1: quá tải khung (giảm còn $2 fps)'],
    [/処理負荷 (\d+%)：稼働中に復帰（(\d+) fps）/, 'tải xử lý $1: trở lại hoạt động ($2 fps)'],
    [/^信号品質が(\d+)%まで低下$/, 'Chất lượng tín hiệu giảm còn $1%'],
    [/^コード (\S+)は他のカメラで使用中です$/, 'Mã $1 đang được camera khác sử dụng'],
    [/^コード (\S+)は使用可能です$/, 'Mã $1 có thể sử dụng'],
    [/^アトラクション(\d+)件を担当$/, 'Phụ trách $1 trò chơi'],
    [/^信頼度しきい値 (\d+)%：適正値です$/, 'Ngưỡng tin cậy $1%: hợp lý'],
    [/^“(.+?)” はシステムが自動検知した状態です。別の状態を選ぶと上書きされます。$/, '“$1” là trạng thái do hệ thống tự phát hiện. Chọn trạng thái khác sẽ ghi đè.'],
    [/^(\S+) を取り外しますか？担当アトラクションの計測は停止します。$/, 'Tháo $1? Việc đo cho các trò chơi được phụ trách sẽ dừng lại.'],
    [/^(\S+) を取り外しました$/, 'Đã tháo $1'],
    [/^(\S+) を再接続しました$/, 'Đã kết nối lại $1'],
    [/^(\S+) を再接続$/, 'Kết nối lại $1'],
    [/^整備チケット (\S+) を作成しました$/, 'Đã tạo phiếu bảo trì $1'],
    [/^整備チケット (\S+) を作成$/, 'Tạo phiếu bảo trì $1'],
    [/^接続失敗：(\S+) から応答がありません$/, 'Kết nối thất bại: $1 không phản hồi'],
    [/^接続OK：(\S+)・遅延 (\S+) s・(\d+) fps$/, 'Kết nối OK: $1 · độ trễ $2 s · $3 fps'],
    [/^記録 (\d+) 人（(\d+:\d+)）$/, 'Bản ghi $1 người ($2)'],
    // notices
    [/^うち (\d+) 件はAI自動送信$/, 'trong đó $1 do AI tự gửi'],
    [/^(\d+)件・送信済み (\d+)件・予約 (\d+)件・下書き (\d+)件$/, '$1 thông báo · Đã gửi $2 · Hẹn giờ $3 · Nháp $4'],
    [/^送信済み（(\d+:\d+)）・内容を変えて再送信できます$/, 'Đã gửi ($1) · có thể sửa nội dung và gửi lại'],
    [/^約 (\S+) 人$/, 'Khoảng $1 người'],
    [/^予約・(\d+:\d+)$/, 'Hẹn giờ · $1'],
    [/^(.+?)周辺$/, 'Quanh $1'],
    [/^半径(\d+)m$/, 'Bán kính $1m'],
    [/^(\d+:\d+)に送信を予約しました$/, 'Đã hẹn gửi lúc $1'],
    [/^AI通知の範囲を半径(\d+)mに変更$/, 'Đổi phạm vi thông báo AI thành bán kính $1m'],
    [/^AI通知は各アトラクションから半径(\d+)m以内のゲストに表示されます$/, 'Thông báo AI sẽ hiển thị cho khách trong bán kính $1m quanh mỗi trò chơi'],
    [/^(.+?)通知をAI自動送信：(.+?)（周辺(\d+)mのゲスト）$/, 'AI tự gửi thông báo $1: $2 (khách trong bán kính $3m)'],
    [/^通知を送信：(.+?)（(.+?)・(.+?)）$/, 'Đã gửi thông báo: $1 ($2 · $3)'],
    [/^予約通知を送信：(.+)$/, 'Đã gửi thông báo hẹn giờ: $1'],
    // confirm dialogs
    [/割り当て中のカメラ（(.+?)）は削除されず、担当から外れます。/, 'Camera đang gán ($1) không bị xóa, chỉ được gỡ khỏi trò chơi này.'],
    [/担当しているアトラクション（(.+?)）の計測は停止します。/, 'Việc đo cho các trò chơi đang phụ trách ($1) sẽ dừng lại.'],
    [/^周辺(\d+)m以内のゲストに、AIが整備・休止のお知らせを自動送信します。$/, 'AI sẽ tự gửi thông báo bảo trì/tạm ngừng cho khách trong bán kính $1m.'],
    [/^現在、待機列に(\d+)人が並んでいます。スタッフによる案内をお願いします。$/, 'Hiện có $1 người đang xếp hàng. Vui lòng bố trí nhân viên hướng dẫn.'],
    [/^割り当て済みのカメラ（(\d+)台）で計測を再開します。$/, 'Tiếp tục đo bằng $1 camera đã gán.'],
    [/^(.+?)の運行を再開しました$/, 'Đã mở lại $1'],
    [/^(.+?)を休止にしました$/, 'Đã tạm ngừng $1'],
    [/^(.+?)を(.+?)のため運行停止$/, "Ngừng vận hành $1 để $2"],
    [/^(.+?)を運行停止にしました$/, 'Đã ngừng vận hành $1'],
    [/^(.+?)の運行状態：(.+)$/, 'Trạng thái vận hành của $1: $2'],
    [/^(.+?)の詳細$/, 'Chi tiết $1'],
    [/^(.+?)を編集$/, 'Sửa $1'],
    [/^(.+?)を削除$/, 'Xóa $1'],
  ];

  /* ---------- phrases (longest match wins) ---------- */
  const DICT = {
    // shell
    'パルパル AIカメラ運用': 'PalPal · Vận hành camera AI', 'AIカメラ運用': 'Vận hành camera AI', '浜名湖パルパル': 'Hamanako PalPal',
    '監視': 'giám sát', '午後シフト': 'ca chiều', 'オンライン': 'trực tuyến', 'アトラクション・エリア・カメラを検索': 'tìm trò chơi, khu vực, camera',
    '該当なし': 'không có kết quả', 'リアルタイム概況': 'tổng quan thời gian thực', '概況': 'tổng quan', 'AIカメラの状態': 'trạng thái camera AI',
    'AIカメラ一覧': 'danh sách camera AI', 'AIカメラ': 'camera AI', 'ゲストへの通知': 'thông báo cho khách', '通知一覧': 'danh sách thông báo',
    // zones & places
    'エントランスゾーン中央通路': 'lối đi trung tâm khu Lối vào', 'エントランスゾーン': 'khu Lối vào', 'レイクサイドゾーン': 'khu Ven hồ', 'モンテゾーン': 'khu Monte',
    'エントランス': 'Lối vào', 'レイクサイド': 'Ven hồ', 'モンテ': 'Monte', '全エリア': 'toàn bộ khu vực',
    'メインゲート': 'cổng chính', 'ゲート前広場': 'quảng trường trước cổng', '改札ゲート': 'cổng soát vé', 'レイクサイド飲食エリア': 'khu ăn uống Ven hồ',
    'レイクサイドフードエリア': 'khu ẩm thực Ven hồ', 'メガコースター 待機列': 'メガコースター · hàng chờ', 'メガコースター 乗り場': 'メガコースター · lên tàu',
    // KPIs / dashboard
    '園内のゲスト数': 'số khách trong công viên', '平均待ち時間': 'thời gian chờ trung bình', '運行中のアトラクション・警告しきい値25分': 'các trò đang chạy · ngưỡng cảnh báo 25 phút',
    '混雑アトラクション': 'trò chơi đông', '稼働中カメラ': 'camera đang hoạt động', '園内全体の来園者数・本日': 'lượng khách toàn công viên · hôm nay',
    'エリア別混雑度': 'mức đông theo khu vực', '現在の混雑トップ': 'đông nhất hiện tại', 'すべてのアトラクション': 'tất cả trò chơi', '混雑アラート': 'cảnh báo đông',
    '配置調整': 'điều phối', 'スキップ': 'bỏ qua', '現在アラートはありません': 'hiện không có cảnh báo', '運用ログ': 'nhật ký vận hành',
    'レベル3・緊急': 'mức 3 · khẩn cấp', 'レベル2': 'mức 2', '機器': 'thiết bị', '保守チームへ点検を依頼しました': 'đã gửi yêu cầu kiểm tra cho đội bảo trì',
    'スタッフ配置を記録しました': 'đã ghi nhận việc bố trí nhân viên',
    // levels / statuses
    'やや混雑': 'hơi đông', '混雑': 'đông', '空き': 'vắng', '休止中': 'tạm ngừng', '整備中': 'đang bảo trì', '点検中': 'đang kiểm tra', '長期整備中': 'bảo trì dài hạn',
    '未開業': 'chưa khai trương', '稼働中': 'đang hoạt động', 'カメラ未割当': 'chưa gán camera', 'カメラ未設置': 'chưa lắp camera', '収容超過': 'vượt sức chứa',
    'フレーム過負荷': 'quá tải khung hình', '信号断': 'mất tín hiệu', '未有効化': 'chưa kích hoạt', '未有効': 'chưa kích hoạt', '整備・休止': 'bảo trì / tạm ngừng',
    '点検': 'kiểm tra', '長期整備': 'bảo trì dài hạn', '整備': 'bảo trì', '休止': 'tạm ngừng', '運休': 'ngừng chạy', '高負荷': 'tải cao', 'やや高負荷': 'tải hơi cao', '安定': 'ổn định',
    // ride list
    'アトラクション一覧': 'danh sách trò chơi', 'アトラクションを追加': 'thêm trò chơi', 'アトラクション名': 'tên trò chơi', 'すべてのエリア': 'tất cả khu vực',
    'すべての混雑状況': 'mọi mức đông', 'すべての運行状態': 'mọi trạng thái vận hành', 'すべて': 'tất cả', 'フィルターを解除': 'xóa bộ lọc', '検索': 'tìm kiếm',
    '絞り込み': 'lọc', '混雑度順': 'theo mức đông', 'アトラクション': 'trò chơi', 'エリア': 'khu vực', '人数／収容': 'số người / sức chứa', '待ち': 'chờ',
    'カメラ': 'camera', '混雑状況': 'mức đông', '運行状態': 'trạng thái vận hành', '条件に一致するアトラクションはありません。': 'không có trò chơi nào phù hợp.',
    '稼働中（クリックで休止）': 'đang hoạt động (bấm để tạm ngừng)', '（クリックで再開）': ' (bấm để mở lại)', '1ページの表示件数': 'số dòng mỗi trang',
    'ページ送り': 'phân trang', '前へ': 'trước', '次へ': 'sau', '詳細': 'chi tiết', '編集': 'sửa', '削除': 'xóa',
    // ride detail
    'アトラクション詳細': 'chi tiết trò chơi', 'アトラクションが見つかりません。': 'không tìm thấy trò chơi.', 'アトラクションを編集': 'sửa trò chơi',
    'このアトラクションにはカメラが未割当です。': 'trò chơi này chưa được gán camera.', 'で計測用カメラを選んでください。': ' để chọn camera đo.',
    'ライブ映像': 'hình ảnh trực tiếp', 'ライブ': 'trực tiếp', '乗り場': 'lên tàu', '待機列': 'hàng chờ', '時間帯別の来園者数・本日': 'lượng khách theo khung giờ · hôm nay',
    '現在': 'hiện tại', '待ち時間': 'thời gian chờ', '配置の提案': 'đề xuất bố trí', 'スタッフを配置': 'bố trí nhân viên', 'ゲストへ通知を送る': 'gửi thông báo cho khách',
    'カメラログ': 'nhật ký camera', '運行を停止・整備モードへ切替': 'dừng vận hành · chuyển sang chế độ bảo trì', '監視セッションを開始': 'bắt đầu phiên giám sát',
    '待機列混雑アラート：レベル2': 'cảnh báo hàng chờ đông: mức 2', '待機列の混雑度は許容範囲内です': 'mức đông của hàng chờ trong phạm vi cho phép',
    'カメラが未割当のため計測値がありません。アトラクションを編集でカメラを割り当ててください。': 'chưa gán camera nên không có số liệu đo. Hãy gán camera trong phần sửa trò chơi.',
    '混雑度は安定しています。追加の配置調整は不要です。': 'mức đông ổn định. Không cần điều phối thêm.',
    '待ち時間の算出方法': 'cách tính thời gian chờ', '運行停止中のため待ち時間は算出していません。': 'đang ngừng vận hành nên không tính thời gian chờ.',
    'カメラが未割当のため待ち時間を算出できません。': 'chưa gán camera nên không thể tính thời gian chờ.', '実測（乗り場カメラ）': 'thực đo (camera khu lên tàu)',
    '理論値で算出': 'tính theo lý thuyết', '実測の乗車ペース': 'tốc độ lên tàu thực đo', '理論上の処理能力': 'công suất lý thuyết',
    '計算値（人数 ÷ 乗車ペース）': 'giá trị tính (số người ÷ tốc độ lên tàu)', '1回あたりの座席数 × 運行回数': 'số ghế mỗi lượt × số lượt chạy', '計算値': 'giá trị tính', '乗降係数': 'hệ số lên xuống',
    '乗り場カメラが未設置のため、理論上の処理能力で算出しています。': 'chưa lắp camera khu lên tàu nên đang tính theo công suất lý thuyết.',
    '乗り場カメラが信号断のため、理論上の処理能力で代替しています。': 'camera khu lên tàu mất tín hiệu nên đang dùng công suất lý thuyết thay thế.',
    '乗り場カメラが停止中のため、理論上の処理能力で代替しています。': 'camera khu lên tàu đang dừng nên đang dùng công suất lý thuyết thay thế.',
    '乗り場カメラの計測が一時停止中のため、理論上の処理能力で代替しています。': 'camera khu lên tàu đang tạm dừng đo nên đang dùng công suất lý thuyết thay thế.',
    '開園から15分未満で乗車データが不足しているため、理論上の処理能力で算出しています。': 'mở cửa chưa được 15 phút, chưa đủ dữ liệu lên tàu nên đang tính theo công suất lý thuyết.',
    '実測の乗車ペースが理論値から大きく外れているため（50〜150%の範囲外）、理論値で代替しています。カメラの計測エリアを確認してください。':
      'tốc độ lên tàu thực đo lệch nhiều so với lý thuyết (ngoài khoảng 50–150%) nên đang dùng giá trị lý thuyết. Hãy kiểm tra vùng đo của camera.',
    '待ち時間 ＝ 待機列の人数 ÷ 実際に乗車している人数の速さ（リトルの法則）。待機列カメラは5秒ごとに計測し直近3分の平均を、乗り場カメラは直近15分の乗車人数を使います。実測値には乗り降りの時間や空席が含まれるため、補正係数は使いません。実測が理論値の50〜150%を外れた場合は理論値に切り替えます。結果は5分単位に丸めています。':
      'thời gian chờ = số người trong hàng chờ ÷ tốc độ lên tàu thực tế (định luật Little). Camera hàng chờ đo mỗi 5 giây và lấy trung bình 3 phút gần nhất; camera khu lên tàu dùng số người lên tàu trong 15 phút gần nhất. Giá trị thực đo đã bao gồm thời gian lên xuống và ghế trống nên không dùng hệ số hiệu chỉnh. Nếu thực đo nằm ngoài 50–150% lý thuyết thì chuyển sang giá trị lý thuyết. Kết quả làm tròn theo bội số 5 phút.',
    '処理能力 ＝ 1回あたりの座席数 × 1時間あたりの運行回数（アトラクション編集画面で設定）。係数1.15は乗り降りの時間や空席を補正する目安です。乗り場カメラ（役割「乗車人数の計測」）を割り当てると、実際の乗車ペースで算出されます。結果は5分単位に丸めています。':
      'công suất = số ghế mỗi lượt × số lượt chạy mỗi giờ (cài trong màn hình sửa trò chơi). Hệ số 1,15 là mức hiệu chỉnh ước lượng cho thời gian lên xuống và ghế trống. Khi gán camera khu lên tàu (vai trò “đo số người lên tàu”), thời gian chờ sẽ tính theo tốc độ lên tàu thực tế. Kết quả làm tròn theo bội số 5 phút.',
    // ride form
    'アトラクションを新規追加': 'thêm trò chơi mới', 'キャンセル': 'hủy', '1・基本情報': '1 · thông tin cơ bản', '2・カメラ': '2 · camera', '3・しきい値 & アラート': '3 · ngưỡng & cảnh báo',
    '例：メガコースター「四次元」': 'VD: メガコースター「四次元」', 'ゲストアプリとマップに表示される名称です。': 'tên hiển thị trên app khách và bản đồ.',
    'コード アトラクション': 'mã trò chơi', '稼働状態': 'trạng thái vận hành', '待機列の収容人数（人）': 'sức chứa hàng chờ (người)', '1回あたりの座席数': 'số ghế mỗi lượt',
    '1回あたりの時間（分）': 'thời gian mỗi lượt (phút)', '処理能力 =': 'công suất =', '座席 × 60 ÷': 'ghế × 60 ÷', '分 =': 'phút =', '両方の数値が必要です': 'cần nhập cả hai giá trị',
    '身長制限（cm）': 'giới hạn chiều cao (cm)', '営業時間': 'giờ hoạt động', 'ゲストアプリ用の短い説明': 'mô tả ngắn cho app khách', 'アトラクション写真': 'ảnh trò chơi',
    '画像を選ぶ': 'chọn ảnh', 'JPGまたはPNG、16:9、最小1280×720。': 'JPG hoặc PNG, 16:9, tối thiểu 1280×720.', '写真のアップロードは本番環境で有効になります': 'tải ảnh lên sẽ hoạt động trên môi trường chính thức',
    'アトラクションに割り当てたカメラ': 'camera đã gán cho trò chơi', 'このアトラクションの計測値を供給するカメラを選びます。1台で複数のアトラクションを担当できます。': 'chọn camera cung cấp số liệu đo cho trò chơi này. Một camera có thể phụ trách nhiều trò chơi.',
    '主カメラ': 'camera chính', '副カメラ': 'camera phụ', '未割当': 'chưa gán', '混雑しきい値': 'ngưỡng đông', 'レベル “やや混雑” （%）': 'mức “hơi đông” (%)', 'レベル “混雑” （%）': 'mức “đông” (%)',
    'アラート & 通知': 'cảnh báo & thông báo', '混雑しきい値を超えたら管理者に通知': 'báo quản lý khi vượt ngưỡng đông', 'アラート一覧と当番スタッフへ送信します。': 'gửi vào danh sách cảnh báo và cho nhân viên trực.',
    '混雑時にゲストへ通知': 'thông báo cho khách khi đông', 'ゲストアプリに空いているアトラクションを提案します。': 'gợi ý trò chơi vắng trên app khách.',
    '登録したゲストに空き始めを通知': 'báo cho khách đã đăng ký khi bắt đầu vắng', '「空き」まで下がり5分継続した場合のみ送信します。': 'chỉ gửi khi đã xuống mức “vắng” và duy trì 5 phút.',
    'ゲストアプリでのプレビュー': 'xem trước trên app khách', '分（予測待ち時間）': 'phút (thời gian chờ dự kiến)', '設定したしきい値を確認するため、収容率60%で試算しています。': 'tính thử với tỷ lệ lấp đầy 60% để kiểm tra ngưỡng đã cài.',
    '保存前チェック': 'kiểm tra trước khi lưu', 'アトラクション名を入力済み': 'đã nhập tên trò chơi', 'アトラクション名が未入力です': 'chưa nhập tên trò chơi', 'カメラ未割当。計測値がありません': 'chưa gán camera. Không có số liệu đo',
    '混雑しきい値：適正値です': 'ngưỡng đông: hợp lý', 'しきい値「混雑」は「やや混雑」より大きい必要があります': 'ngưỡng “đông” phải lớn hơn ngưỡng “hơi đông”',
    '座席数と1回あたりの時間を設定済み': 'đã cài số ghế và thời gian mỗi lượt', '待ち時間の算出には座席数と1回あたりの時間が必要です': 'cần số ghế và thời gian mỗi lượt để tính thời gian chờ',
    '変更を保存': 'lưu thay đổi', 'アトラクションを作成': 'tạo trò chơi', '下書き保存': 'lưu nháp', '運行停止': 'ngừng vận hành', 'アトラクション名を入力してください': 'vui lòng nhập tên trò chơi',
    '変更を保存しました': 'đã lưu thay đổi', 'アトラクションを作成しました': 'đã tạo trò chơi', '下書きを保存しました（公開内容は変わりません）': 'đã lưu nháp (nội dung công khai không đổi)', '下書きを保存しました': 'đã lưu nháp',
    'アトラクションを更新': 'cập nhật trò chơi', 'アトラクションを削除': 'xóa trò chơi', '運行再開': 'mở lại vận hành',
    '収容人数・座席数・1回あたりの時間は1以上で入力してください': 'sức chứa, số ghế và thời gian mỗi lượt phải từ 1 trở lên',
    // cameras
    'カメラコード・設置場所': 'mã camera · vị trí lắp', 'カメラコード': 'mã camera', '担当アトラクション': 'trò chơi phụ trách', 'レポート出力': 'xuất báo cáo', 'カメラを追加': 'thêm camera',
    '場所': 'vị trí', '計測位置': 'vị trí đo', '状態': 'trạng thái', '計測人数': 'số người đo', '条件に一致するカメラはありません。': 'không có camera nào phù hợp.',
    '入退場': 'ra vào', 'カメラレポートを出力しました': 'đã xuất báo cáo camera', 'カメラ詳細': 'chi tiết camera', 'カメラが見つかりません。': 'không tìm thấy camera.',
    'すべてのカメラ': 'tất cả camera', 'カメラを編集': 'sửa camera', '設置': 'lắp đặt', '再生中': 'đang phát', '再生を停止': 'dừng phát', '再生': 'phát lại', '一時停止': 'tạm dừng',
    'ハンドルをドラッグして計測エリアを調整': 'kéo các điểm để điều chỉnh vùng đo', '初期化': 'đặt lại', '保存': 'lưu', '再接続する': 'kết nối lại', '整備チケットを作成': 'tạo phiếu bảo trì',
    '再開': 'tiếp tục', '計測エリアを調整': 'điều chỉnh vùng đo', 'カメラ計測人数・本日': 'số người camera đo · hôm nay', 'データなし': 'không có dữ liệu', '技術指標': 'chỉ số kỹ thuật',
    '計測精度（24時間）': 'độ chính xác (24 giờ)', '処理負荷': 'tải xử lý', '処理遅延': 'độ trễ xử lý', '解像度・FPS': 'độ phân giải · FPS', '接続': 'kết nối', 'AIモデル': 'mô hình AI',
    'カメラが担当するエリア': 'khu vực camera phụ trách', '待ち時間の算出': 'cách tính thời gian chờ', '実測で算出中': 'đang tính theo thực đo', '理論値で代替中': 'đang dùng lý thuyết thay thế',
    '算出方法を見る': 'xem cách tính', '機器ログ': 'nhật ký thiết bị', 'レコーダーとの接続が切断・近隣カメラで推定中': 'mất kết nối với đầu ghi · đang ước tính bằng camera lân cận',
    '計測を停止・整備モードへ切替': 'dừng đo · chuyển sang chế độ bảo trì', '混雑しきい値レベル2を超過': 'vượt ngưỡng đông mức 2', '計測値は平常範囲': 'số liệu đo trong phạm vi bình thường',
    '明るさに合わせて計測エリアを自動補正': 'tự hiệu chỉnh vùng đo theo độ sáng', 'オペレーターが計測を一時停止': 'người vận hành đã tạm dừng đo', '計測を再開': 'tiếp tục đo',
    '計測エリアを手動で調整': 'điều chỉnh vùng đo thủ công', '計測エリアを保存しました': 'đã lưu vùng đo', '再接続を試行中…': 'đang thử kết nối lại…', '再接続に成功・計測を再開': 'kết nối lại thành công · tiếp tục đo',
    'カメラ設定を更新': 'cập nhật cài đặt camera', 'カメラを取り外し': 'tháo camera', '接続テスト中…': 'đang kiểm tra kết nối…',
    '待機列の計測': 'đo hàng chờ', '乗車人数の計測': 'đo số người lên tàu', '入退場の計測': 'đo lượt ra vào', 'エリア混雑度': 'mức đông khu vực', '座席の混雑度': 'mức đông chỗ ngồi',
    '新規カメラ': 'camera mới', '設置場所が未設定のカメラ': 'camera chưa có vị trí lắp', '1・機器': '1 · thiết bị', '2・計測エリア': '2 · vùng đo', '3・処理 & アラート': '3 · xử lý & cảnh báo',
    'ログと映像上に表示されるコードです。': 'mã hiển thị trong nhật ký và trên hình ảnh.', '設置場所': 'vị trí lắp', '例：待機列 メガコースター': 'VD: hàng chờ メガコースター', '機器モデル': 'model thiết bị',
    '解像度': 'độ phân giải', 'フレームレート（fps）': 'tốc độ khung hình (fps)', '設置年月': 'tháng/năm lắp', '手動設定。異常状態はシステムが自動検知します。': 'đặt thủ công. Trạng thái bất thường do hệ thống tự phát hiện.',
    '映像内の計測エリア': 'vùng đo trong hình ảnh', 'この範囲に入った人だけを計測します。通路が写り込む場合はドラッグして狭めてください。': 'chỉ đếm người trong vùng này. Nếu khung hình dính lối đi, hãy kéo để thu hẹp.',
    '計測エリアのカバー率': 'độ phủ vùng đo', '計測エリア': 'vùng đo', 'カメラの役割': 'vai trò camera', 'カメラが担当するアトラクション': 'trò chơi camera phụ trách',
    'このカメラの計測値を、選んだアトラクションへ供給します。': 'số liệu đo của camera này sẽ được cung cấp cho các trò chơi đã chọn.', 'カメラなし': 'chưa có camera', '担当': 'phụ trách',
    '計測周期（秒）': 'chu kỳ đo (giây)', '周期を短くすると数値は滑らかになりますが、処理負荷は増えます。': 'chu kỳ ngắn giúp số liệu mượt hơn nhưng tăng tải xử lý.',
    '最低信頼度（%）': 'độ tin cậy tối thiểu (%)', 'このしきい値を下回るフレームは計測から除外されます。': 'khung hình dưới ngưỡng này sẽ bị loại khỏi phép đo.', '機器ルール': 'quy tắc thiết bị',
    '信号断が60秒を超えたら警告': 'cảnh báo khi mất tín hiệu quá 60 giây', '機器レベルのアラートに追加し、近隣カメラによる推定へ切り替えます。': 'thêm vào cảnh báo mức thiết bị và chuyển sang ước tính bằng camera lân cận.',
    '端末内で処理（エッジ）': 'xử lý tại thiết bị (edge)', 'センターへ送るのは数値のみ。ゲストの映像は送信しません。': 'chỉ gửi số liệu về trung tâm, không gửi hình ảnh khách.',
    '混雑しきい値を超えたら10秒間の映像を保存': 'lưu 10 giây video khi vượt ngưỡng đông', '計測値にずれがあったときの照合用。7日後に自動削除されます。': 'dùng để đối chiếu khi số liệu bị lệch. Tự xóa sau 7 ngày.',
    '映像プレビュー': 'xem trước hình ảnh', '役割': 'vai trò', '計測エリア内': 'trong vùng đo', 'カメラを作成': 'tạo camera', '接続テスト': 'kiểm tra kết nối', 'カメラを取り外す': 'tháo camera',
    'コードは CAM-08 の形式で入力してください': 'nhập mã theo dạng CAM-08', '設置場所を入力済み': 'đã nhập vị trí lắp', '設置場所が未入力です': 'chưa nhập vị trí lắp',
    'アトラクション未割当。計測値は供給されません': 'chưa gán trò chơi. Số liệu đo sẽ không được cung cấp', '信頼度しきい値は80%以上を推奨します': 'nên đặt ngưỡng tin cậy từ 80% trở lên',
    '設置場所を入力してください': 'vui lòng nhập vị trí lắp', 'カメラを作成しました': 'đã tạo camera',
    // notices
    '種類': 'loại', '対象エリア': 'khu vực nhận', '送信中': 'đang gửi', '送信済み': 'đã gửi', '予約': 'hẹn giờ', '下書き': 'nháp', '通知': 'thông báo', 'タイトル・本文': 'tiêu đề · nội dung',
    '本日の送信': 'đã gửi hôm nay', '到達ゲスト': 'khách đã nhận', 'アプリ表示回数': 'số lần hiển thị trên app', 'AI自動送信': 'AI tự gửi', 'カメラのしきい値で起動': 'kích hoạt theo ngưỡng camera',
    '送信待ち': 'chờ gửi', '下書きと予約': 'nháp và hẹn giờ', 'AIが自動送信する通知を受け取るゲストの範囲（アトラクションからの距離）': 'phạm vi khách nhận thông báo AI tự gửi (khoảng cách từ trò chơi)',
    'AI通知の範囲': 'phạm vi thông báo AI', '並び順を切り替え': 'đổi thứ tự sắp xếp', '古い順': 'cũ nhất', '新しい順': 'mới nhất', '通知を作成': 'tạo thông báo', '配信チャネル': 'kênh gửi',
    '到達数': 'lượt nhận', '条件に一致する通知はありません。': 'không có thông báo nào phù hợp.', 'AI自動': 'AI tự động', '手動': 'thủ công',
    '分散誘導': 'điều hướng phân tán', '天候': 'thời tiết', 'イベント': 'sự kiện', 'プッシュ＋アプリ内': 'push + trong app', 'プッシュ': 'push', 'アプリ内': 'trong app',
    '通知が見つかりません。': 'không tìm thấy thông báo.', '保存しました': 'đã lưu', '通知の種類': 'loại thông báo', 'タイトル': 'tiêu đề', '本文': 'nội dung',
    '例: メガコースターが混雑しています': 'VD: メガコースターが混雑しています', '例: 待ち時間は45分です。空いているアトラクションはいかがですか。': 'VD: 待ち時間は45分です。空いているアトラクションはいかがですか。',
    'しきい値超過時にAIが自動送信': 'AI tự gửi khi vượt ngưỡng', 'カメラが収容率75%超を検知すると、この通知が自動で送信されます。': 'khi camera phát hiện tỷ lệ lấp đầy trên 75%, thông báo này sẽ được tự động gửi.',
    '予約送信': 'hẹn giờ gửi', '予約を保存': 'lưu lịch hẹn', '今すぐ送信': 'gửi ngay', 'アプリでのプレビュー': 'xem trước trên app', 'たった今': 'vừa xong', '推定到達数': 'lượt nhận ước tính',
    'タイトルを入力してください': 'vui lòng nhập tiêu đề', '通知を送信しました': 'đã gửi thông báo', '通知を削除しました': 'đã xóa thông báo', '通知の作成': 'tạo thông báo', '通知の編集': 'sửa thông báo',
    '通知を編集': 'sửa thông báo',
    // modals
    'アトラクションを削除しますか？': 'xóa trò chơi?', 'ゲストアプリの一覧・マップ・AI提案からも表示されなくなります。': 'trò chơi sẽ không còn hiển thị trong danh sách, bản đồ và gợi ý AI của app khách.',
    'カメラを取り外しますか？': 'tháo camera?', 'このカメラの計測データは今後記録されません。': 'số liệu đo của camera này sẽ không còn được ghi.', '通知を削除しますか？': 'xóa thông báo?',
    '送信履歴から削除され、ゲストアプリのお知らせ一覧からも表示されなくなります。': 'thông báo sẽ bị xóa khỏi lịch sử gửi và không còn hiển thị trong app khách.',
    '予約は取り消され、送信されません。': 'lịch hẹn sẽ bị hủy và không được gửi.', '下書きを削除します。': 'bản nháp sẽ bị xóa.', 'この操作は取り消せません。': ' Thao tác này không thể hoàn tác.',
    'ゲストアプリで「休止中」と表示され、待ち時間・経路案内・AI提案の対象から外れます。': 'app khách sẽ hiển thị “tạm ngừng”, trò chơi bị loại khỏi thời gian chờ, chỉ đường và gợi ý AI.',
    'ゲストへの自動通知はオフに設定されています。': 'thông báo tự động cho khách đang tắt.', 'ゲストアプリで待ち時間の表示と経路案内を再開します。': 'app khách sẽ hiển thị lại thời gian chờ và chỉ đường.',
    'カメラが未割当のため、待ち時間は「カメラ未設置」と表示されます。': 'chưa gán camera nên thời gian chờ sẽ hiển thị “chưa lắp camera”.',
    '運行を休止しますか？': 'tạm ngừng vận hành?', '運行を再開しますか？': 'mở lại vận hành?', '休止にする': 'tạm ngừng', '再開する': 'mở lại', '削除する': 'xóa', '削除しました': 'đã xóa',
    '閉じる': 'đóng', '詳細な編集画面へ': 'mở màn hình sửa chi tiết', '送信済みの通知です。修正内容は履歴とアプリのお知らせ一覧に反映されます（再送信はされません）。': 'thông báo này đã được gửi. Nội dung sửa sẽ cập nhật vào lịch sử và danh sách thông báo trên app (không gửi lại).',
    // units & small words
    '人／分': 'người/phút', '人／時': 'người/giờ', '回／時': 'lượt/giờ', '人/フレーム': 'người/khung', 'フレーム': 'khung hình', '以上': 'trở lên', '以下': 'trở xuống',
    '人': 'người', '分': 'phút', '台': 'camera', '件': 'mục', '席': 'ghế', '秒': 'giây', '名': 'người', '時間': 'giờ', '約': 'khoảng', 'から': 'từ',
    "処理能力": "công suất",
    "待機列の人数（合計・直近3分の平均）": "số người trong hàng chờ (tổng · TB 3 phút gần nhất)",
    "複数の待機列カメラは区間を分けて計測し（重複なし）、合計します。": "nhiều camera hàng chờ đếm theo từng đoạn riêng (không trùng) rồi cộng lại.",
    "待機列の区間の比率": "tỷ lệ các đoạn hàng chờ", "区間の比率：合計100%": "tỷ lệ các đoạn: tổng 100%",
    "待機列を区間に分け、各カメラは自分の区間だけを計測します（重複して数えない）。通常時にその区間に並ぶ人の割合を入力してください。カメラが停止したときの推定にも使います。":
      "chia hàng chờ thành các đoạn, mỗi camera chỉ đếm đoạn của mình (không đếm trùng). Nhập tỷ lệ người thường xếp ở mỗi đoạn; tỷ lệ này cũng dùng để ước tính khi một camera ngừng hoạt động.",
    "区間": "đoạn", "推定": "ước tính", "前方": "đoạn trước", "後方": "đoạn sau",
    "待機列カメラが5秒ごとに人数を計測し、直近3分の平均を使います。処理能力 ＝ 1回あたりの座席数 × 1時間あたりの運行回数（アトラクション編集画面で設定）。係数1.15は乗り降りの時間や空席を補正する目安です。結果は5分単位に丸めています。":
      "camera hàng chờ đếm số người mỗi 5 giây và lấy trung bình 3 phút gần nhất. Công suất = số ghế mỗi lượt × số lượt chạy mỗi giờ (cài trong màn hình sửa trò chơi). Hệ số 1,15 là mức hiệu chỉnh ước lượng cho thời gian lên xuống và ghế trống. Kết quả làm tròn theo bội số 5 phút.",
    "待機列カメラ": "camera hàng chờ", "乗り場カメラ": "camera lên tàu",
    "分散案内を通知": "đã gửi hướng dẫn phân tán", "アプリ配信": "gửi qua app",
    "通知のタイトルがここに表示されます": "tiêu đề thông báo sẽ hiển thị ở đây", "ゲストへ送る本文。": "nội dung gửi cho khách.",
  };
  const PUNCT = [[/、/g, ', '], [/。/g, '. '], [/・/g, ' · '], [/（/g, ' ('], [/）/g, ') '], [/「/g, ' “'], [/」/g, '” '], [/：/g, ': '], [/／/g, ' / '], [/[〜～]/g, '–'], [/！/g, '! '], [/？/g, '? '], [/　/g, ' ']];
  const JA = /[぀-ヿ㐀-鿿！-～]/;
  const LOWER_START = /^[人分台件席秒回名]($|[／（(\s])|^[\d\s]/;

  const EXTRA_NAMES = ["メガコースター"];
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let phraseRe = null, names = [], namesSig = '';
  function buildNames() {
    // attraction names + camera places that are themselves names (e.g. ドン・ブラーコ); "メガコースター 待機列" stays translatable
    const places = P.cameras().map(c => c.place).filter(p => !DICT[p] && !/\s/.test(p));
    const list = P.ALL.map(a => a.name).concat(P.rides().map(a => a.name), places, EXTRA_NAMES).filter(n => n && JA.test(n));
    const sig = list.length + ':' + list.join('|').length;
    if (sig === namesSig) return;
    namesSig = sig;
    names = [...new Set(list)].sort((a, b) => b.length - a.length);
    phraseRe = null;
  }
  const namesRe = () => names.length ? new RegExp(names.map(reEsc).join('|'), 'g') : null;
  let nRe = null;
  function phrases() {
    if (!phraseRe) {
      phraseRe = new RegExp(Object.keys(DICT).sort((a, b) => b.length - a.length).map(reEsc).join('|'), 'g');
      nRe = namesRe();
    }
    return phraseRe;
  }

  function tr(src) {
    if (!src || !JA.test(src)) return src;
    buildNames();
    const re = phrases();
    const lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
    let s = src.trim();
    if (Object.prototype.hasOwnProperty.call(DICT, s)) return lead + cap(DICT[s], s) + trail;
    // protect attraction names
    const kept = [];
    if (nRe) s = s.replace(nRe, m => { kept.push(m); return '' + (kept.length - 1) + ''; });
    for (const [r, v] of RULES) { if (r.test(s)) { s = s.replace(r, v); break; } }
    s = s.replace(re, m => ' ' + DICT[m] + ' ');
    PUNCT.forEach(([r, v]) => { s = s.replace(r, v); });
    s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.:;!?)\]”%])/g, '$1').replace(/([(\[“])\s+/g, '$1').trim();
    s = s.replace(/(\d+)/g, (m, i) => kept[i]);
    return lead + cap(s, src.trim()) + trail;
  }
  function cap(s, orig) {
    if (LOWER_START.test(orig)) return s;
    return s.replace(/^([^\p{L}\d]*)(\p{L})/u, (m, pre, c) => pre + c.toUpperCase());   // "← tất cả" → "← Tất cả", "×1.15 → 47.6 phút" unchanged
  }

  /* ---------- DOM ---------- */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function skipEl(el) { return !el || SKIP.has(el.tagName) || (el.closest && el.closest('.noi18n')); }
  function walk(root) {
    if (root.nodeType === 3) { const p = root.parentElement; if (!skipEl(p)) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
    if (root.nodeType !== 1 || skipEl(root)) return;
    const els = (root.closest && root.closest(".noi18n") ? [] : [root]).concat([...root.querySelectorAll('[placeholder],[title],[aria-label]')]);
    els.forEach(el => {
      if (el.closest(".noi18n")) return;   // attributes of <textarea> are translated too
      ATTRS.forEach(a => { const v = el.getAttribute(a); if (v && JA.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } });
    });
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (JA.test(n.nodeValue) && !skipEl(n.parentElement)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => { const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
  }
  let obs = null;
  function run(muts) {
    obs.disconnect();
    try {
      if (!muts) walk(document.body);
      else muts.forEach(m => {
        if (m.type === 'characterData') walk(m.target);
        else if (m.type === 'attributes') walk(m.target);
        else m.addedNodes.forEach(walk);
      });
      if (JA.test(document.title)) document.title = tr(document.title);
    } finally { observe(); }
  }
  function observe() { obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); }

  /* ---------- switch ---------- */
  function mountSwitch() {
    const r = document.querySelector('.top .r');
    if (!r) return;
    const sw = document.createElement('div');
    sw.className = 'langsw noi18n'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Language');
    sw.innerHTML = [['ja', '日本語'], ['vi', 'Tiếng Việt']].map(([k, l]) =>
      `<button type="button" data-lang="${k}" class="${lang === k ? 'on' : ''}" aria-pressed="${lang === k}">${l}</button>`).join('');
    r.insertBefore(sw, r.querySelector('.date'));
    sw.addEventListener('click', e => {
      const b = e.target.closest('[data-lang]');
      if (!b || b.dataset.lang === lang) return;
      try { localStorage.setItem(KEY, b.dataset.lang); } catch (err) { /* ignore */ }
      location.reload();
    });
  }

  mountSwitch();
  if (lang === 'vi') {
    document.documentElement.lang = 'vi';
    document.documentElement.classList.add('lang-vi');
    const oc = window.confirm.bind(window);
    window.confirm = m => oc(tr(String(m)));
    obs = new MutationObserver(run);
    run(null);
  }
  window.PPi18n = { lang, tr };
})();
