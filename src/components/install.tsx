import type { ReactNode } from "react";
import { CheckCircle2, Download, MoreVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import type { InstallPlatform } from "../lib/pwa";
import { THEME } from "../lib/festival";
import { Sheet } from "./ui";

export function InstallAppCard({ promptAvailable, onInstall }: { promptAvailable: boolean; onInstall: () => void }) {
  return (
    <button
      type="button"
      onClick={onInstall}
      aria-haspopup="dialog"
      className="w-full mb-4 rounded-2xl p-3.5 text-left bg-white border-2 shadow-sm active:scale-[0.98] transition-transform flex items-center gap-3"
      style={{ borderColor: `${THEME.purple}33` }}
    >
      <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ background: THEME.festGradient }}>
        <Download size={21} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-black" style={{ color: THEME.ink }}>ホーム画面に追加</span>
        <span className="block text-[11px] font-bold text-stone-500 mt-0.5">
          {promptAvailable ? "タップしてこの端末へインストール" : "iPhone・Androidどちらでも使えます"}
        </span>
      </span>
      <span className="text-xs font-black whitespace-nowrap" style={{ color: THEME.pinkDeep }}>追加する →</span>
    </button>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center flex-shrink-0" style={{ background: THEME.festGradient }}>{number}</span>
      <span className="text-sm text-stone-700 font-bold leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}

export function InstallInstructionsSheet({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  const iosFirst = platform !== "android";
  const ios = (
    <section className="rounded-2xl bg-white border border-stone-200 p-4" aria-labelledby="install-ios-title">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone size={18} className="text-blue-600" strokeWidth={2.4} aria-hidden="true" />
        <h3 id="install-ios-title" className="font-black text-stone-900">iPhone・iPad</h3>
      </div>
      <ol className="space-y-3">
        <Step number={1}>Safariでこのページを開きます</Step>
        <Step number={2}><Share size={17} className="inline text-blue-600 mr-1 -mt-0.5" aria-hidden="true" />共有ボタンをタップします</Step>
        <Step number={3}><PlusSquare size={17} className="inline text-stone-700 mr-1 -mt-0.5" aria-hidden="true" />「ホーム画面に追加」→「追加」を選びます</Step>
      </ol>
      <p className="text-[11px] text-stone-500 leading-relaxed mt-3">項目が見つからない場合は共有メニューを下へスクロールしてください。Safariでの操作が最も確実です。</p>
    </section>
  );
  const android = (
    <section className="rounded-2xl bg-white border border-stone-200 p-4" aria-labelledby="install-android-title">
      <div className="flex items-center gap-2 mb-3">
        <Smartphone size={18} className="text-emerald-600" strokeWidth={2.4} aria-hidden="true" />
        <h3 id="install-android-title" className="font-black text-stone-900">Android</h3>
      </div>
      <ol className="space-y-3">
        <Step number={1}>Chromeでこのページを開きます</Step>
        <Step number={2}><MoreVertical size={17} className="inline text-stone-700 mr-1 -mt-0.5" aria-hidden="true" />右上のメニューをタップします</Step>
        <Step number={3}>「アプリをインストール」または「ホーム画面に追加」を選びます</Step>
      </ol>
    </section>
  );

  return (
    <Sheet onClose={onClose} title="ホーム画面に追加">
      <div className="p-5 space-y-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg,#fff1f7,#f4efff)" }}>
          <CheckCircle2 size={22} className="flex-shrink-0 mt-0.5" style={{ color: THEME.pinkDeep }} strokeWidth={2.4} aria-hidden="true" />
          <div>
            <div className="font-black text-sm" style={{ color: THEME.ink }}>次回から1タップで開けます</div>
            <p className="text-xs text-stone-600 leading-relaxed mt-1">ホーム画面の「まちたいむ」アイコンから、アプリのように起動できます。</p>
          </div>
        </div>
        {iosFirst ? <>{ios}{android}</> : <>{android}{ios}</>}
        <button type="button" onClick={onClose} className="w-full py-3 rounded-2xl text-white font-black text-sm active:scale-[0.98]" style={{ background: THEME.festGradient }}>わかりました</button>
      </div>
    </Sheet>
  );
}
