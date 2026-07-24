import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, ChevronRight, Heart, HelpCircle, Info, MapPin, Minus as MinusIcon, TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  accentFor, allSoldOut, CATEGORIES, computeTrend, formatLocation, formatOrganizer, formatRelative,
  freshness, getStatus, isSoldOut, minutesSince, STALE_MINUTES, THEME, VERY_STALE_MINUTES,
} from "../lib/festival";
import { DEMO_ADMIN_PIN, DEMO_STAFF_PIN, backendConfigured } from "../lib/api";
import type { Booth } from "../types";
import { BoothIcon, Pill, Sheet, Sparkline, StaleBadge, WaitChart } from "./ui";
import logoSrc from "../assets/logo.png";

/* ═══════════ GUEST: BOOTH CARD ═══════════ */

export const BoothCard = ({ booth, onTap, isFavorite, onToggleFavorite }: { booth: Booth; onTap: (b: Booth) => void; isFavorite: boolean; onToggleFavorite: (id: string) => void }) => {
  const f = freshness(booth);
  const showNumber = booth.isOpen && f !== "very_stale";
  const status = getStatus(booth.waitMinutes, booth.isOpen);
  const trend = computeTrend(booth.history);
  const TrendIcon: LucideIcon = trend.dir === "up" ? TrendingUp : trend.dir === "down" ? TrendingDown : MinusIcon;
  const trendColor = trend.dir === "up" ? "#e6206b" : trend.dir === "down" ? "#3ddc97" : "#a8a29e";
  const accent = accentFor(booth.id);

  return (
    <article
      className="group relative w-full text-left rounded-[26px] p-5 transition-all active:scale-[0.98] hover:-translate-y-1 cursor-pointer overflow-hidden anim-pop"
      style={{
        background: "#ffffff",
        boxShadow: `0 2px 0 ${accent}22, 0 10px 24px ${accent}1f`,
        border: `2px solid ${accent}33`,
      }}
    >
      <button
        type="button"
        onClick={() => onTap(booth)}
        aria-label={`${booth.name}の詳細を見る`}
        className="absolute inset-0 z-0 rounded-[24px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-500/50 focus-visible:ring-inset"
      />
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-15 pointer-events-none anim-floaty2"
        style={{ background: accent }} />

      <button
        type="button"
        onClick={() => onToggleFavorite(booth.id)}
        className={`absolute top-3.5 right-3.5 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/70 backdrop-blur hover:scale-110 transition-transform ${isFavorite ? "anim-bobble" : ""}`}
        aria-label={`${booth.name}を${isFavorite ? "お気に入りから外す" : "お気に入りに追加"}`}
        aria-pressed={isFavorite}
      >
        <Heart size={17} fill={isFavorite ? "#ff4d8d" : "none"} stroke={isFavorite ? "#ff4d8d" : "#c4b5cf"} strokeWidth={2.4} />
      </button>

      <div className="flex items-start gap-4 relative z-[1] pointer-events-none">
        <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0f)`, border: `2px solid ${accent}33` }}>
          <BoothIcon booth={booth} size={64} rounded={14} emojiClass="text-4xl" />
        </div>
        <div className="flex-1 min-w-0 pr-9">
          <h3 className="text-[17px] font-extrabold truncate mb-0.5" style={{ color: THEME.ink }}>{booth.name}</h3>
          <div className="text-xs text-stone-500 truncate mb-2 font-medium">{formatOrganizer(booth)} · {formatLocation(booth)}</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Pill color={status.color} soft={status.soft} ring={status.ring}>{status.label}</Pill>
            {allSoldOut(booth) && <Pill color="#dc2626" soft="#fee2e2" ring="#fecaca">完売</Pill>}
            <StaleBadge booth={booth} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between relative z-[1] pointer-events-none">
        <div>
          {showNumber ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[56px] font-black tracking-tight tabular-nums leading-none"
                style={{ color: status.color, letterSpacing: "-0.05em" }}>{booth.waitMinutes}</span>
              <span className="text-sm font-extrabold text-stone-500">分待ち</span>
              {booth.history.length >= 2 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{ color: trendColor, background: `${trendColor}1a` }}>
                  <TrendIcon size={12} strokeWidth={3} />{trend.delta > 0 ? `+${trend.delta}` : trend.delta}
                </span>
              )}
            </div>
          ) : booth.isOpen ? (
            <div className="text-xl font-black" style={{ color: THEME.orange }}>確認中…</div>
          ) : (
            <div className="text-2xl font-black text-stone-400">準備中</div>
          )}
          <div className="text-xs text-stone-400 mt-1 font-medium">更新: {formatRelative(booth.lastUpdated)}</div>
        </div>
        {showNumber && <div className="w-24 h-8"><Sparkline history={booth.history} color={status.color} /></div>}
      </div>
    </article>
  );
};

/* ═══════════ GUEST: BOOTH DETAIL ═══════════ */

const InfoRow = ({ icon: Icon, label, value, multiline }: { icon: LucideIcon; label: string; value: string; multiline?: boolean }) => (
  <div className="flex gap-3">
    <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
      <Icon size={16} strokeWidth={2} className="text-stone-600" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-stone-500 mb-0.5">{label}</div>
      <div className={`text-sm text-stone-900 ${multiline ? "leading-relaxed" : "truncate"}`}>{value || "—"}</div>
    </div>
  </div>
);

export const BoothDetailSheet = ({ booth, onClose, isFavorite, onToggleFavorite }: { booth: Booth; onClose: () => void; isFavorite: boolean; onToggleFavorite: (id: string) => void }) => {
  const f = freshness(booth);
  const showNumber = booth.isOpen && f !== "very_stale";
  const status = getStatus(booth.waitMinutes, booth.isOpen);
  const recent = useMemo(() => (booth.history || []).slice(-20), [booth.history]);

  // このブースへ直接飛べるURL(QRポスターやSNS共有用)
  const [copied, setCopied] = useState(false);
  const shareBooth = async () => {
    const url = `${location.origin}${location.pathname}?b=${encodeURIComponent(booth.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: `${booth.name} | まちたいむ`, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* 共有キャンセル */ }
  };

  return (
    <Sheet onClose={onClose} title="ブース詳細">
      <div className="px-6 pt-2 pb-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: status.soft, border: `1px solid ${status.ring}` }}><BoothIcon booth={booth} size={80} rounded={22} emojiClass="text-5xl" /></div>
          <div className="flex-1 min-w-0 pt-1">
            <div className="text-xs font-semibold text-stone-500 mb-1">{CATEGORIES.find((c) => c.id === booth.category)?.label}</div>
            <h2 className="text-2xl font-black text-stone-900 mb-1 tracking-tight">{booth.name}</h2>
            <div className="text-sm text-stone-500">{formatOrganizer(booth)}</div>
          </div>
          <button onClick={() => onToggleFavorite(booth.id)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-stone-100" aria-label="お気に入り">
            <Heart size={20} fill={isFavorite ? "#dc2626" : "none"} stroke={isFavorite ? "#dc2626" : "#a8a29e"} strokeWidth={2} />
          </button>
        </div>

        {f !== "fresh" && booth.isOpen && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" strokeWidth={2.4} />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong className="font-bold">この情報は{Math.floor(minutesSince(booth.lastUpdated))}分前のものです。</strong>
              {f === "very_stale" ? "実際の待ち時間と大きく異なる可能性があります。直接ブースでご確認ください。" : "最新でない可能性があります。"}
            </div>
          </div>
        )}

        <div className="rounded-3xl p-6 mb-5" style={{ backgroundColor: status.soft, border: `1px solid ${status.ring}` }}>
          <div className="flex items-center justify-between mb-2">
            <Pill color={status.color} soft="#ffffff" ring={status.ring}>{status.label}</Pill>
            <div className="text-xs text-stone-500">更新: {formatRelative(booth.lastUpdated)}</div>
          </div>
          {showNumber ? (
            <div className="flex items-baseline gap-2">
              <span className="text-7xl font-black tracking-tight tabular-nums" style={{ color: status.color, letterSpacing: "-0.05em", lineHeight: 1 }}>{booth.waitMinutes}</span>
              <span className="text-2xl font-bold" style={{ color: status.color }}>分待ち</span>
            </div>
          ) : booth.isOpen ? (
            <div className="text-3xl font-black text-amber-600">確認中…</div>
          ) : (
            <div className="text-3xl font-black text-stone-400">準備中</div>
          )}
          {showNumber && (
            <div className="text-xs text-stone-500 mt-2">🧮 現在 約{booth.peopleInLine}人が待機 · 1回に{booth.capacity}人ずつ案内</div>
          )}
        </div>

        {recent.length >= 2 && (
          <div className="rounded-2xl p-4 mb-5 bg-white border border-stone-200">
            <div className="text-xs font-semibold text-stone-500 mb-2">▼ 待ち時間の推移</div>
            <div className="h-24"><WaitChart history={recent} color={status.color} /></div>
          </div>
        )}

        {(booth.products || []).length > 0 && (
          <div className="rounded-2xl p-4 mb-5 bg-white border border-stone-200">
            <div className="text-xs font-semibold text-stone-500 mb-2.5">🛍️ 販売商品</div>
            <div className="flex flex-wrap gap-2">
              {booth.products.map((p) => {
                const sold = isSoldOut(p);
                const low = !sold && p.stock <= 5;
                return (
                  <span key={p.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${sold ? "bg-stone-100 border-stone-200 text-stone-400 line-through" : low ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                    {p.name}
                    {(p.allergens ?? []).length > 0 && (
                      <span className="text-[9px] font-black text-rose-600 no-underline" style={{ textDecoration: "none" }}>⚠{(p.allergens ?? []).join("・")}</span>
                    )}
                    {sold ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-600 text-white no-underline" style={{ textDecoration: "none" }}>売り切れ</span>
                      : low ? <span className="text-[9px] font-black text-amber-600">残りわずか</span>
                      : <span className="text-[9px] font-black text-emerald-600">販売中</span>}
                  </span>
                );
              })}
            </div>
            {booth.products.some((p) => (p.allergens ?? []).length > 0) && (
              <div className="text-[10px] text-stone-400 mt-2.5 leading-relaxed">⚠ はアレルギー表示(特定原材料8品目・目安)です。必ずブースの掲示とスタッフにご確認ください。</div>
            )}
          </div>
        )}

        <div className="space-y-2.5">
          <InfoRow icon={MapPin} label="場所" value={formatLocation(booth)} />
          <InfoRow icon={Info} label="紹介" value={booth.description} multiline />
        </div>

        <button onClick={() => void shareBooth()}
          className="w-full mt-5 py-3 rounded-2xl border border-stone-200 bg-white text-stone-600 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
          🔗 {copied ? "リンクをコピーしました！" : "このブースを共有"}
        </button>
      </div>
    </Sheet>
  );
};

/* ═══════════ ONBOARDING ═══════════ */

export const Onboarding = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const slides = [
    { emoji: "🎪", title: "ようこそ！", body: "文化祭の待ち時間が、スマホでリアルタイムに分かるアプリです。並ぶ前にサッと確認できます。" },
    { emoji: "👀", title: "お客さんの使い方", body: "「ホーム」タブで全ブースの混み具合がひと目で。緑=空いてる、赤=混雑。♡でお気に入り登録もできます。" },
    { emoji: "🛠", title: "スタッフの使い方", body: "「スタッフ」タブからPINを入力。担当ブースを選び、お客さんを案内するたびにボタンを押すだけ。待ち時間は自動計算されます。" },
    { emoji: "📲", title: "ホーム画面に追加", body: "ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように一発で開けます。当日URLを探さずに済みます。" },
  ];
  const last = step === slides.length - 1;
  const s = slides[step]!;
  return (
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: THEME.festGradientSoft }}>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {step === 0
          ? <img src={logoSrc} alt="まちたいむ" className="w-64 max-w-[80%] mb-6" style={{ animation: "bounceIn 0.5s" }} />
          : <div className="text-8xl mb-8" style={{ animation: "bounceIn 0.5s" }}>{s.emoji}</div>}
        <h2 className="text-3xl font-black mb-3 tracking-tight" style={{ color: THEME.ink }}>{s.title}</h2>
        <p className="text-sm text-stone-600 leading-relaxed max-w-xs font-medium">{s.body}</p>
      </div>
      <div className="px-8 pb-10">
        <div className="flex justify-center gap-1.5 mb-6">
          {slides.map((_, i) => (
            <div key={i} className="h-2 rounded-full transition-all" style={{ width: i === step ? 26 : 8, background: i === step ? THEME.pink : "#e7c9d9" }} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="px-5 py-3.5 rounded-2xl border-2 bg-white font-bold text-sm active:scale-95" style={{ color: THEME.ink, borderColor: `${THEME.purple}33` }}>戻る</button>
          )}
          <button onClick={() => (last ? onDone() : setStep(step + 1))}
            className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm active:scale-95 shadow-lg" style={{ background: THEME.festGradient }}>
            {last ? "はじめる 🎉" : "次へ"}
          </button>
        </div>
        {!last && <button onClick={onDone} className="w-full mt-3 text-xs text-stone-400 font-semibold">スキップ</button>}
      </div>
    </div>
  );
};

