"use client";

import { useParams } from "next/navigation";
import { CalendarClock, Send, UserRound } from "lucide-react";
import { useState } from "react";
import { useHub } from "@/platform/hub-proxy/client";
import { HubErrorState, ListSkeleton } from "@/platform/hub-proxy/HubStates";
import { CLUB_RUN_HINT, clubPost, useClub } from "@/modules/club/session";
import { PRIORITY, TASK_NEXT, TASK_STATUS_LABEL, fmtDate, fmtDateTime, type TaskDetail, type TaskStatus } from "@/modules/club/types";
import { AppHeader, Badge, Button, Card, Section } from "@/ui";
import { FormError, TextArea } from "@/ui/Form";
import { ProgressBar } from "@/ui/ProgressBar";
import { cx } from "@/ui/cx";

const MOVE_LABEL: Partial<Record<TaskStatus, string>> = {
  todo: "Chuyển sang Cần làm",
  in_progress: "Bắt đầu làm",
  review: "Gửi duyệt",
  cancelled: "Hủy việc",
};

/** Task detail (Club 13-task-modal → full screen on mobile): status FSM, review, checklist, comments. */
export default function ClubTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, reload: reloadClub } = useClub();
  const { data, error, loading, reload } = useHub<TaskDetail>("club", `?action=task_detail&taskId=${encodeURIComponent(id)}`);
  const [comment, setComment] = useState("");
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("");

  if (loading && !data) return <ListSkeleton rows={3} />;
  if (error || !data) {
    return (
      <>
        <AppHeader back backFallback="/club/tasks" title="Công việc" />
        {error && <HubErrorState error={error} onRetry={reload} hubName="Câu lạc bộ" runHint={CLUB_RUN_HINT} />}
      </>
    );
  }
  const t = data.task;
  const done = data.checklist.filter((c) => c.done).length;
  const canReview = t.status === "review" && can("review_tasks");
  const moves = TASK_NEXT[t.status].filter((s) => {
    if (t.status === "review") return false; // review outcome goes through review_task (needs reason rules)
    if (s === "cancelled") return can("manage_tasks");
    return true;
  });

  async function run(key: string, action: string, body: Record<string, unknown>) {
    setBusy(key);
    setErr(null);
    try {
      await clubPost(action, body);
      await Promise.all([reload(), reloadClub()]);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Thao tác thất bại.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AppHeader back backFallback="/club/tasks" title="Chi tiết công việc" />
      <div className="px-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{TASK_STATUS_LABEL[t.status]}</Badge>
          <Badge tone={PRIORITY[t.priority]?.tone ?? "muted"}>Ưu tiên {PRIORITY[t.priority]?.label ?? t.priority}</Badge>
          {t.teamName && <Badge tone="muted">{t.teamName}</Badge>}
        </div>
        <h1 className="mt-3 text-[21px] leading-tight font-extrabold text-ink">{t.title}</h1>
        <ul className="mt-3 space-y-1.5 text-[14px] text-ink-2">
          <li className="flex items-center gap-2">
            <UserRound size={16} className="text-muted" /> {t.assigneeName ?? "Chưa giao"}
          </li>
          <li className="flex items-center gap-2">
            <CalendarClock size={16} className="text-muted" /> Hạn {fmtDate(t.deadline)}
          </li>
        </ul>
        {t.description && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{t.description}</p>}
      </div>

      {err && (
        <div className="px-4 pt-3">
          <FormError message={err} />
        </div>
      )}

      {moves.length > 0 && (
        <Section>
          <div className="flex flex-wrap gap-2">
            {moves.map((to) => (
              <Button
                key={to}
                variant={to === "cancelled" ? "ghost" : "primary"}
                className={cx("min-h-10 text-[14px]", to === "cancelled" && "text-expense")}
                disabled={busy !== null}
                onClick={() => run(to, "task_transition", { taskId: t.id, to })}
              >
                {MOVE_LABEL[to] ?? TASK_STATUS_LABEL[to]}
              </Button>
            ))}
          </div>
        </Section>
      )}

      {canReview && (
        <Section title="Duyệt công việc">
          <Card className="space-y-3">
            <TextArea label="Nhận xét (bắt buộc khi yêu cầu sửa hoặc từ chối)" value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} maxLength={500} />
            <div className="grid grid-cols-3 gap-2">
              <Button className="min-h-10 px-2 text-[13px]" disabled={busy !== null} onClick={() => run("approve", "review_task", { taskId: t.id, decision: "approve", reason: reviewReason || undefined })}>
                Duyệt
              </Button>
              <Button variant="secondary" className="min-h-10 px-2 text-[13px]" disabled={busy !== null} onClick={() => run("changes", "review_task", { taskId: t.id, decision: "request_changes", reason: reviewReason })}>
                Yêu cầu sửa
              </Button>
              <Button variant="danger" className="min-h-10 px-2 text-[13px]" disabled={busy !== null} onClick={() => run("reject", "review_task", { taskId: t.id, decision: "reject", reason: reviewReason })}>
                Từ chối
              </Button>
            </div>
          </Card>
        </Section>
      )}

      <Section title={`Checklist ${data.checklist.length ? `(${done}/${data.checklist.length})` : ""}`}>
        {data.checklist.length > 0 && (
          <ProgressBar className="mb-3" value={(done / data.checklist.length) * 100} label={`Checklist ${done}/${data.checklist.length}`} />
        )}
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {data.checklist.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={c.done}
                  disabled={busy !== null}
                  onChange={() => run(`c-${c.id}`, "toggle_checklist", { itemId: c.id, taskId: t.id, done: !c.done })}
                  className="size-5 accent-[var(--pfc-primary)]"
                />
                <span className={cx("text-[15px]", c.done ? "text-muted line-through" : "text-ink")}>{c.title}</span>
              </label>
            </li>
          ))}
          <li className="flex items-center gap-2 px-3 py-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Thêm mục checklist…"
              aria-label="Thêm mục checklist"
              maxLength={200}
              className="min-h-10 min-w-0 flex-1 bg-transparent px-1 text-[16px] text-ink outline-none placeholder:text-muted"
            />
            <Button
              className="min-h-9 px-3 text-[13px]"
              disabled={!newItem.trim() || busy !== null}
              onClick={async () => {
                if (await run("add-item", "add_checklist", { taskId: t.id, title: newItem.trim() })) setNewItem("");
              }}
            >
              Thêm
            </Button>
          </li>
        </ul>
      </Section>

      <Section title={`Bình luận (${data.comments.length})`}>
        <ul className="space-y-3">
          {data.comments.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[13px] font-semibold text-ink">
                {c.authorName ?? "Thành viên"} <span className="font-normal text-muted">· {fmtDateTime(c.createdAt)}</span>
              </p>
              <p className="mt-1 text-[14px] whitespace-pre-line text-ink-2">{c.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Viết bình luận…"
            aria-label="Viết bình luận"
            className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-[16px] text-ink outline-none placeholder:text-muted focus:border-primary"
          />
          <button
            type="button"
            aria-label="Gửi bình luận"
            disabled={!comment.trim() || busy !== null}
            onClick={async () => {
              if (await run("comment", "add_task_comment", { taskId: t.id, body: comment.trim() })) setComment("");
            }}
            className="pressable grid size-12 place-items-center rounded-full bg-primary text-on-primary disabled:opacity-40"
          >
            <Send size={20} />
          </button>
        </div>
      </Section>
    </>
  );
}
