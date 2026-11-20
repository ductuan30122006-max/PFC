"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitAttemptAction } from "@/modules/education/server/actions";
import { Button } from "@/ui";
import { ConfirmSheet } from "@/ui/ConfirmSheet";
import { FormError } from "@/ui/Form";
import { ProgressBar } from "@/ui/ProgressBar";
import { useAction } from "@/ui/use-action";
import { cx } from "@/ui/cx";

/** One question per screen (mockup 44: "Câu 3/10", A–D options, prev/next). */
export function QuizRunner({ quizId, questions, passPct }: { quizId: string; questions: Array<{ id: string; prompt: string; options: string[] }>; passPct: number }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState(false);
  const { run, pending, error } = useAction();
  const q = questions[i];
  const answered = Object.keys(answers).length;
  const last = i === questions.length - 1;

  function submit() {
    run(() => submitAttemptAction(quizId, answers), (attemptId) => router.replace(`/learn/quizzes/attempts/${attemptId}`));
  }

  return (
    <div className="px-4">
      <div className="flex items-center justify-between text-[13px] font-semibold text-ink-2">
        <span>
          Câu {i + 1}/{questions.length}
        </span>
        <span className="text-muted">Đã trả lời {answered}/{questions.length} · đạt từ {passPct}%</span>
      </div>
      <ProgressBar className="mt-2" value={((i + 1) / questions.length) * 100} label={`Câu ${i + 1} trên ${questions.length}`} />
      <h2 className="mt-5 text-[18px] leading-snug font-bold text-ink">{q.prompt}</h2>
      <div className="mt-4 space-y-3" role="radiogroup" aria-label="Đáp án">
        {q.options.map((o, idx) => {
          const chosen = answers[q.id] === idx;
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
              className={cx(
                "pressable flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-[15px]",
                chosen ? "border-primary bg-primary-soft font-semibold text-ink" : "border-line bg-surface text-ink-2",
              )}
            >
              <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold", chosen ? "bg-primary text-on-primary" : "bg-surface-2 text-ink-2")}>
                {String.fromCharCode(65 + idx)}
              </span>
              {o}
            </button>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>
          ‹ Câu trước
        </Button>
        {last ? (
          <Button onClick={() => (answered < questions.length ? setConfirm(true) : submit())} disabled={pending}>
            {pending ? "Đang chấm…" : "Nộp bài"}
          </Button>
        ) : (
          <Button onClick={() => setI(i + 1)}>Câu tiếp ›</Button>
        )}
      </div>
      <div className="mt-3">
        <FormError message={error} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Chuyển nhanh đến câu">
        {questions.map((x, idx) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setI(idx)}
            aria-label={`Câu ${idx + 1}${answers[x.id] !== undefined ? ", đã trả lời" : ""}`}
            className={cx(
              "grid size-9 place-items-center rounded-full text-[13px] font-semibold",
              idx === i ? "bg-primary text-on-primary" : answers[x.id] !== undefined ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted",
            )}
          >
            {idx + 1}
          </button>
        ))}
      </div>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Nộp bài?"
        message={`Bạn còn ${questions.length - answered} câu chưa trả lời. Câu bỏ trống tính là sai.`}
        confirmLabel="Nộp bài"
        danger={false}
        pending={pending}
        onConfirm={submit}
      />
    </div>
  );
}
