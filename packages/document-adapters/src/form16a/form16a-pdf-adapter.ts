import { parseDocumentKind, parseTemplateRevision } from "@openitr/model";

import type {
	DocumentAdapterManifest,
	SourceDocumentAdapter,
} from "../registry";
import { createPdfMarkerAdapter } from "../pdf/pdf-marker-adapter";

const FORM16A_REQUIRED_MARKERS = [
	"FORM 16A",
	"Certificate under section 203(2A) of the Income-tax Act, 1961",
] as const;

export const FORM16A_PDF_MANIFEST: DocumentAdapterManifest = Object.freeze({
	adapterId: "form16a-pdf",
	adapterVersion: "1",
	documentKind: parseDocumentKind("form16a-pdf"),
	templateRevision: parseTemplateRevision("2026-27"),
});

export const createForm16APdfAdapter = (): SourceDocumentAdapter =>
	createPdfMarkerAdapter(FORM16A_PDF_MANIFEST, FORM16A_REQUIRED_MARKERS);
