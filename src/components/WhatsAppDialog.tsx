import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Client, InteractionOutcome } from '../types';
import { useAppContext } from '../context';
import { MessageSquare, Calendar, Send } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface WhatsAppDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  onSuccess?: () => void;
}

export const WhatsAppDialog: React.FC<WhatsAppDialogProps> = ({
  isOpen,
  onOpenChange,
  client,
  onSuccess,
}) => {
  const { branding, addInteraction } = useAppContext();
  const { t } = useLanguage();
  const gymName = branding?.companyName || 'the gym';

  const [selectedTemplate, setSelectedTemplate] = useState<string>('direct');
  const [messageText, setMessageText] = useState<string>('');
  const [outcome, setOutcome] = useState<InteractionOutcome>('Interested');
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');

  const getTrialDateStr = () => {
    const d = client.trialDate || client.expectedVisitDate;
    if (!d) return '[Trial Date]';
    try {
      return format(parseISO(d), 'yyyy-MM-dd');
    } catch {
      return d;
    }
  };

  const getExpiryDateStr = () => {
    const d = client.membershipExpiry;
    if (!d) return '[Expiry Date]';
    try {
      return format(parseISO(d), 'yyyy-MM-dd');
    } catch {
      return d;
    }
  };

  const templates = {
    direct: '',
    greeting: t('whatsapp.templates.greeting').replace('{name}', client.name).replace('{gymName}', gymName),
    trial: t('whatsapp.templates.trial').replace('{name}', client.name).replace('{date}', getTrialDateStr()),
    renewal: t('whatsapp.templates.renewal').replace('{name}', client.name).replace('{date}', getExpiryDateStr()),
    missyou: t('whatsapp.templates.missyou').replace('{name}', client.name),
  };

  useEffect(() => {
    // Default template based on client status
    if (client.status === 'Lead') {
      setSelectedTemplate('greeting');
      setOutcome('Interested');
    } else {
      setSelectedTemplate('renewal');
      setOutcome('Other');
    }
  }, [client]);

  useEffect(() => {
    setMessageText(templates[selectedTemplate as keyof typeof templates] || '');
  }, [selectedTemplate, client]);

  const handleSendAndLog = async () => {
    // 1. Format the phone number correctly for Egyptian numbers
    // Remove all non-digit characters
    let cleanedPhone = client.phone.replace(/[^0-9]/g, '');
    
    // Normalize Egyptian number: e.g. "01012345678" -> "201012345678"
    if (cleanedPhone.startsWith('0') && cleanedPhone.length === 11) {
      cleanedPhone = '20' + cleanedPhone.substring(1);
    } else if (!cleanedPhone.startsWith('20') && cleanedPhone.length === 10 && cleanedPhone.startsWith('1')) {
      cleanedPhone = '20' + cleanedPhone;
    }

    // Generate WhatsApp wa.me link
    const waText = encodeURIComponent(messageText);
    const waUrl = `https://wa.me/${cleanedPhone}${waText ? `?text=${waText}` : ''}`;
    
    // Open in a new tab/window
    window.open(waUrl, '_blank');

    // 2. Log Interaction in CRM
    const newIA = {
      type: 'WhatsApp' as const,
      outcome: outcome,
      notes: messageText || 'Started direct WhatsApp chat.',
      date: new Date().toISOString(),
      nextFollowUp: nextFollowUpDate || undefined,
    };

    await addInteraction(client.id, newIA);

    if (onSuccess) {
      onSuccess();
    }
    
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl bg-background/95 backdrop-blur-xl border border-white/10 shadow-2xl">
        <DialogHeader className="pb-4 border-b text-left">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            <span>{t('whatsapp.title').replace('{name}', client.name)}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {t('whatsapp.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 text-sm">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('whatsapp.select_template')}</Label>
            <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as string)}>
              <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                <SelectValue placeholder={t('whatsapp.placeholder_select')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">{t('whatsapp.templates_list.direct')}</SelectItem>
                <SelectItem value="greeting">{t('whatsapp.templates_list.greeting')}</SelectItem>
                <SelectItem value="trial">{t('whatsapp.templates_list.trial')}</SelectItem>
                <SelectItem value="renewal">{t('whatsapp.templates_list.renewal')}</SelectItem>
                <SelectItem value="missyou">{t('whatsapp.templates_list.missyou')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('whatsapp.text_preview')}</Label>
            <Textarea
              className="min-h-[120px] rounded-xl bg-muted/20 border-white/5 focus:border-green-500/30 transition-all resize-none p-3 text-sm leading-relaxed"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={t('whatsapp.textarea_placeholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('whatsapp.expected_outcome')}</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as InteractionOutcome)}>
                <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                  <SelectValue placeholder="Expected outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Interested">{t('whatsapp.outcomes.interested')}</SelectItem>
                  <SelectItem value="Not Answered">{t('whatsapp.outcomes.not_answered')}</SelectItem>
                  <SelectItem value="Scheduled Trial">{t('whatsapp.outcomes.scheduled_trial')}</SelectItem>
                  <SelectItem value="Rejected">{t('whatsapp.outcomes.rejected')}</SelectItem>
                  <SelectItem value="Other">{t('whatsapp.outcomes.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('whatsapp.followup_date')}</Label>
              <input
                type="date"
                className="flex h-10 w-full rounded-xl border border-white/5 bg-muted/20 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t flex flex-col sm:flex-row gap-2">
          <Button variant="outline" className="rounded-xl order-2 sm:order-1" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="rounded-xl bg-green-600 text-white hover:bg-green-700 font-bold flex items-center gap-2 order-1 sm:order-2"
            onClick={handleSendAndLog}
          >
            <Send className="h-4 w-4" />
            <span>{t('whatsapp.send_and_log')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
