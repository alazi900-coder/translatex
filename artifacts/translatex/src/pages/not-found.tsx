import { Link } from "wouter";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="h-full flex items-center justify-center" dir="rtl">
      <div className="text-center space-y-4">
        <p className="text-6xl font-bold text-muted-foreground">404</p>
        <p className="text-muted-foreground">الصفحة غير موجودة</p>
        <Button asChild>
          <Link href="/">
            <Home className="w-4 h-4 ml-2" />
            العودة للرئيسية
          </Link>
        </Button>
      </div>
    </div>
  );
}
