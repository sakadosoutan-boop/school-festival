import { useState } from "react";
import { ChevronDown, Route } from "lucide-react";
import { buildingLabel, getStatus, THEME } from "../lib/festival";
import type { Course } from "../lib/guest-helpers";
import { BoothIcon, useDragScroll } from "./ui";

/* ═══════════ おすすめコース ═══════════
   いまのブース情報から自動で作る周遊プラン。棟の行き来が少ない順に並べている。 */

const CourseRow = ({ course, onSelect }: { course: Course; onSelect: (id: string) => void }) => {
  // PCのマウスでも横に流せるように(スクロールバーを隠しているため)
  const pan = useDragScroll<HTMLDivElement>();
  return (
    <div className="mb-1 last:mb-0">
      <div className="flex items-baseline gap-1.5 px-0.5 mb-1.5">
        <span className="text-sm">{course.emoji}</span>
        <span className="font-black text-[13px]" style={{ color: "var(--ink)" }}>{course.title}</span>
        <span className="text-[10px] font-bold text-stone-400">{course.note}</span>
      </div>
      <div {...pan} className="flex gap-2 overflow-x-auto scrollbar-none touch-pan-x -mx-1 px-1 pb-2 cursor-grab active:cursor-grabbing select-none">
        {course.booths.map((booth, index) => {
          const status = getStatus(booth.waitMinutes, booth.isOpen);
          return (
            <button
              key={booth.id}
              onClick={() => onSelect(booth.id)}
              className="flex-shrink-0 w-[126px] rounded-2xl border-2 bg-white p-2 text-left active:scale-95 transition-transform"
              style={{ borderColor: `${THEME.purple}22` }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full text-[9px] font-black text-white flex items-center justify-center flex-shrink-0"
                  style={{ background: THEME.purple }}>{index + 1}</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0" style={{ background: status.soft }}>
                  <BoothIcon booth={booth} size={28} rounded={8} emojiClass="text-base" />
                </div>
                <span className="text-[11px] font-black tabular-nums truncate" style={{ color: status.color }}>
                  {booth.isOpen ? `${booth.waitMinutes}分` : "準備中"}
                </span>
              </div>
              <div className="text-[11px] font-extrabold leading-tight mt-1.5 line-clamp-2" style={{ color: "var(--ink)" }}>{booth.name}</div>
              <div className="text-[10px] text-stone-400 truncate mt-0.5">{buildingLabel(booth.building) || booth.location || "—"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const CourseSuggestions = ({ courses, onSelect, defaultOpen = false }: { courses: Course[]; onSelect: (id: string) => void; defaultOpen?: boolean }) => {
  // 企画一覧が画面下へ押し出されないよう、既定は畳んでおく(見出しだけ残す)。
  // シートの中など、それ自体を見に来た場所では開いた状態で出す。
  const [open, setOpen] = useState(defaultOpen);
  if (courses.length === 0) return null;
  return (
    <section className="mb-4 rounded-2xl bg-white border-2 p-3" style={{ borderColor: `${THEME.blue}44` }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-0.5" aria-expanded={open}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${THEME.blue}22` }}>
          <Route size={15} strokeWidth={2.6} style={{ color: "#2b9dc4" }} />
        </div>
        <span className="font-black text-sm flex-1 text-left" style={{ color: "var(--ink)" }}>🗺️ おすすめコース</span>
        <span className="text-xs font-bold text-stone-400">{courses.length}本</span>
        <ChevronDown size={16} className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.6} />
      </button>
      {open && (
        <div className="mt-2.5">
          {courses.map((course) => <CourseRow key={course.id} course={course} onSelect={onSelect} />)}
          <div className="text-xs text-stone-400 px-0.5">タップすると企画の詳細が開きます · いまの待ち時間から自動で作っています</div>
        </div>
      )}
    </section>
  );
};
