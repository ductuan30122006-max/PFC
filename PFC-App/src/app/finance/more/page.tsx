import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartColumn,
  Database,
  MapPin,
  PiggyBank,
  Shapes,
  Target,
  Wrench,
} from "lucide-react";
import { AppHeader, Badge, ListGroup, ListItem, Section } from "@/ui";

export const metadata = { title: "Tiện ích" };

/** Finance hub "Tiện ích" tab: everything that isn't on the other four tabs. */
export default function FinanceMorePage() {
  return (
    <>
      <AppHeader title="Tiện ích tài chính" backHref="/finance" />
      <Section>
        <ListGroup label="Tiết kiệm">
          <ListItem icon={Target} title="Mục tiêu tiết kiệm" description="Theo dõi tiến độ từng mục tiêu" href="/finance/goals" />
          <ListItem icon={PiggyBank} title="Thử thách tiết kiệm" description="Check-in mỗi ngày" href="/finance/challenges" />
        </ListGroup>
      </Section>
      <Section>
        <ListGroup label="Phân tích">
          <ListItem icon={ChartColumn} title="Báo cáo" description="Tháng, quý, năm · xuất CSV" href="/finance/reports" />
          <ListItem icon={ArrowDownLeft} title="Tổng quan thu nhập" href="/finance/overview/income" />
          <ListItem icon={ArrowUpRight} title="Tổng quan chi tiêu" href="/finance/overview/expense" />
        </ListGroup>
      </Section>
      <Section>
        <ListGroup label="Công cụ & dữ liệu">
          <ListItem icon={Wrench} title="Công cụ tài chính" description="Lãi kép, khoản vay, hưu trí, thuế TNCN, lãi suất" href="/finance/tools" />
          <ListItem icon={Shapes} title="Danh mục" description="Thêm, sửa, ẩn danh mục thu chi" href="/finance/categories" />
          <ListItem icon={Database} title="Nhập / Xuất dữ liệu" description="CSV cho Excel, Google Sheets" href="/finance/data" />
        </ListGroup>
      </Section>
      <Section>
        <ListGroup label="Cộng đồng">
          <ListItem
            icon={MapPin}
            title="Ngon – Bổ – Rẻ"
            description="Chia sẻ địa điểm tiết kiệm (FIN-26…34)"
            trailing={<Badge tone="muted">Sắp có</Badge>}
            disabled
          />
        </ListGroup>
      </Section>
    </>
  );
}