/* ═══════════ HELP SHEET ═══════════ */

// 来場者向けQ&A(やなぎ祭マニュアル第1部・第2部の内容に基づく)
const GUEST_FAQS = [
  { q: "開催日と時間は？", a: "8月29日(土)・30日(日)の2日間、午前10時〜午後4時です。校舎への入場は15:30まで、各ステージ発表は15:20ごろまでです。" },
  { q: "待ち時間や混雑はどこで見られる？", a: "このアプリのホームで、各企画の待ち時間・混雑・売り切れがリアルタイムに分かります。上の「⚡すぐ入れる」で空いている企画だけを絞り込めます。マップタブで場所も確認できます。" },
  { q: "どんな企画があるの？", a: "各クラスの体験・ゲーム・お化け屋敷、食品販売、部活動の展示・発表、体育館ステージでの音楽・ダンス発表、グラウンドでの招待試合(野球部・ハンドボール部)などがあります。" },
  { q: "ステージ発表は何時から？", a: "体育館ステージは両日とも10:30〜15:20ごろに発表があります。ステージタブでタイムテーブルと「まもなく開演」を確認できます。演劇部・音楽部・放送部などの公演も、決まり次第ステージタブに追加されます。" },
  { q: "食べ物は買える？食べ歩きはできる？", a: "食品販売のクラスがあります(個包装の市販食品が中心です)。食べ歩きはできません。「かえる広場」のイートインスペースや、各団体が案内する飲食エリアでお召し上がりください。" },
  { q: "アレルギーが心配です", a: "商品にアレルギー表示(卵・乳・小麦など特定原材料8品目・目安)が付く場合は、ブースの詳細画面で確認できます。表示はあくまで目安のため、召し上がる前に必ず各ブースの掲示・スタッフにご確認ください。" },
  { q: "落とし物・迷子になったら？", a: "ホームの「お知らせ掲示板」に情報を掲示します。見つからないときは、受付や近くのスタッフ、運営本部へお声がけください。けが・体調不良のときは保健室(救護)へ。" },
  { q: "トイレや休憩場所は？", a: "トイレは各校舎にあります。マップタブでおおよその位置を確認できます。飲食はイートインスペース(かえる広場)などをご利用ください。" },
  { q: "写真撮影・SNSは？", a: "撮影は可能ですが、他の来場者や生徒が写り込んだ写真のSNS公開はご配慮ください。各企画で撮影をお断りしている場合は、スタッフの案内に従ってください。" },
  { q: "アプリの表示がおかしい・最新にならない", a: "一度ページを再読み込みしてください(パソコンは Ctrl+F5)。ホーム画面に追加している場合は、一度閉じて開き直すと最新になります。" },
];

