import type { Booth, StageItem } from "../types";

/*
 * 令和8年度 やなぎ祭(2026年8月29日(土)・30日(日)一般公開)の実データ。
 * 出典: 参加団体一覧PDF・体育館当日スケジュールxlsx・校内マップPDF。
 * ここを直せばデモの初期データと public/yanagi2026-import.json の両方に反映される
 * (JSONは `npm run data:json` で再生成)。
 */

type RawBooth = Partial<Booth> & { id: string; name: string };

// 企画種別ごとの既定値(1回の案内人数と1回あたりの秒数)。当日スタッフが実測で調整する。
const obake = { category: "attraction", capacity: 4, cycleSeconds: 300 } as const;
const taiken = { category: "experience", capacity: 4, cycleSeconds: 300 } as const;
const escape = { category: "experience", capacity: 6, cycleSeconds: 900 } as const;
const gameB = { category: "game", capacity: 4, cycleSeconds: 240 } as const;
const food = { category: "food", capacity: 3, cycleSeconds: 120 } as const;
const tenji = { category: "exhibition", capacity: 10, cycleSeconds: 60 } as const;

const cls = (grade: number, classNum: number): Pick<Booth, "orgType" | "grade" | "classNum" | "building" | "floor" | "room"> => ({
  orgType: "class",
  grade,
  classNum,
  // HR棟は1年=3F・2年=2F・3年=1F。8組9組は増設棟(3-8はHR棟1F)。
  ...(classNum >= 8 && !(grade === 3 && classNum === 8)
    ? { building: "extra", floor: 4 - grade, room: `${grade}-${classNum}` }
    : { building: "hr", floor: 4 - grade, room: `${grade}-${classNum}` }),
});

const club = (orgName: string, building: string, floor: number, room: string): Pick<Booth, "orgType" | "orgName" | "building" | "floor" | "room"> => ({
  orgType: "club", orgName, building, floor, room,
});

