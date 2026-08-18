declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
  }
  function pdfParse(data: Buffer, options?: { pagerender?: (pageData: unknown) => Promise<string>; max?: number; version?: string }): Promise<PdfParseResult>;
  export = pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse = require("pdf-parse");
  export = pdfParse;
}