const STAFF_FAQS = [
  { q: "PINを忘れた / 知らない", a: "ブース班長か実行委員に確認してください。お客さんとして見るだけなら「ホーム」タブでPINなしで閲覧できます。全体管理(お知らせ・復元・PIN変更)は管理者PINが必要です。" },
  { q: "待ち時間が0分なのに行列がある", a: "そのブースの担当者が人数を入力していません。スタッフモードから列の人数を入力してください。" },
  { q: "情報が古いと表示される", a: `${STALE_MINUTES}分以上更新がないと「更新待ち」、${VERY_STALE_MINUTES}分以上で数字が隠れます。担当者がアプリを開いて操作すれば自動で新しくなります。` },
  { q: "「ご案内しました」を押し間違えた", a: "1分以内なら、ボタンのすぐ下に「取り消す」が出ます。それを押せば元に戻ります。" },
  { q: "ステージ発表の時間割を追加したい", a: "スタッフ→ステージ進行を管理→会場を選んで「公演を追加」。体育館ステージのほか、演劇部・音楽部・放送部など会場ごとに登録できます(新しい会場名を入力すると一覧に追加されます)。" },
  { q: "2人で同じブースを操作したい", a: "同時更新による上書きは防止され、競合時は最新情報の再読込を案内します。混乱を防ぐため、通常は1ブース1端末を推奨します。" },
  { q: "電波が悪くて更新できない", a: "更新は端末に保留され、電波が戻ると自動で送信されます。画面上部にオフライン表示が出ている間は、紙やホワイトボードの掲示も併用してください。" },
  { q: "データが消えないか心配", a: "各ブースは別々に保存されるので、他のブースの操作で消えることはありません。設定画面からバックアップ(書き出し)ができ、管理者はサーバー側のスナップショットからワンタップで復元できます。" },
  { q: "ホーム画面に追加するには", a: "iPhone(Safari)は共有ボタン→「ホーム画面に追加」。Android(Chrome)はメニュー→「ホーム画面に追加」。" },
  { q: "表示がおかしい・最新にならない", a: "新しいバージョンは自動で取り込まれますが、直らない場合はページを再読み込みしてください(PCはCtrl+F5)。それでも直らなければ、下のビルド日時を添えて実行委員へ連絡してください。" },
];

