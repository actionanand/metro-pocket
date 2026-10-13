import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';

/** Client-side downloads for CSV templates and private backups. No server or plugin. */
@Service()
export class LocalFileService {
  private readonly document = inject(DOCUMENT);

  download(content: string | ArrayBuffer, filename: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    this.document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      // Give the browser/WebView time to start reading the file before revoking it.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
