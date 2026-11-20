import { Users } from "lucide-react";
import { AppHeader, ButtonLink, EmptyState } from "@/ui";

export const metadata = { title: "Cộng đồng" };

/** COM-01 Community Hub. The feed/groups/forum come later; Club Management is live now. */
export default function CommunityPage() {
  return (
    <>
      <AppHeader title="Cộng đồng" subtitle="Kết nối · Chia sẻ · Cùng phát triển" />
      <EmptyState
        icon={Users}
        title="Bảng tin cộng đồng sắp ra mắt"
        description="Bài viết, nhóm và diễn đàn của Community Hub sẽ có ở giai đoạn sau. Câu lạc bộ PFC đã hoạt động ngay bây giờ."
        action={
          <ButtonLink href="/club" block>
            Vào Câu lạc bộ PFC
          </ButtonLink>
        }
      />
    </>
  );
}
