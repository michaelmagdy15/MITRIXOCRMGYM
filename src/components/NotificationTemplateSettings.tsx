import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bell, Save, CheckCircle2, RotateCcw, MessageSquare, Smartphone, ShieldAlert } from 'lucide-react';
import { DEFAULT_NOTIFICATION_TEMPLATES, NotificationTemplate, NotificationTriggerEvent } from '../types/notificationTemplate';
import { addAuditLog } from '../services/auditService';

export default function NotificationTemplateSettings() {
  const [templates, setTemplates] = useState<Record<string, NotificationTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'settings', 'notificationTemplates'));
      if (snap.exists() && snap.data()?.templates) {
        setTemplates(snap.data().templates);
      } else {
        // Initialize from defaults
        const initial: Record<string, NotificationTemplate> = {};
        for (const [key, val] of Object.entries(DEFAULT_NOTIFICATION_TEMPLATES)) {
          initial[key] = {
            id: key,
            eventKey: key as NotificationTriggerEvent,
            title: val.title,
            bodyTemplate: val.bodyTemplate,
            channels: val.channels,
            isActive: true,
            updatedAt: new Date().toISOString()
          };
        }
        setTemplates(initial);
      }
    } catch (err) {
      console.error('[NotificationTemplates] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (key: string, field: string, value: any) => {
    setTemplates(prev => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleChannelToggle = (key: string, channel: 'push' | 'sms' | 'inApp', checked: boolean) => {
    setTemplates(prev => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          channels: {
            ...current.channels,
            [channel]: checked
          }
        }
      };
    });
  };

  const handleInsertPlaceholder = (key: string, placeholder: string) => {
    const current = templates[key]?.bodyTemplate || '';
    handleUpdate(key, 'bodyTemplate', current + ' ' + placeholder);
  };

  const handleResetDefaults = (key: string) => {
    const def = DEFAULT_NOTIFICATION_TEMPLATES[key as NotificationTriggerEvent];
    if (!def) return;
    setTemplates(prev => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          title: def.title,
          bodyTemplate: def.bodyTemplate,
          channels: { ...def.channels }
        }
      };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      await setDoc(doc(db, 'settings', 'notificationTemplates'), {
        templates,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await addAuditLog(
        'UPDATE',
        'SETTINGS' as any,
        'notificationTemplates',
        'Updated notification template settings'
      );

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('[NotificationTemplates] Failed to save:', err);
      alert('Failed to save templates: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading notification templates...</div>;
  }

  const events: { key: NotificationTriggerEvent; label: string; description: string; placeholders: string[] }[] = [
    {
      key: 'class_booking_confirmation',
      label: 'Class Booking Confirmed',
      description: 'Triggered immediately when a member books a class',
      placeholders: ['{memberName}', '{className}', '{coachName}', '{startTime}', '{date}', '{branch}']
    },
    {
      key: 'waitlist_promotion',
      label: 'Waitlist Promotion',
      description: 'Triggered when a waitlisted member is promoted to confirmed booking',
      placeholders: ['{memberName}', '{className}', '{coachName}', '{startTime}', '{date}', '{branch}']
    },
    {
      key: 'class_reminder_2h',
      label: '2-Hour Class Reminder',
      description: 'Automated notification sent 2 hours before scheduled class start',
      placeholders: ['{memberName}', '{className}', '{coachName}', '{startTime}', '{date}', '{branch}']
    },
    {
      key: 'class_cancelled',
      label: 'Class Cancellation Alert',
      description: 'Triggered when an admin or instructor cancels a class session',
      placeholders: ['{memberName}', '{className}', '{startTime}', '{date}']
    },
    {
      key: 'no_show_alert',
      label: 'No-Show Strike Alert',
      description: 'Triggered when a member is marked absent after the 10-minute grace period',
      placeholders: ['{memberName}', '{className}', '{date}']
    },
    {
      key: 'pt_booking_confirmation',
      label: 'Personal Training Booking',
      description: 'Triggered when a 1-on-1 or partner PT session is scheduled',
      placeholders: ['{memberName}', '{coachName}', '{date}', '{startTime}']
    },
    {
      key: 'pt_rescheduled',
      label: 'PT Session Rescheduled',
      description: 'Triggered when coach or client reschedules a session',
      placeholders: ['{memberName}', '{coachName}', '{date}', '{startTime}']
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/40 p-4 rounded-xl border">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Automated Notification Templates
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customize copy and delivery channels for automated push, SMS, and in-app system triggers.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
          {saveSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Saved Successfully!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save All Templates'}
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {events.map(ev => {
          const t = templates[ev.key] || {
            title: '',
            bodyTemplate: '',
            channels: { push: true, sms: false, inApp: true },
            isActive: true
          };

          return (
            <Card key={ev.key} className="border-border/60 hover:border-primary/40 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span>{ev.label}</span>
                      <Badge variant="outline" className="font-mono text-xs">{ev.key}</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">{ev.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-xs bg-muted/60 px-3 py-1.5 rounded-lg border">
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                        <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                        Push
                        <input
                          type="checkbox"
                          checked={t.channels?.push ?? true}
                          onChange={e => handleChannelToggle(ev.key, 'push', e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 ml-1"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                        SMS
                        <input
                          type="checkbox"
                          checked={t.channels?.sms ?? false}
                          onChange={e => handleChannelToggle(ev.key, 'sms', e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 ml-1"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                        <Bell className="w-3.5 h-3.5 text-amber-500" />
                        In-App
                        <input
                          type="checkbox"
                          checked={t.channels?.inApp ?? true}
                          onChange={e => handleChannelToggle(ev.key, 'inApp', e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5 ml-1"
                        />
                      </label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResetDefaults(ev.key)}
                      title="Reset to default template"
                      className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-1">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Notification Title</Label>
                    <Input
                      value={t.title || ''}
                      onChange={e => handleUpdate(ev.key, 'title', e.target.value)}
                      placeholder="Title"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Message Body Template</Label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground">Placeholders:</span>
                        {ev.placeholders.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleInsertPlaceholder(ev.key, p)}
                            className="text-[11px] px-2 py-0.5 rounded bg-muted hover:bg-primary/20 text-muted-foreground hover:text-foreground font-mono transition-colors"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Textarea
                      value={t.bodyTemplate || ''}
                      onChange={e => handleUpdate(ev.key, 'bodyTemplate', e.target.value)}
                      placeholder="Message content with placeholders..."
                      rows={2}
                      className="mt-1 font-sans text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
