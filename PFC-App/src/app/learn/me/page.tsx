import Link from "next/link";
import { Award, BookOpen, ClipboardCheck, Clock, PenSquare } from "lucide-react";
import { requireMember, toActor } from "@/platform/auth/session";
import { can } from "@/platform/roles";
import { myLearning } from "@/modules/education/server/service";
import { CourseCard } from "@/modules/education/ui/CourseCard";
import { AppHeader, Badge, ButtonLink, Card, EmptyState, ListGroup, ListItem, Section } from "@/ui";

export const metadata = { title: "Học tập của tôi" };
export const dynamic = "force-dynamic";

/** EDU-13 Learning Progress · EDU-14 My Learning · EDU-15 Certificates · EDU-20 Statistics (mockup 46 / 47). */
export default async function MyLearningPage() {
  const me = await requireMember("/learn/me");
  const actor = toActor(me);
  const { courses, attempts, stats } = await myLearning(actor);
  const done = courses.filter((c) => c.completedAt);
  const active = courses.filter((c) => !c.completedAt);
  const canManage = can(actor, "edu.content.create") || can(actor, "edu.content.approve");

  return (
    <>
      <AppHeader title="Học tập của tôi" backHref="/learn" />
      <Section>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "Khóa học", value: stats.enrolled, icon: BookOpen },
            { label: "Hoàn thành", value: stats.completed, icon: Award },
            { label: "Phút học", value: stats.minutes, icon: Clock },
            { label: "Bài đạt", value: stats.quizzesPassed, icon: ClipboardCheck },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-2.5">
              <Icon size={18} className="mx-auto text-primary" />
              <p className="mt-1 text-[18px] font-extrabold text-ink">{value}</p>
              <p className="text-[11px] text-muted">{label}</p>
            </Card>
          ))}
        </div>
      </Section>

      {canManage && (
        <Section>
          <ListGroup>
            <ListItem icon={PenSquare} title="Quản lý nội dung học tập" description="Khóa học, bài kiểm tra, tài liệu · hàng chờ duyệt" href="/learn/manage" />
          </ListGroup>
        </Section>
      )}

      <Section title="Đang học">
        {active.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Chưa có khóa học đang học"
            action={
              <ButtonLink href="/learn/courses" block>
                Khám phá khóa học
              </ButtonLink>
            }
          />
        ) : (
          <div className="space-y-3">
            {active.map((c) => (
              <CourseCard key={c.id} c={c} progressPct={c.progress.pct} />
            ))}
          </div>
        )}
      </Section>

      {done.length > 0 && (
        <Section title="Chứng chỉ của tôi">
          <ul className="space-y-2">
            {done.map((c) => (
              <li key={c.id}>
                <Link href={`/learn/courses/${c.id}/certificate`} className="pressable flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-warning-soft text-warning">
                    <Award size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{c.title}</span>
                    <span className="block text-[12px] text-muted">Hoàn thành {new Date(c.completedAt!).toLocaleDateString("vi-VN")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {attempts.length > 0 && (
        <Section title="Kết quả kiểm tra">
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {attempts.map((a) => (
              <li key={a.quizId}>
                <Link href={`/learn/quizzes/${a.quizId}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{a.title}</span>
                    <span className="block text-[12px] text-muted">{a.tries} lần làm</span>
                  </span>
                  <Badge tone={a.passed ? "income" : "warning"}>
                    Tốt nhất {a.best}/{a.total}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
