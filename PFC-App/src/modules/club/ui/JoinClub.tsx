"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { useState } from "react";
import { Button, Card } from "@/ui";
import { FormError, TextArea, TextInput } from "@/ui/Form";
import { clubPost } from "../session";

/** COM-13 Join Club / COM-20 Private Community: non-members of the private club land here. */
export function JoinClub({ onJoined }: { onJoined: () => void }) {
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<{ pending?: boolean; error?: string; done?: boolean }>({});

  if (state.done) {
    return (
      <div className="flex flex-col items-center px-6 pt-10 text-center">
        <CheckCircle2 size={60} className="text-income" />
        <h2 className="mt-3 text-[20px] font-bold text-ink">Đã gửi yêu cầu tham gia</h2>
        <p className="mt-2 text-[14px] text-muted">Ban điều hành sẽ duyệt yêu cầu của bạn. Bạn sẽ nhận thông báo khi được chấp nhận.</p>
        <Button variant="secondary" className="mt-6" onClick={onJoined}>
          Tải lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card className="flex flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
          <Lock size={26} />
        </span>
        <h2 className="mt-3 text-[18px] font-bold text-ink">Câu lạc bộ riêng tư</h2>
        <p className="mt-1 text-[14px] text-muted">Chỉ thành viên mới xem được nội dung. Gửi yêu cầu tham gia hoặc nhập mã mời.</p>
      </Card>
      <TextArea label="Vì sao bạn muốn tham gia?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      <TextInput label="Mã mời (nếu có)" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="none" />
      <FormError message={state.error} />
      <Button
        block
        disabled={state.pending}
        onClick={async () => {
          setState({ pending: true });
          try {
            await clubPost("join_club", { joinReason: reason.trim() || undefined, inviteCode: code.trim() || undefined });
            setState({ done: true });
          } catch (e) {
            setState({ error: e instanceof Error ? e.message : "Gửi yêu cầu thất bại." });
          }
        }}
      >
        {state.pending ? "Đang gửi…" : "Gửi yêu cầu tham gia"}
      </Button>
    </div>
  );
}
