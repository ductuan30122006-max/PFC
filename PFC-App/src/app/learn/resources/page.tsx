import { ExternalLink, FileText } from "lucide-react";
import { RESOURCE_KIND_LABEL, TOPIC_LABEL } from "@/modules/education/domain/learning";
import { listPublishedResources } from "@/modules/education/server/service";
import { AppHeader, Badge, EmptyState } from "@/ui";
import { FilterChips } from "@/ui/FilterChips";

export const metadata = { title: "Thư viện tài liệu" };
export const dynamic = "force-dynamic";

/** EDU-07/08 Reading · eBook · Templates (mockup 43 / 121). Files are hosted externally (https). */
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const items = await listPublishedResources({ kind });
  return (
    <>
      <AppHeader back backFallback="/learn" title="Thư viện tài liệu" />
      <div className="px-4">
        <FilterChips
          label="Loại tài liệu"
          value={kind && kind in RESOURCE_KIND_LABEL ? kind : "all"}
          hrefFor={(k) => (k === "all" ? "/learn/resources" : `/learn/resources?kind=${k}`)}
          options={[{ value: "all", label: "Tất cả" }, ...Object.entries(RESOURCE_KIND_LABEL).map(([value, label]) => ({ value, label }))]}
        />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={FileText} title="Chưa có tài liệu" />
      ) : (
        <ul className="mx-4 mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {items.map((r) => (
            <li key={r.id}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="pressable flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <FileText size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{r.title}</span>
                  {r.description && <span className="line-clamp-2 block text-[13px] text-muted">{r.description}</span>}
                  <span className="mt-1 flex gap-1.5">
                    <Badge tone="muted">{RESOURCE_KIND_LABEL[r.kind]}</Badge>
                    <Badge tone="muted">{TOPIC_LABEL[r.topic]}</Badge>
                  </span>
                </span>
                <ExternalLink size={18} className="shrink-0 text-muted" aria-label="Mở trong tab mới" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
