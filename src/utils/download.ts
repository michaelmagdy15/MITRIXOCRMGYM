/**
 * Triggers a file download in the browser by creating a temporary anchor element.
 * @param blob - The file content as a Blob
 * @param filename - The suggested download filename
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers a CSV file download.
 * @param csvContent - Raw CSV string content
 * @param filename - The suggested download filename (should end in .csv)
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, filename);
}