export const YANAGI_BOOTHS: RawBooth[] = [
  // ── クラス企画(参加団体一覧より) ──
  { id: "c1-1", name: "あなたの心を狙い撃ち♡ 〜メイドの1ミリ〜", emoji: "🎀", ...taiken, ...cls(1, 1), description: "1年1組の体験イベント。メイドたちがあなたの心を狙い撃ち！" },
  { id: "c1-2", name: "1の2フォーティー ワン41〜歩き疲れたらつぶつぶ〜", emoji: "🧋", ...food, ...cls(1, 2), description: "1年2組の食品販売。歩き疲れたら、つぶつぶドリンクでひと休み。" },
  { id: "c1-3", name: "血。ー突然の不審死についてー", emoji: "🩸", ...obake, ...cls(1, 3), description: "1年3組のお化け屋敷。突然の不審死、その真相は…。" },
  { id: "c1-4", name: "トイストーリー・マニア！", emoji: "🧸", ...gameB, ...cls(1, 4), description: "1年4組の体験イベント。おもちゃの世界でシューティング！" },
  { id: "c1-5", name: "謎を解け！青木屋敷からの脱出", emoji: "🔐", ...escape, ...cls(1, 5), description: "1年5組の脱出ゲーム。制限時間内に謎を解いて屋敷から脱出せよ。" },
  { id: "c1-6", name: "ピンと的絶対絶命！", emoji: "🎯", ...gameB, ...cls(1, 6), description: "1年6組の的当てゲーム。狙って当てて景品ゲット！" },
  { id: "c1-7", name: "イッツ・ア・スモールワールド", emoji: "🌍", ...taiken, ...cls(1, 7), description: "1年7組の体験イベント。小さな世界を巡る旅へ。" },
  { id: "c1-8", name: "御千後霊〜最後の目撃者（アーカイブ）〜", emoji: "👁️", ...obake, ...cls(1, 8), description: "1年8組のお化け屋敷。最後の目撃者はあなた。" },
  { id: "c1-9", name: "メイドさんと♡乾杯", emoji: "☕", ...food, ...cls(1, 9), description: "1年9組の食品販売。メイドさんと乾杯しませんか？" },
  { id: "c2-1", name: "ヤシロノウシロ", emoji: "⛩️", ...obake, ...cls(2, 1), description: "2年1組のお化け屋敷。社の後ろに潜むものとは…。" },
  { id: "c2-2", name: "坂高第二刑務所からの脱出", emoji: "⛓️", ...escape, ...cls(2, 2), description: "2年2組の脱出ゲーム。無実の罪で投獄されたあなたは脱獄できるか。" },
  { id: "c2-3", name: "不思議の国のメイドカジノ", emoji: "🃏", ...gameB, ...cls(2, 3), description: "2年3組のカジノ体験。不思議の国でメイドと勝負！" },
  { id: "c2-4", name: "世界一周！〜トリックアートミュージアム〜", emoji: "🖼️", ...taiken, ...cls(2, 4), description: "2年4組のトリックアート。世界一周しながら写真映えを狙おう。" },
  { id: "c2-5", name: "気配斬りバトル", emoji: "🥷", ...gameB, ...cls(2, 5), description: "2年5組の対戦ゲーム。目隠しで気配を読んで一太刀！" },
  { id: "c2-6", name: "注文の多い料理店〜あなたは最後まで帰れるか？", emoji: "🍽️", ...obake, ...cls(2, 6), description: "2年6組の体験型ホラー。扉の向こうの注文に、あなたは従えますか。" },
  { id: "c2-7", name: "四肢損々〜私のカラダ探してください〜", emoji: "🦴", ...obake, ...cls(2, 7), description: "2年7組のお化け屋敷。失われたカラダを探して…。" },
  { id: "c2-8", name: "バヤシーズインク", emoji: "🚪", ...taiken, ...cls(2, 8), description: "2年8組の体験イベント。扉の向こうはモンスターの世界。" },
  { id: "c2-9", name: "２－９W杯", emoji: "⚽", ...gameB, ...cls(2, 9), description: "2年9組のスポーツゲーム。目指せ優勝、2-9ワールドカップ！" },
  { id: "c3-1", name: "不思議の国のアイス", emoji: "🍦", ...food, ...cls(3, 1), description: "3年1組の食品販売。不思議の国の冷たいアイスをどうぞ。" },
  { id: "c3-2", name: "ヨシモトピア", emoji: "🎙️", ...taiken, ...cls(3, 2), description: "3年2組のお笑い体験イベント。笑いの理想郷へようこそ。" },
  { id: "c3-3", name: "タムリンカジノ", emoji: "🎰", ...gameB, ...cls(3, 3), description: "3年3組のカジノ体験。チップを増やして豪華景品を狙え！" },
  { id: "c3-4", name: "ライドアンドゴープレイ", emoji: "🎢", ...taiken, ...cls(3, 4), description: "3年4組のライド型アトラクション。乗って遊んで大満足！" },
  { id: "c3-5", name: "妖怪収容区域", emoji: "👹", ...obake, ...cls(3, 5), description: "3年5組のお化け屋敷。収容区域から妖怪が脱走中…。" },
  { id: "c3-6", name: "ジュラシック・パーク", emoji: "🦖", ...taiken, ...cls(3, 6), description: "3年6組の体験イベント。恐竜の世界にようこそ。" },
  { id: "c3-7", name: "ZPD坂戸分署購買部", emoji: "🦊", ...food, ...cls(3, 7), description: "3年7組の食品販売。ZPD坂戸分署の購買部が開店！" },
  { id: "c3-8", name: "賭ケグルイ学園３－８", emoji: "🎴", category: "other", capacity: 5, cycleSeconds: 120, ...cls(3, 8), description: "3年8組の物品販売。賭ケグルイ学園で運試し！" },
  { id: "c3-9", name: "ホーンテッドカクリ", emoji: "🏚️", ...obake, ...cls(3, 9), description: "3年9組のお化け屋敷。隔離された館に足を踏み入れる勇気はあるか。" },

  // ── 部活動・その他団体 ──
  { id: "club-illust", name: "色彩堂", emoji: "🎨", ...tenji, ...club("イラスト・デザイン部", "hr", 3, "多目的室"), description: "イラスト・デザイン部の販売・展示。3階多目的室にて。" },
  { id: "club-kado", name: "華道部", emoji: "🌸", ...tenji, ...club("華道部", "special", 1, "被服室"), description: "華道部の展示。季節の花をいけました。" },
  { id: "club-sado", name: "茶道部", emoji: "🍵", category: "food", capacity: 6, cycleSeconds: 600, ...club("茶道部", "special", 1, "家庭科室"), description: "茶道部のお点前。お茶とお菓子でひと休みしませんか。" },
  { id: "club-engeki", name: "演劇部", emoji: "🎭", category: "stage", capacity: 40, cycleSeconds: 1800, ...club("演劇部", "special", 4, "視聴覚室"), description: "演劇部の公演。視聴覚室にて上演します。" },
  { id: "club-shodo", name: "書道ガールズ&ボーイズ", emoji: "🖌️", ...tenji, ...club("書道部", "special", 3, "書道室"), description: "書道部の作品展示。体育館パフォーマンスもお楽しみに(2日目)。" },
  { id: "club-hoso", name: "放送部", emoji: "📻", ...tenji, ...club("放送部", "special", 3, "地学室"), description: "放送部の展示。" },
  { id: "club-bijutsu", name: "宇宙と哺乳類をめぐる旅", emoji: "🪐", ...tenji, ...club("美術部", "special", 3, "美術室"), description: "美術部の販売・展示・体験。宇宙と哺乳類をめぐる旅へ。" },
  { id: "club-photo", name: "写真部", emoji: "📸", ...tenji, ...club("写真部", "special", 3, "社会科室"), description: "写真部の作品展示。" },
  { id: "club-ongaku", name: "音楽部", emoji: "🎹", category: "stage", capacity: 30, cycleSeconds: 1800, ...club("音楽部", "special", 4, "音楽室"), description: "音楽部の発表。体育館ステージにも出演します(1日目)。" },
  { id: "club-kagaku", name: "サイエンスクラブ", emoji: "🧪", category: "experience", capacity: 8, cycleSeconds: 300, ...club("科学部", "special", 1, "化学室"), description: "科学部の販売・展示・実験体験。化学実験室にて。" },
  { id: "club-yakyu", name: "野球部 招待試合", emoji: "⚾", category: "other", capacity: 50, cycleSeconds: 60, ...club("野球部", "outdoor", 1, "グラウンド"), description: "野球部の招待試合。グラウンドで応援しよう！" },
  { id: "club-hand", name: "ハンドボール部 招待試合", emoji: "🤾", category: "other", capacity: 50, cycleSeconds: 60, ...club("ハンドボール部", "outdoor", 1, "グラウンド"), description: "ハンドボール部の招待試合。" },
  { id: "aus-poster", name: "オーストラリア研修 ポスター掲示", emoji: "🐨", ...tenji, ...club("国際交流", "hr", 2, "2階渡り廊下"), description: "オーストラリア研修の成果ポスターを掲示しています。" },
  { id: "club-bungei", name: "文芸部", emoji: "📚", ...tenji, ...club("文芸部", "hr", 2, "2階多目的室前"), description: "文芸部の部誌・作品展示。" },
  { id: "dosokai", name: "坂戸高校同窓会", emoji: "🏫", category: "other", capacity: 20, cycleSeconds: 60, ...club("同窓会", "gaikoku", 1, "語学学習室"), description: "同窓会による地域連携企画。" },
  { id: "pta", name: "PTA・後援会", emoji: "🤝", category: "other", capacity: 20, cycleSeconds: 60, ...club("PTA・後援会", "hr", 2, "2階多目的室"), description: "PTA・後援会による地域連携企画。" },
];

