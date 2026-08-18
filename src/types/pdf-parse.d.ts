declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
  }
  function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;
  export = pdfParse;
}
