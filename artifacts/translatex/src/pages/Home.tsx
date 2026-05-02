import { useLocation } from "wouter";
import { Sword, Upload, Wand2, Download, ChevronRight, Sparkles, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <Sword className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-lg tracking-wide text-amber-400">TranslateX</span>
            <span className="text-xs text-muted-foreground mr-1">محرر ترجمة Zelda</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/editor")}>المحرر</Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold" onClick={() => navigate("/process")}>
              ابدأ الآن
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-amber-500/5 blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-emerald-500/5 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/5 blur-3xl" />
          <div className="absolute top-20 right-20 opacity-5 text-[120px] select-none">△</div>
          <div className="absolute bottom-20 left-20 opacity-5 text-[80px] select-none">⚔</div>
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            محرر ترجمة MSBT/SARC المتقدم لألعاب Zelda
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold mb-6 leading-tight">
            <span className="text-foreground">ترجم مملكة</span>{" "}
            <span className="text-amber-400">هايرول</span>{" "}
            <span className="text-foreground">إلى</span>{" "}
            <span className="bg-gradient-to-l from-emerald-400 to-emerald-300 bg-clip-text text-transparent">العربية</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            ارفع ملفات اللعبة .zs، استخرج آلاف النصوص، وترجمها باستخدام 5 محركات ذكاء اصطناعي مع حفظ تلقائي وأدوات إصلاح متقدمة.
          </p>

          <div className="flex flex-wrap gap-4 justify-center">
            <Button
              size="lg"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 h-12 text-base shadow-lg shadow-amber-500/20"
              onClick={() => navigate("/process")}
            >
              <Upload className="w-5 h-5 ml-2" />
              رفع ملفات اللعبة
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border/50 h-12 px-8 text-base hover:bg-card"
              onClick={() => navigate("/editor")}
            >
              <BookOpen className="w-5 h-5 ml-2" />
              فتح المحرر
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">كيف يعمل TranslateX؟</h2>
            <p className="text-muted-foreground">ثلاث خطوات بسيطة من الملف الأصلي إلى الترجمة الكاملة</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "1", icon: <Upload className="w-7 h-7" />, title: "رفع الملفات",
                desc: "ارفع ملف .zs الخاص باللغة وملف القاموس الاختياري. يدعم النظام جميع إصدارات Zelda BOTW/TOTK.",
                color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20",
              },
              {
                step: "2", icon: <Wand2 className="w-7 h-7" />, title: "الترجمة الذكية",
                desc: "اختر من 5 محركات AI: GPT-4o Mini، Gemini، Claude، Google Translate، MyMemory. ترجمة دفعية بسرعة فائقة.",
                color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20",
              },
              {
                step: "3", icon: <Download className="w-7 h-7" />, title: "التصدير",
                desc: "صدّر الترجمة كـ JSON متوافق مع الأدوات الأصلية. راجع الجودة، وأصلح المشاكل تلقائياً.",
                color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20",
              },
            ].map((item) => (
              <div key={item.step} className={`relative rounded-xl border p-6 ${item.bg} backdrop-blur-sm`}>
                <div className={`absolute top-4 left-4 text-4xl font-bold opacity-30 ${item.color} leading-none`}>{item.step}</div>
                <div className={`${item.color} mb-4`}>{item.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">ميزات احترافية</h2>
            <p className="text-muted-foreground">كل ما تحتاجه لترجمة ألعاب Zelda بشكل احترافي</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: "🗜️", title: "فك ضغط ZStandard", desc: "يفك ضغط ملفات .zs تلقائياً ويستخرج أرشيف SARC" },
              { icon: "📝", title: "محرر MSBT", desc: "يقرأ ويكتب ملفات MSBT مع دعم كامل للرموز والوسوم" },
              { icon: "🤖", title: "5 محركات AI", desc: "GPT-4o Mini، Gemini 2.5، Claude، Google، MyMemory" },
              { icon: "🔧", title: "9 أدوات إصلاح", desc: "إصلاح الأقواس، علامات الترقيم، الهمزات، المسافات والمزيد" },
              { icon: "💾", title: "حفظ تلقائي", desc: "IndexedDB مع حفظ كل 1.5 ثانية ولا تفقد بياناتك أبداً" },
              { icon: "📊", title: "إحصاءات الجودة", desc: "مقياس الثقة، نسبة الترجمة، الرموز المفقودة والمزيد" },
              { icon: "🔤", title: "معالجة عربية", desc: "تشكيل الحروف، BiDi، الأرقام العربية، وضع اللام-ألف" },
              { icon: "📚", title: "مسرد Zelda", desc: "مصطلحات مخصصة لـ BOTW/TOTK مع تحقق تلقائي" },
              { icon: "🔍", title: "مراجعة AI ذكية", desc: "مراجعة تلقائية للترجمة مع اقتراح تصحيحات فورية" },
            ].map((f) => (
              <div key={f.title} className="flex gap-3 p-4 rounded-lg border border-border/30 bg-card/30 hover:bg-card/60 transition-colors">
                <span className="text-2xl shrink-0">{f.icon}</span>
                <div>
                  <div className="font-medium text-sm mb-1">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-border/30">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-5xl mb-6">⚔️</div>
          <h2 className="text-3xl font-bold mb-4">ابدأ رحلتك الآن</h2>
          <p className="text-muted-foreground mb-8">
            ارفع ملفاتك وابدأ الترجمة خلال ثوانٍ. لا تسجيل، لا بيانات مرسلة للخوادم، كل شيء في متصفحك.
          </p>
          <Button
            size="lg"
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 h-12 text-base shadow-lg shadow-amber-500/20"
            onClick={() => navigate("/process")}
          >
            رفع ملفات .zs
            <ChevronRight className="w-5 h-5 mr-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 px-4 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sword className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-amber-400">TranslateX</span>
        </div>
        <p>محرر ترجمة Zelda المتقدم — غير رسمي، لأغراض التعريب فقط</p>
      </footer>
    </div>
  );
}