// 体育館当日スケジュール(8/29・8/30)の発表時間。搬入・搬出は含めない。
export const YANAGI_STAGE_ITEMS: Array<Partial<StageItem> & { id: string }> = [
  { id: "st1-ongaku", emoji: "🎹", day: 1, title: "音楽部", performer: "音楽部", start: "10:30", end: "11:15" },
  { id: "st1-guitar", emoji: "🎸", day: 1, title: "ギター部", performer: "ギター部", start: "11:35", end: "12:05" },
  { id: "st1-suisogaku", emoji: "🎺", day: 1, title: "吹奏楽部", performer: "吹奏楽部", start: "12:30", end: "13:10" },
  { id: "st1-dance", emoji: "💃", day: 1, title: "ダンス部", performer: "ダンス部", start: "13:21", end: "14:19" },
  { id: "st1-skd", emoji: "👑", day: 1, title: "SKD自慢王×歌王", performer: "文化祭実行委員会", start: "14:30", end: "15:15" },
  { id: "st2-galan", emoji: "🎸", day: 2, title: "GALAN", performer: "有志バンド", start: "10:28", end: "10:48" },
  { id: "st2-kujira", emoji: "🐳", day: 2, title: "みなみクジラ", performer: "有志バンド", start: "11:22", end: "11:47" },
  { id: "st2-crone", emoji: "🎵", day: 2, title: "くろーね", performer: "有志バンド", start: "12:08", end: "12:27" },
  { id: "st2-moro", emoji: "🔥", day: 2, title: "もろ‼︎‼︎！限定的カイラク", performer: "有志バンド", start: "12:40", end: "12:55" },
  { id: "st2-hitori", emoji: "🎶", day: 2, title: "ヒトリヨガリ", performer: "有志バンド", start: "13:12", end: "13:35" },
  { id: "st2-baby", emoji: "🎤", day: 2, title: "Baby Smoker", performer: "有志バンド", start: "14:10", end: "14:30" },
  { id: "st2-shodo", emoji: "🖌️", day: 2, title: "書道ガールズ&ボーイズ", performer: "書道部", start: "14:50", end: "15:00" },
];

export const YANAGI_STAGE_NAME = "体育館ステージ";
export const YANAGI_STAGE_LABEL = "やなぎ祭ステージ";
