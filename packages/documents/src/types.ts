export interface StoredDocument {
  storageKey: string;
  byteLength: number;
}

export interface DocumentStorage {
  put(input: {
    sha256: string;
    extension: string;
    data: Uint8Array;
  }): Promise<StoredDocument>;
  /**
   * Returns integrity-verified bytes for a key produced by put, or null when
   * the key is unknown. Implementations must never return unverified bytes.
   */
  get?(storageKey: string): Promise<Uint8Array | null>;
}

export interface ExtractedDocumentPage {
  page: number;
  text: string;
}

export interface PdfExtraction {
  extractor: "pdfjs";
  extractorVersion: string;
  pageCount: number;
  text: string;
  textSha256: string;
  pages: ExtractedDocumentPage[];
  warnings: string[];
}
