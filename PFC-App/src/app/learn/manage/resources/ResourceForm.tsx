"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteContentAction, saveResourceAction, transitionAction } from "@/modules/education/server/actions";
import type { ContentStatus } from "@/platform/workflow";
import { Button, Section } from "@/ui";
import { FormError, SelectInput, TextArea, TextInput } from "@/ui/Form";
import { DocumentUploader } from "@/ui/DocumentUploader";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { WorkflowBar } from "@/ui/WorkflowBar";
import { useAction } from "@/ui/use-action";

type R = { id?: string; title: string; kind: string; topic: string; url: string; description: string; status?: ContentStatus; rejectReason?: string | null; canEdit?: boolean; canApprove?: boolean; isAuthor?: boolean };

/** EDU-A01 resource editor: upload a PDF or link an https document (eBook / template / checklist / article). */
export function ResourceForm({ initial }: { initial?: R }) {
  const router = useRouter();
  const [v, setV] = useState<R>(initial ?? { title: "", kind: "ebook", topic: "finance", url: "", description: "" });
  const { run, pending, error } = useAction();
  const [source, setSource] = useState<"upload" | "link">(initial?.url && !initial.url.startsWith("/api/files/") && !initial.url.includes("/pfc/document/") ? "link" : "upload");
  const editable = !initial || initial.canEdit;
  const set = (k: keyof R) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      {initial?.id && initial.status && (
        <Section>
          <WorkflowBar
            status={initial.status}
            isAuthor={!!initial.isAuthor}
            canApprove={!!initial.canApprove}
            rejectReason={initial.rejectReason}
            canDelete={!!initial.isAuthor && (initial.status === "draft" || initial.status === "rejected")}
            onAction={async (a, r) => {
              const res = await transitionAction("resource", initial.id!, a, r);
              if (res.ok) router.refresh();
              return res.ok ? { ok: true } : res;
            }}
            onDelete={async () => {
              const res = await deleteContentAction("resource", initial.id!);
              if (res.ok) router.replace("/learn/manage");
              return res.ok ? { ok: true } : res;
            }}
          />
        </Section>
      )}
      <form
        className="space-y-4 px-4 pt-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveResourceAction(initial?.id ?? null, { title: v.title, kind: v.kind, topic: v.topic, url: v.url, description: v.description }),
            (id) => (initial?.id ? router.refresh() : router.replace(`/learn/manage/resources/${id}`)),
          );
        }}
      >
        <fieldset disabled={!editable} className="space-y-4">
          <TextInput label="Tên tài liệu" value={v.title} onChange={set("title")} maxLength={160} />
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Loại" value={v.kind} onChange={set("kind")}>
              <option value="ebook">eBook</option>
              <option value="template">Template</option>
              <option value="checklist">Checklist</option>
              <option value="article">Bài viết</option>
            </SelectInput>
            <SelectInput label="Chủ đề" value={v.topic} onChange={set("topic")}>
              <option value="finance">Tài chính</option>
              <option value="development">Phát triển bản thân</option>
            </SelectInput>
          </div>
          <SegmentedTabs
            label="Nguồn tài liệu"
            stretch
            value={source}
            onChange={(s) => {
              setSource(s);
              setV((x) => ({ ...x, url: "" }));
            }}
            options={[
              { value: "upload", label: "Tải lên PDF" },
              { value: "link", label: "Dán link" },
            ]}
          />
          {source === "upload" ? (
            <DocumentUploader value={v.url || null} onChange={(url) => setV((x) => ({ ...x, url: url ?? "" }))} />
          ) : (
            <>
              <TextInput label="Link tải / xem (https)" type="url" inputMode="url" placeholder="https://drive.google.com/…" value={v.url} onChange={set("url")} />
              <p className="-mt-2 text-[12px] text-muted">Tệp ở Google Drive, Notion…: bật quyền xem cho mọi người có link.</p>
            </>
          )}
          <TextArea label="Mô tả" value={v.description} onChange={set("description")} maxLength={1000} />
          <p className="text-[12px] text-muted">Chỉ đăng tài liệu bạn có quyền chia sẻ. Tài liệu được Ban Chuyên môn duyệt trước khi hiện công khai.</p>
          <FormError message={error} />
          <Button type="submit" block disabled={pending}>
            {pending ? "Đang lưu…" : initial?.id ? "Lưu thay đổi" : "Tạo tài liệu"}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
