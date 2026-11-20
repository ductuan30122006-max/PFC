"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createQuizAction } from "@/modules/education/server/actions";
import { AppHeader, Button } from "@/ui";
import { FormError, SelectInput, TextArea, TextInput } from "@/ui/Form";
import { useAction } from "@/ui/use-action";

/** EDU-A05 Quiz/Test Management — create. */
export default function NewQuizPage() {
  const router = useRouter();
  const [v, setV] = useState({ title: "", description: "", topic: "finance", passPct: "70" });
  const { run, pending, error } = useAction();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <AppHeader back backFallback="/learn/manage" title="Bài kiểm tra mới" />
      <form
        className="space-y-4 px-4 pt-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run(() => createQuizAction({ ...v, passPct: Number(v.passPct) }), (id) => router.replace(`/learn/manage/quizzes/${id}`));
        }}
      >
        <TextInput label="Tên bài kiểm tra" value={v.title} onChange={set("title")} maxLength={120} />
        <TextArea label="Mô tả" value={v.description} onChange={set("description")} maxLength={1000} />
        <div className="grid grid-cols-2 gap-3">
          <SelectInput label="Chủ đề" value={v.topic} onChange={set("topic")}>
            <option value="finance">Tài chính</option>
            <option value="development">Phát triển bản thân</option>
          </SelectInput>
          <TextInput label="Điểm đạt (%)" type="number" inputMode="numeric" min={1} max={100} value={v.passPct} onChange={set("passPct")} />
        </div>
        <FormError message={error} />
        <Button type="submit" block disabled={pending}>
          {pending ? "Đang tạo…" : "Tạo và thêm câu hỏi"}
        </Button>
      </form>
    </>
  );
}
