import { PDFDocument } from 'pdf-lib';
import { Client } from '../types';
import { format } from 'date-fns';

export const generateClientContract = async (client: Client, paymentAmount?: number, paymentMethod?: string) => {
  try {
    // 1. Fetch the existing PDF from the public folder
    const url = '/MITRIXOGYMCRM Client Contract form.pdf';
    const existingPdfBytes = await fetch(url).then(res => {
      if (!res.ok) throw new Error("Could not find PDF file");
      return res.arrayBuffer();
    });

    // 2. Load the document into pdf-lib
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();

    // Map exact fields based on coordinate mapping
    const setFieldSafely = (fieldName: string, value: string) => {
      try {
        const field = form.getTextField(fieldName);
        if (field) {
          field.setText(value || '');
        }
      } catch (e) {
        console.warn(`Could not set field ${fieldName}`);
      }
    };

    // Mapping based on Y and X coordinates from PDF
    // text_1ecyo -> Name
    setFieldSafely('text_1ecyo', client.name || '');
    
    // text_2dukr -> Number (Phone)
    setFieldSafely('text_2dukr', client.phone || '');
    
    // text_3pbmr -> Amount
    if (paymentAmount !== undefined) {
      setFieldSafely('text_3pbmr', paymentAmount.toString());
    }
    
    // text_4venp -> Type of payment
    if (paymentMethod) {
      setFieldSafely('text_4venp', paymentMethod);
    }
    
    // text_5inc -> Start Date
    setFieldSafely('text_5inc', client.startDate ? format(new Date(client.startDate), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy'));
    
    // text_6lmen -> Exp. Date
    setFieldSafely('text_6lmen', client.membershipExpiry ? format(new Date(client.membershipExpiry), 'dd/MM/yyyy') : '');
    
    // text_7acxg -> Package
    setFieldSafely('text_7acxg', client.packageType || '');

    // Optional: Flatten the form so it's no longer editable
    // form.flatten();

    // 4. Serialize the PDFDocument to bytes
    const pdfBytes = await pdfDoc.save();

    // 5. Trigger download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `Contract_${client.name.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

  } catch (error) {
    console.error('Error generating contract:', error);
    alert('Failed to generate contract. Please make sure "MITRIXOGYMCRM Client Contract formFILLABLE.pdf" exists in the public folder.');
  }
};
