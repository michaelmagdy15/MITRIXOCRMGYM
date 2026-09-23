import { PDFDocument } from 'pdf-lib';
import type { Client, Payment } from '../types';
import { activeConfig, getTenantId } from '../firebase';
import { safeFormatDate, toValidDate } from './dateUtils';
import { downloadFile } from './download';
import { contractTemplates } from '../config/contractTemplates';

export interface ContractContext {
  payment?: Payment;
  printedBy?: string;
}

export async function buildClientContract(templateBytes: ArrayBuffer | Uint8Array, tenantId: string, client: Client, context: ContractContext = {}): Promise<Uint8Array> {
  const template = contractTemplates[tenantId];
  if (!template) throw new Error('No contract template is configured for this tenant.');
  const payment = context.payment;
  const packages = [...(client.packages || [])].sort((a, b) =>
    (toValidDate(b.startDate)?.getTime() || 0) - (toValidDate(a.startDate)?.getTime() || 0));
  const selectedPackage = payment?.packageType
    ? packages.find(p => p.packageName === payment.packageType)
    : packages.find(p => p.status === 'Active' || p.status === 'Hold') || packages[0];
  const packageName = selectedPackage?.packageName || payment?.packageType || client.packageType || '';
  const useLegacyDates = !selectedPackage && packageName === client.packageType;
  const date = (value: unknown) => safeFormatDate(value, 'dd/MM/yyyy', '');
  const paid = payment?.amount_paid ?? payment?.amount;
  const values: Record<string, string> = {
    name: client.name || '', phone: client.phone || '', memberId: client.memberId || client.id,
    gender: client.gender || '', nationality: client.nationality || '', birthday: date(client.dateOfBirth),
    package: packageName,
    startDate: date(selectedPackage?.startDate || (useLegacyDates ? client.startDate : undefined)),
    endDate: date(selectedPackage?.endDate || (useLegacyDates ? client.membershipExpiry : undefined)),
    amount: typeof paid === 'number' && Number.isFinite(paid) ? String(paid) : '',
    paymentMethod: payment?.method || '',
    paymentDetails: payment ? [payment.method, date(payment.date), payment.receiptSerial].filter(Boolean).join(' / ') : '',
    printedAt: safeFormatDate(new Date(), 'dd/MM/yyyy HH:mm', ''), printedBy: context.printedBy || '',
  };
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  // A broken mapping must fail visibly, never produce a partially filled contract.
  for (const [key, fieldName] of Object.entries(template.fields)) {
    const field = form.getTextField(fieldName);
    field.setText(values[key] || '');
    field.setFontSize(0);
  }
  return pdf.save();
}

export async function generateClientContract(client: Client, context: ContractContext = {}): Promise<Blob | null> {
  try {
    // Match the database configuration before considering local development overrides.
    const tenantId = (activeConfig as { tenantId?: string }).tenantId || getTenantId();
    const template = contractTemplates[tenantId];
    if (!template) throw new Error('No contract template is configured for this tenant.');
    const response = await fetch(template.url);
    if (!response.ok) throw new Error('The tenant contract template could not be loaded.');
    const bytes = await buildClientContract(await response.arrayBuffer(), tenantId, client, context);
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const name = (client.name || client.memberId || client.id).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '_');
    downloadFile(blob, `Contract_${name}.pdf`);
    return blob;
  } catch (error) {
    console.error('Error generating contract:', error);
    alert(`Failed to generate contract. ${error instanceof Error ? error.message : 'Please try again.'}`);
    return null;
  }
}
