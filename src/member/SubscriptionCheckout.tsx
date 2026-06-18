import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { 
  Shield, 
  CreditCard, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  AlertCircle,
  Building,
  Mail,
  User,
  Globe,
  Loader2,
  Sparkles,
  Check,
  Sun,
  Moon
} from 'lucide-react';

export default function SubscriptionCheckout() {
  const { language, toggleLanguage, isRtl } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  // Form states
  const [gymName, setGymName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  
  // Card states
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');

  // Status states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    requestId: string;
    gymName: string;
    subdomain: string;
    ownerEmail: string;
    transactionId: string;
  } | null>(null);

  // Localization Dictionary
  const content = {
    en: {
      title: "Launch Your Gym CRM Workspace",
      subtitle: "Join the most powerful gym management platform in Egypt. Set up your custom workspace in minutes.",
      gymDetails: "Gym Workspace Details",
      gymNameLabel: "Gym / Club Name",
      gymNamePlaceholder: "e.g., Cairo Iron Fitness",
      subdomainLabel: "Custom CRM Subdomain",
      subdomainPlaceholder: "e.g., cairo-iron",
      subdomainHelp: "Your workspace will be accessed via: [subdomain].mitrixogymcrm.com",
      ownerDetails: "Owner Account Details",
      ownerNameLabel: "Full Name",
      ownerNamePlaceholder: "e.g., Ahmed Ali",
      ownerEmailLabel: "Email Address",
      ownerEmailPlaceholder: "e.g., ahmed@example.com",
      paymentDetails: "Simulated Payment Details",
      paymentHelp: "Use any mock card details to simulate your checkout.",
      cardNumberLabel: "Card Number",
      cardExpiryLabel: "Expiry Date",
      cardCvcLabel: "CVC",
      cardholderNameLabel: "Cardholder Name",
      premiumPlan: "Mitrixo CRM Premium",
      premiumPrice: "99 / Month",
      premiumCurrency: "USD",
      featuresTitle: "Included Premium Features:",
      feature1: "Complete Member & Lead Management",
      feature2: "Attendance QR Scanning & Kiosk Access",
      feature3: "Coach Portal & Group Session Booking",
      feature4: "Dynamic Storefront / Client Portal",
      feature5: "Finance Analytics & Automated Invoicing",
      feature6: "Super Admin Platform Security Rules",
      checkoutBtn: "Complete Checkout & Subscribe",
      submittingBtn: "Processing Secure Payment...",
      validationErrorSubdomain: "Subdomain must contain only lowercase letters, numbers, and hyphens.",
      validationErrorFields: "Please fill out all required fields.",
      successTitle: "Subscription Request Registered!",
      successMessage: "Thank you for subscribing! Your request is currently pending approval by the Platform Super Admin. Once verified, a welcome email with your temporary access credentials will be sent to your email address.",
      successGym: "Gym Name",
      successSubdomain: "CRM Workspace",
      successEmail: "Registered Email",
      successStatus: "Status",
      successStatusVal: "Pending Super Admin Verification",
      successTx: "Transaction ID",
      backToHome: "Return to Main Portal",
      arabicBtn: "العربية",
      englishBtn: "English"
    },
    ar: {
      title: "أطلق منصة إدارة الجيم الخاصة بك",
      subtitle: "انضم إلى أقوى منصة لإدارة نوادي اللياقة البدنية في مصر. أنشئ بيئة العمل الخاصة بك في دقائق معدودة.",
      gymDetails: "تفاصيل بيئة عمل الجيم",
      gymNameLabel: "اسم الجيم / النادي",
      gymNamePlaceholder: "مثال: كايرو أيرون فتنس",
      subdomainLabel: "نطاق فرعي مخصص للمنصة",
      subdomainPlaceholder: "مثال: cairo-iron",
      subdomainHelp: "سيتم الدخول إلى لوحة التحكم الخاصة بك عبر: [subdomain].mitrixogymcrm.com",
      ownerDetails: "تفاصيل حساب المالك",
      ownerNameLabel: "الاسم الكامل",
      ownerNamePlaceholder: "مثال: أحمد علي",
      ownerEmailLabel: "البريد الإلكتروني",
      ownerEmailPlaceholder: "مثال: ahmed@example.com",
      paymentDetails: "تفاصيل الدفع المحاكي",
      paymentHelp: "استخدم أي تفاصيل بطاقة وهمية لإتمام عملية الدفع التجريبية.",
      cardNumberLabel: "رقم البطاقة",
      cardExpiryLabel: "تاريخ الانتهاء",
      cardCvcLabel: "رمز التحقق (CVC)",
      cardholderNameLabel: "اسم صاحب البطاقة",
      premiumPlan: "ميتريكسو CRM بريميوم",
      premiumPrice: "99 / شهرياً",
      premiumCurrency: "دولار",
      featuresTitle: "المزايا الاحترافية المضمنة:",
      feature1: "إدارة كاملة للأعضاء والعملاء المحتملين",
      feature2: "تسجيل الحضور عبر مسح الرمز QR والخدمة الذاتية",
      feature3: "بوابة المدربين وحجز الجلسات الجماعية",
      feature4: "متجر ديناميكي وبوابة متكاملة للعملاء",
      feature5: "التحليلات المالية والفواتير التلقائية",
      feature6: "قواعد حماية منصة المشرف العام والأمان",
      checkoutBtn: "إتمام الدفع والاشتراك",
      submittingBtn: "جاري معالجة الدفع بأمان...",
      validationErrorSubdomain: "يجب أن يحتوي النطاق الفرعي على أحرف صغيرة وأرقام وواصلات فقط.",
      validationErrorFields: "يرجى ملء جميع الحقول المطلوبة.",
      successTitle: "تم تسجيل طلب الاشتراك بنجاح!",
      successMessage: "شكرًا لك على الاشتراك! طلبك قيد المراجعة والموافقة حالياً من قبل المشرف العام للمنصة. بمجرد تفعيل الحساب، سنرسل إليك رسالة ترحيبية تحتوي على بيانات الدخول المؤقتة إلى بريدك الإلكتروني.",
      successGym: "اسم الجيم",
      successSubdomain: "لوحة تحكم CRM",
      successEmail: "البريد الإلكتروني المسجل",
      successStatus: "حالة الطلب",
      successStatusVal: "في انتظار تفعيل المشرف العام",
      successTx: "رقم المعاملة",
      backToHome: "العودة للبوابة الرئيسية",
      arabicBtn: "العربية",
      englishBtn: "English"
    }
  };

  const t = (key: keyof typeof content.en) => {
    return content[language === 'ar' ? 'ar' : 'en'][key];
  };

  const handleSubdomainChange = (val: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(cleaned);
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substring(0, 16);
    // Format card number with spaces every 4 digits
    const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (value.length >= 2) {
      setCardExpiry(value.substring(0, 2) + '/' + value.substring(2));
    } else {
      setCardExpiry(value);
    }
  };

  const handleCvcChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substring(0, 4);
    setCardCvc(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic fields validation
    if (!gymName.trim() || !subdomain.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setError(t('validationErrorFields'));
      return;
    }

    // Subdomain validation
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      setError(t('validationErrorSubdomain'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/subscription-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gymName,
          subdomain,
          ownerName,
          ownerEmail,
          amountPaid: 99,
          paymentMethod: 'Credit Card (Simulated)',
          transactionId: `TX-${Math.random().toString(36).substring(2, 12).toUpperCase()}`
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit subscription request.');
      }

      setSuccessData({
        requestId: data.requestId,
        gymName,
        subdomain,
        ownerEmail,
        transactionId: `TX-${Math.random().toString(36).substring(2, 12).toUpperCase()}` // simulated tx code
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 md:p-8 font-cairo">
        <Card className="w-full max-w-2xl border-border/80 bg-card/60 backdrop-blur-xl shadow-2xl relative overflow-hidden rounded-3xl animate-in zoom-in-95 duration-300">
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
          
          <CardHeader className="text-center pt-8 pb-4">
            <div className="mx-auto h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 animate-pulse" />
            </div>
            <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
              {t('successTitle')}
            </CardTitle>
            <CardDescription className="text-muted-foreground max-w-lg mx-auto text-sm md:text-base leading-relaxed mt-2">
              {t('successMessage')}
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 md:px-10 pb-8 space-y-6">
            <div className="rounded-2xl bg-muted/40 border border-border/50 p-6 space-y-4">
              <div className="flex justify-between items-center text-sm border-b border-border/30 pb-2">
                <span className="text-muted-foreground font-semibold">{t('successGym')}</span>
                <span className="font-bold text-foreground">{successData.gymName}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/30 pb-2">
                <span className="text-muted-foreground font-semibold">{t('successSubdomain')}</span>
                <span className="font-bold text-primary">{successData.subdomain}.mitrixogymcrm.com</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/30 pb-2">
                <span className="text-muted-foreground font-semibold">{t('successEmail')}</span>
                <span className="font-bold text-foreground">{successData.ownerEmail}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border/30 pb-2">
                <span className="text-muted-foreground font-semibold">{t('successStatus')}</span>
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs font-bold px-2 py-0.5 rounded-full">
                  {t('successStatusVal')}
                </Badge>
              </div>
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-muted-foreground font-semibold">{t('successTx')}</span>
                <span className="font-mono text-xs bg-muted border px-2.5 py-1 rounded-lg text-foreground font-bold">
                  {successData.transactionId}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button 
                onClick={() => {
                  window.history.pushState({}, '', '/');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="w-full h-12 text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 rounded-xl flex items-center justify-center gap-2"
              >
                {isRtl ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                {t('backToHome')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-cairo">
      {/* Top Navbar */}
      <header className="border-b bg-card/40 backdrop-blur-md sticky top-0 z-50 h-16 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <span className="text-lg font-logo tracking-[0.1em] uppercase text-primary font-bold">
            MITRIXO GYM CRM
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
            className="h-8 px-2.5 text-xs font-bold flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 hover:bg-muted text-foreground"
          >
            <span>🌐</span>
            <span>{language === 'en' ? t('arabicBtn') : t('englishBtn')}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8 rounded-lg" title="Toggle Theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 md:py-16 flex flex-col justify-center gap-8 lg:gap-12">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Launch Your Workspace</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Plan Summary Card (Right Column on desktop, first on mobile) */}
          <div className="lg:col-span-5 lg:order-2 space-y-6">
            <Card className="border-primary/20 bg-card/60 backdrop-blur-md shadow-xl rounded-3xl relative overflow-hidden">
              <div className="absolute top-0 right-0 h-32 w-32 bg-primary/5 rounded-full blur-3xl -z-10" />
              <CardHeader className="border-b border-border/50 pb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge className="bg-primary text-primary-foreground font-bold mb-2 text-xs">
                      PREMIUM PLAN
                    </Badge>
                    <CardTitle className="text-xl font-bold text-foreground">
                      {t('premiumPlan')}
                    </CardTitle>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-foreground">
                      ${t('premiumPrice').split(' ')[0]}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      /{t('premiumPrice').split(' ')[2]}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">
                <h4 className="text-sm font-bold text-foreground">
                  {t('featuresTitle')}
                </h4>
                <ul className="space-y-3.5 text-xs text-muted-foreground">
                  {[
                    t('feature1'),
                    t('feature2'),
                    t('feature3'),
                    t('feature4'),
                    t('feature5'),
                    t('feature6')
                  ].map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center mt-0.5 flex-shrink-0">
                        <Check className="h-3 w-3" />
                      </div>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Checkout & Form Column (Left Column on desktop) */}
          <div className="lg:col-span-7 lg:order-1">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Workspace Details */}
              <Card className="border-border bg-card/60 backdrop-blur-md shadow-lg rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary" />
                    {t('gymDetails')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t('gymNameLabel')} *
                    </label>
                    <Input
                      required
                      placeholder={t('gymNamePlaceholder')}
                      value={gymName}
                      onChange={(e) => setGymName(e.target.value)}
                      className="bg-muted/40 border-border rounded-xl h-11 focus-visible:ring-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t('subdomainLabel')} *
                    </label>
                    <div className="flex gap-2">
                      <Input
                        required
                        placeholder={t('subdomainPlaceholder')}
                        value={subdomain}
                        onChange={(e) => handleSubdomainChange(e.target.value)}
                        className="bg-muted/40 border-border rounded-xl h-11 font-mono focus-visible:ring-primary flex-1"
                      />
                      <div className="h-11 flex items-center bg-muted/60 border rounded-xl px-3 text-xs font-bold text-muted-foreground">
                        .mitrixogymcrm.com
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {t('subdomainHelp')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Owner Account Details */}
              <Card className="border-border bg-card/60 backdrop-blur-md shadow-lg rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {t('ownerDetails')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {t('ownerNameLabel')} *
                      </label>
                      <Input
                        required
                        placeholder={t('ownerNamePlaceholder')}
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="bg-muted/40 border-border rounded-xl h-11 focus-visible:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {t('ownerEmailLabel')} *
                      </label>
                      <Input
                        type="email"
                        required
                        placeholder={t('ownerEmailPlaceholder')}
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        className="bg-muted/40 border-border rounded-xl h-11 focus-visible:ring-primary"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Details */}
              <Card className="border-border bg-card/60 backdrop-blur-md shadow-lg rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    {t('paymentDetails')}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {t('paymentHelp')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t('cardNumberLabel')}
                    </label>
                    <Input
                      placeholder="•••• •••• •••• ••••"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      className="bg-muted/40 border-border rounded-xl h-11 font-mono focus-visible:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {t('cardExpiryLabel')}
                      </label>
                      <Input
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={handleExpiryChange}
                        className="bg-muted/40 border-border rounded-xl h-11 font-mono focus-visible:ring-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {t('cardCvcLabel')}
                      </label>
                      <Input
                        type="password"
                        placeholder="•••"
                        value={cardCvc}
                        onChange={handleCvcChange}
                        className="bg-muted/40 border-border rounded-xl h-11 font-mono focus-visible:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t('cardholderNameLabel')}
                    </label>
                    <Input
                      placeholder="e.g., Ahmed Ali"
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      className="bg-muted/40 border-border rounded-xl h-11 focus-visible:ring-primary"
                    />
                  </div>
                </CardContent>
              </Card>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-bold text-destructive flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 rounded-xl flex items-center justify-center gap-2 shadow-lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('submittingBtn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('checkoutBtn')}</span>
                    {isRtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
