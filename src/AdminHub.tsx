import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from './context';
import { useSettings } from './contexts/SettingsContext';
import { Shield, Save, CheckCircle2, UserPlus, CreditCard, Scan, BarChart3, FileText, Coffee, Package, Smartphone, Phone, Search as SearchIcon, MessageSquare, Star, ClipboardList, Target } from 'lucide-react';

import { activeConfig } from './firebase';

export default function AdminHub() {
  const { features, updateFeatures } = useSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Local state for toggles
  const [leads, setLeads] = useState(features.leads !== false);
  const [ptPackages, setPtPackages] = useState(features.ptPackages !== false);
  const [payments, setPayments] = useState(features.payments !== false);
  const [attendance, setAttendance] = useState(features.attendance !== false);
  const [reports, setReports] = useState(features.reports !== false);
  const [quotes, setQuotes] = useState(features.quotes !== false);
  const [operations, setOperations] = useState(features.operations !== false);
  const [mobileApp, setMobileApp] = useState(features.mobileApp === true);
  const [callCenter, setCallCenter] = useState(features.callCenter === true);
  const [lostAndFound, setLostAndFound] = useState(features.lostAndFound === true);
  const [complaints, setComplaints] = useState(features.complaints === true);
  const [advancedReports, setAdvancedReports] = useState(features.advancedReports === true);
  const [surveys, setSurveys] = useState(features.surveys === true);
  const [serviceCategoryTargets, setServiceCategoryTargets] = useState(features.serviceCategoryTargets === true);

  const handleSave = async () => {
    setIsLoading(true);
    setSuccess(false);
    setError('');
    try {
      await updateFeatures({
        leads,
        ptPackages,
        payments,
        attendance,
        reports,
        quotes,
        operations,
        mobileApp,
        callCenter,
        lostAndFound,
        complaints,
        advancedReports,
        surveys,
        serviceCategoryTargets
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save feature settings.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-amber-500" />
            Platform Admin Hub
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage active modules and feature billing plans for the current gym database.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Features Config Column */}
        <Card className="lg:col-span-2 border-border/50 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Feature Gateways</CardTitle>
            <CardDescription>
              Toggle specific page tabs and features on/off for this tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && (
              <Alert className="bg-emerald-950/20 border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                <AlertDescription>Feature configurations updated successfully!</AlertDescription>
              </Alert>
            )}

            <div className="divide-y divide-border border-y border-border">
              {/* Leads */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <UserPlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Leads Module</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable tracking potential clients, follow-up logs, and trial sessions.
                    </p>
                  </div>
                </div>
                <Switch checked={leads} onCheckedChange={setLeads} disabled={isLoading} />
              </div>

              {/* PT Packages */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Private Training Packages (PT)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable private session package deduction and trainer scheduling.
                    </p>
                  </div>
                </div>
                <Switch checked={ptPackages} onCheckedChange={setPtPackages} disabled={isLoading} />
              </div>

              {/* Payments */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Payments & Financials</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Show full invoicing, payments recording, and revenue dashboards.
                    </p>
                  </div>
                </div>
                <Switch checked={payments} onCheckedChange={setPayments} disabled={isLoading} />
              </div>

              {/* Attendance */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <Scan className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Attendance & QR Scanner</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable front-desk webcams and QR code gate validation scanners.
                    </p>
                  </div>
                </div>
                <Switch checked={attendance} onCheckedChange={setAttendance} disabled={isLoading} />
              </div>

              {/* Reports */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Reports & Analytics</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable sales charts, performance leaders, and branch financial statistics.
                    </p>
                  </div>
                </div>
                <Switch checked={reports} onCheckedChange={setReports} disabled={isLoading} />
              </div>

              {/* Quotes */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Quote Generator</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable generation of customized customer membership proposal quotes.
                    </p>
                  </div>
                </div>
                <Switch checked={quotes} onCheckedChange={setQuotes} disabled={isLoading} />
              </div>

              {/* Operations */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <Coffee className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Club Operations (Juice Bar, Lockers)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable locker allocation requests and juice bar pre-orders.
                    </p>
                  </div>
                </div>
                <Switch checked={operations} onCheckedChange={setOperations} disabled={isLoading} />
              </div>

              {/* Mobile App */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg mt-0.5">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Mobile App & Storefront</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enable guest package purchase storefront, class bookings, and digital member pass.
                    </p>
                  </div>
                </div>
                <Switch checked={mobileApp} onCheckedChange={setMobileApp} disabled={isLoading} />
              </div>

              {/* ── Premium Modules Section ── */}
              <div className="pt-6 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-amber-500">Premium Modules</h3>
                </div>
                <p className="text-xs text-muted-foreground">Advanced features available on the Premium plan.</p>
              </div>

              {/* Call Center */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
                    <Phone className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Call Center</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Manage outbound/inbound call logs, follow-ups, and lead conversion tracking.
                    </p>
                  </div>
                </div>
                <Switch checked={callCenter} onCheckedChange={setCallCenter} disabled={isLoading} />
              </div>

              {/* Advanced Reports */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
                    <BarChart3 className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Advanced Reports</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Unlock detailed analytics, custom report builders, and export capabilities.
                    </p>
                  </div>
                </div>
                <Switch checked={advancedReports} onCheckedChange={setAdvancedReports} disabled={isLoading} />
              </div>

              {/* Lost & Found */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
                    <SearchIcon className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Lost &amp; Found</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Track found items, manage claims, and categorize lost property across branches.
                    </p>
                  </div>
                </div>
                <Switch checked={lostAndFound} onCheckedChange={setLostAndFound} disabled={isLoading} />
              </div>

              {/* Complaints & Suggestions */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
                    <MessageSquare className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Complaints &amp; Suggestions</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Receive, categorize, and resolve member complaints with priority tracking.
                    </p>
                  </div>
                </div>
                <Switch checked={complaints} onCheckedChange={setComplaints} disabled={isLoading} />
              </div>

              {/* Member Surveys */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
                    <ClipboardList className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Member Surveys</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Create and distribute surveys to gather member feedback and satisfaction data.
                    </p>
                  </div>
                </div>
                <Switch checked={surveys} onCheckedChange={setSurveys} disabled={isLoading} />
              </div>

              {/* Service Category Targets */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg mt-0.5">
                    <Target className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <Label className="font-bold text-sm">Service Category Targets</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set and track sales targets per service category and package type.
                    </p>
                  </div>
                </div>
                <Switch checked={serviceCategoryTargets} onCheckedChange={setServiceCategoryTargets} disabled={isLoading} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} className="font-bold gap-2 rounded-xl h-11 px-6 bg-amber-500 hover:bg-amber-600 text-black shadow-md cursor-pointer flex items-center justify-center" disabled={isLoading}>
                <Save className="h-4 w-4" />
                {isLoading ? 'Saving...' : 'Apply Feature Plan'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tenant Info Column */}
        <div className="space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Tenant Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Database ID</span>
                <p className="font-mono text-sm font-bold bg-muted p-2 rounded border border-border">
                  {activeConfig.firestoreDatabaseId || '(default)'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Project ID</span>
                <p className="font-mono text-sm bg-muted p-2 rounded border border-border">
                  {activeConfig.projectId}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
