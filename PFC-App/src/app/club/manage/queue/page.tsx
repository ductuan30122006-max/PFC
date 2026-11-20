"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { useClub } from "@/modules/club/session";
import { PRIORITY, fmtDate } from "@/modules/club/types";
import { Avatar } from "@/modules/club/ui/Avatar";
import { AppHeader, Badge, Button, Card, EmptyState, Section } from "@/ui";
import { FormError } from "@/ui/Form";

/** Club approval queue (ADR-008 D): pending memberships + tasks waiting for review. */
export default function ClubQueuePage() {
  const { home, can, act } = useClub();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const memberships = can("approve_memberships") ? (home.approvalQueue?.memberships ?? []) : [];
  const reviews = can("review_tasks") ? (home.approvalQueue?.taskReviews ?? []) : [];

  async function decide(membershipId: string, to: "active" | "rejected") {
    setBusy(membershipId);
    setErr(null);
    try {
      await act("membership_transition", { membershipId, to, note: to === "rejected" ? "Từ chối từ hàng chờ duyệt" : undefined });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <AppHeader back backFallback="/club/more" title="Hàng chờ duyệt" />
      {memberships.length === 0 && reviews.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Không có mục nào chờ duyệt" description="Yêu cầu tham gia và công việc gửi duyệt sẽ xuất hiện ở đây." />
      ) : (
        <>
          {err && (
            <div className="px-4">
              <FormError message={err} />
            </div>
          )}
          {memberships.length > 0 && (
            <Section title={`Yêu cầu tham gia (${memberships.length})`}>
              <div className="space-y-3">
                {memberships.map((m) => (
                  <Card key={m.id}>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.fullName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-ink">{m.fullName}</p>
                        <p className="truncate text-[12px] text-muted">
                          {m.email} · {fmtDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                    {m.joinReason && <p className="mt-2 text-[14px] text-ink-2">“{m.joinReason}”</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button variant="secondary" className="min-h-10 text-[14px]" disabled={busy === m.id} onClick={() => decide(m.id, "rejected")}>
                        Từ chối
                      </Button>
                      <Button className="min-h-10 text-[14px]" disabled={busy === m.id} onClick={() => decide(m.id, "active")}>
                        Duyệt
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          )}
          {reviews.length > 0 && (
            <Section title={`Công việc chờ duyệt (${reviews.length})`}>
              <ul className="space-y-2">
                {reviews.map((t) => (
                  <li key={t.id}>
                    <Link href={`/club/tasks/${t.id}`} className="pressable flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3.5">
                      <span className="truncate text-[15px] font-semibold text-ink">{t.title}</span>
                      <Badge tone={PRIORITY[t.priority]?.tone ?? "muted"}>{PRIORITY[t.priority]?.label ?? t.priority}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}
