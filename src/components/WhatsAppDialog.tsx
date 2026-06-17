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
    greeting: `أهلاً يا كابتن ${client.name}، معاك جيم ${gymName}.. كنا حابين نعرف لو مهتم تيجي تشرفنا وتجرب حصة تجريبية مجانية؟`,
    trial: `كابتن ${client.name}، تم تأكيد الحصة التجريبية الخاصة بحضرتك يوم ${getTrialDateStr()}. مستنيينك تشرفنا! 💪`,
    renewal: `يا كابتن ${client.name}، صباح الخير! بنفكرك إن اشتراكك الحالي هينتهي يوم ${getExpiryDateStr()}. حابب نجددلك الاشتراك الباقة القادمة؟`,
    missyou: `كابتن ${client.name}، وحشتنا في الجيم! لاحظنا إنك مظهرتش للتمرين بقالك فترة.. كله تمام؟ مستنيينك ترجع للتمرين قريباً! 💪`,
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
            <span>Send WhatsApp to {client.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Choose a bilingual template. The interaction will be logged automatically in CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 text-sm">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Message Template</Label>
            <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as string)}>
              <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct Chat (No pre-filled text)</SelectItem>
                <SelectItem value="greeting">Greeting / Inquire (New Lead)</SelectItem>
                <SelectItem value="trial">Confirm Trial Appointment</SelectItem>
                <SelectItem value="renewal">Renewal / Expiry Reminder</SelectItem>
                <SelectItem value="missyou">"We Miss You" (Absent Member)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Message Text Preview</Label>
            <Textarea
              className="min-h-[120px] rounded-xl bg-muted/20 border-white/5 focus:border-green-500/30 transition-all resize-none p-3 text-sm leading-relaxed"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message here..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Expected Outcome</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as InteractionOutcome)}>
                <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                  <SelectValue placeholder="Expected outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Interested">Interested</SelectItem>
                  <SelectItem value="Not Answered">Not Answered</SelectItem>
                  <SelectItem value="Scheduled Trial">Scheduled Trial</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Follow-up Date (Optional)</Label>
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
            Cancel
          </Button>
          <Button
            className="rounded-xl bg-green-600 text-white hover:bg-green-700 font-bold flex items-center gap-2 order-1 sm:order-2"
            onClick={handleSendAndLog}
          >
            <Send className="h-4 w-4" />
            <span>Send & Log</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
