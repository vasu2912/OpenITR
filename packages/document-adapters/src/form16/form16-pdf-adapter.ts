import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type {
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import { createPdfMarkerAdapter } from "../pdf/pdf-marker-adapter";

const FORM16_REQUIRED_MARKERS = [
	"PART A",
	"Certificate under section 203 of the Income-tax Act, 1961",
] as const;

export const FORM16_PDF_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form16-pdf",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form16-pdf"),
	templateRevision: parseTemplateRevision("2026-27"),
});

export const createForm16PdfAdapter = (): SourceDocumentAdapter =>
	createPdfMarkerAdapter(FORM16_PDF_MANIFEST, FORM16_REQUIRED_MARKERS);