export const HelpSheet = ({ onClose }: { onClose: () => void }) => {
  const [tab, setTab] = useState<"guest" | "staff">("guest");
  const [open, setOpen] = useState<string | null>(null);
  const faqs = tab === "guest" ? GUEST_FAQS : STAFF_FAQS;
  return (
    <Sheet onClose={onClose} title="よくある質問・使い方">
      <div className="px-5 pb-8 pt-2">
        <div className="flex items-center gap-1 p-1 bg-white rounded-full border border-stone-200 mb-4 w-full">
          {([{ id: "guest", label: "🙋 来場者の方へ" }, { id: "staff", label: "🛠 スタッフの方へ" }] as const).map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setOpen(null); }}
              className={`flex-1 py-2 rounded-full text-xs font-black transition-all ${tab === t.id ? "text-white" : "text-stone-500"}`}
              style={tab === t.id ? { background: "linear-gradient(135deg,#ff4d8d,#9b5de5)" } : {}}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "staff" && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4 mb-4">
            <div className="flex items-center gap-2 mb-1"><BookOpen size={16} className="text-indigo-600" strokeWidth={2.4} /><span className="font-bold text-indigo-900 text-sm">かんたん3ステップ(スタッフ)</span></div>
            <ol className="text-xs text-indigo-900 space-y-1 mt-2 list-decimal list-inside leading-relaxed">
              <li>「スタッフ」タブ → PINを入力</li>
              <li>担当ブースを選んで「運用する」</li>
              <li>お客さんを案内したら「ご案内しました」を押すだけ</li>
            </ol>
          </div>
        )}
        {tab === "guest" && (
          <div className="rounded-2xl p-4 mb-4 text-white" style={{ background: "linear-gradient(120deg,#3ddc97,#4cc9f0)" }}>
            <div className="font-black text-sm mb-0.5">🌿 第53回 やなぎ祭へようこそ！</div>
            <div className="text-xs font-bold text-white/90 leading-relaxed">8/29(土)・30(日) 10:00〜16:00。待ち時間・混雑・売り切れをホームで確認して、楽しい1日を！</div>
          </div>
        )}
        {tab === "staff" && !backendConfigured && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-4 text-xs text-amber-900 leading-relaxed">
            <strong className="font-bold">デモモードで動作中：</strong>データはこの端末の中だけに保存されます。初期PINは 更新用 <span className="font-mono font-black">{DEMO_STAFF_PIN}</span> / 管理者 <span className="font-mono font-black">{DEMO_ADMIN_PIN}</span> です。
          </div>
        )}
        <div className="space-y-2">
          {faqs.map((f) => {
            const key = `${tab}-${f.q}`;
            return (
              <div key={key} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <button onClick={() => setOpen(open === key ? null : key)} className="w-full flex items-center gap-2 p-4 text-left active:bg-stone-50">
                  <HelpCircle size={16} className="text-stone-400 flex-shrink-0" strokeWidth={2.2} />
                  <span className="flex-1 font-bold text-stone-900 text-sm">{f.q}</span>
                  <ChevronRight size={16} className={`text-stone-300 transition-transform ${open === key ? "rotate-90" : ""}`} />
                </button>
                {open === key && <div className="px-4 pb-4 text-sm text-stone-600 leading-relaxed">{f.a}</div>}
              </div>
            );
          })}
        </div>
        <div className="text-center text-[11px] text-stone-400 mt-4">ビルド {__BUILD_ID__}</div>
      </div>
    </Sheet>
  );
};
