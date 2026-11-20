"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, MapPin, Ticket, Users } from "lucide-react";
import { useState } from "react";
import { useClub } from "@/modules/club/session";
import { fmtDateTime, toDate } from "@/modules/club/types";
import { AppHeader, Badge, Card, EmptyState, SegmentedTabs } from "@/ui";

const STATUS: Record<string, { label: string; tone: "primary" | "income" | "muted" | "warning" }> = {
  draft: { label: "Nháp", tone: "muted" },
  active: { label: "Đang diễn ra", tone: "income" },
  completed: { label: "Đã xong", tone: "primary" },
  archived: { label: "Lưu trữ", tone: "muted" },
};

/** FR-CLB-007 Activities (internal) + FR-CLB-010 linked Shared Events (mockup 108/118). */
export default function ClubActivitiesPage() {
  const { home } = useClub();
  const params = useSearchParams();
  const [tab, setTab] = useState<"activities" | "events">(params.get("tab") === "events" ? "events" : "activities");
  const activities = [...home.activities].sort((a, b) => (toDate(b.startsAt)?.getTime() ?? 0) - (toDate(a.startsAt)?.getTime() ?? 0));

  return (
    <>
      <AppHeader title="Hoạt động" backHref="/club" />
      <div className="px-4">
        <SegmentedTabs
          label="Loại"
          stretch
          value={tab}
          onChange={setTab}
          options={[
            { value: "activities", label: `Hoạt động nội bộ (${home.activities.length})` },
            { value: "events", label: `Sự kiện (${home.links.length})` },
          ]}
        />
      </div>
      {tab === "activities" ? (
        activities.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Chưa có hoạt động" description="Hoạt động nội bộ của CLB (họp, chiến dịch…) sẽ hiện ở đây." />
        ) : (
          <ul className="space-y-3 px-4 pt-3">
            {activities.map((a) => {
              const s = STATUS[a.status] ?? { label: a.status, tone: "muted" as const };
              return (
                <li key={a.id}>
                  <Link href={`/club/activities/${a.id}`} className="pressable block">
                    <Card>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[15px] font-bold text-ink">{a.title}</span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <ul className="mt-2 space-y-1 text-[13px] text-muted">
                        <li className="flex items-center gap-1.5">
                          <CalendarDays size={14} /> {a.startsAt ? fmtDateTime(a.startsAt) : "Chưa có lịch"}
                        </li>
                        {a.location && (
                          <li className="flex items-center gap-1.5">
                            <MapPin size={14} /> {a.location}
                          </li>
                        )}
                        {a.participantCount != null && (
                          <li className="flex items-center gap-1.5">
                            <Users size={14} /> {a.participantCount}
                            {a.capacity ? `/${a.capacity}` : ""} người tham gia
                          </li>
                        )}
                      </ul>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : home.links.length === 0 ? (
        <EmptyState icon={Ticket} title="Chưa liên kết sự kiện" description="Sự kiện (vé, check-in) thuộc Shared Event Engine; CLB chỉ liên kết và hiển thị." />
      ) : (
        <ul className="space-y-3 px-4 pt-3">
          {home.links.map((l) => (
            <li key={l.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[15px] font-bold text-ink">{l.event?.title ?? l.label ?? "Sự kiện"}</span>
                  {l.event?.degraded ? <Badge tone="warning">Tạm không tải được</Badge> : l.event && <Badge>{l.event.mode}</Badge>}
                </div>
                {l.event && (
                  <ul className="mt-2 space-y-1 text-[13px] text-muted">
                    <li className="flex items-center gap-1.5">
                      <CalendarDays size={14} /> {l.event.startsAt ? fmtDateTime(l.event.startsAt) : "—"}
                    </li>
                    {l.event.location && (
                      <li className="flex items-center gap-1.5">
                        <MapPin size={14} /> {l.event.location}
                      </li>
                    )}
                    {l.event.capacity != null && (
                      <li className="flex items-center gap-1.5">
                        <Users size={14} /> {l.event.registeredCount ?? 0}/{l.event.capacity} đã đăng ký
                      </li>
                    )}
                  </ul>
                )}
                <p className="mt-2 text-[12px] text-muted">Đăng ký vé và check-in sẽ có khi Shared Event Engine ra mắt.</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
