import { concatBytes, md5, md5OfText } from "./md5";
import {
	computeFileKey,
	computeObjectKey,
	computeOwnerEntry,
	rc4,
	STANDARD_PASSWORD_PADDING,
} from "./rc4";

export type SyntheticPdfPage = Readonly<{
	textLines?: readonly string[];
	imageOnly?: boolean;
}>;

export type SyntheticPdfOptions = Readonly<{
	pages: readonly SyntheticPdfPage[];
	encryptionPassword?: string;
}>;

const PERMISSIONS = -3904;

type PdfBody =
	| Readonly<{ kind: "plain"; text: string }>
	| Readonly<{ kind: "stream"; data: Uint8Array }>;

type PdfObject = Readonly<{ number: number; body: PdfBody }>;

type TrailerOptions = Readonly<{ trailerExtra: string }>;

const encodeLatin1 = (text: string): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(text.length));
	for (let i = 0; i < text.length; i += 1) {
		out[i] = text.charCodeAt(i) & 0xff;
	}
	return out;
};

const toHex = (bytes: Uint8Array): string =>
	[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const escapeText = (line: string): string =>
	line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const textContentStreamData = (
	textLines: readonly string[],
): Uint8Array<ArrayBuffer> => {
	const operators = textLines.map(
		(line, index) =>
			`BT /F1 12 Tf 72 ${720 - index * 16} Td (${escapeText(line)}) Tj ET`,
	);
	return encodeLatin1(`${operators.join("\n")}\n`);
};

const imageContentStreamData = (
	imageNameIndex: number,
): Uint8Array<ArrayBuffer> =>
	encodeLatin1(`q 400 0 0 200 72 500 cm /Im${imageNameIndex} Do Q\n`);

const twoByTwoGrayImageData = (): Uint8Array<ArrayBuffer> =>
	Uint8Array.of(0x00, 0x55, 0xaa, 0xff);

const FIRST_CONTENT_OBJECT_NUMBER = 4;

const layoutPlan = (
	pageCount: number,
	imageCount: number,
): Readonly<{
	contentObjectNumbers: readonly number[];
	pageObjectNumbers: readonly number[];
	firstImageObjectNumber: number;
	encryptObjectNumber: number;
}> => {
	const contentObjectNumbers = Array.from(
		{ length: pageCount },
		(_, index) => FIRST_CONTENT_OBJECT_NUMBER + index * 2,
	);
	const pageObjectNumbers = contentObjectNumbers.map((n) => n + 1);
	const firstImageObjectNumber = FIRST_CONTENT_OBJECT_NUMBER + pageCount * 2;
	return {
		contentObjectNumbers,
		pageObjectNumbers,
		firstImageObjectNumber,
		encryptObjectNumber: firstImageObjectNumber + imageCount,
	};
};

const plainObject = (number: number, text: string): PdfObject => ({
	number,
	body: { kind: "plain", text },
});

const streamObject = (
	number: number,
	data: Uint8Array<ArrayBuffer>,
): PdfObject => ({ number, body: { kind: "stream", data } });

export const buildSyntheticPdf = ({
	pages,
	encryptionPassword,
}: SyntheticPdfOptions): Uint8Array<ArrayBuffer> => {
	const imageCount = pages.filter((page) => page.imageOnly === true).length;
	const {
		contentObjectNumbers,
		pageObjectNumbers,
		firstImageObjectNumber,
		encryptObjectNumber,
	} = layoutPlan(pages.length, imageCount);

	const objects: PdfObject[] = [
		plainObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
		plainObject(
			2,
			`<< /Type /Pages /Kids [${pageObjectNumbers
				.map((n) => `${n} 0 R`)
				.join(" ")}] /Count ${pages.length} >>`,
		),
		plainObject(
			3,
			"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		),
	];

	let imageIndex = 0;
	pages.forEach((page, pageIndex) => {
		const contentNumber = contentObjectNumbers[pageIndex];
		const pageNumber = pageObjectNumbers[pageIndex];
		if (contentNumber === undefined || pageNumber === undefined) {
			throw new Error("PDF fixture layout underflow");
		}

		if (page.imageOnly === true) {
			const imageObjectNumber = firstImageObjectNumber + imageIndex;
			objects.push(
				streamObject(contentNumber, imageContentStreamData(imageIndex)),
				streamObject(imageObjectNumber, twoByTwoGrayImageData()),
				plainObject(
					pageNumber,
					"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
						`/Contents ${contentNumber} 0 R ` +
						`/Resources << /XObject << /Im${imageIndex} ${imageObjectNumber} 0 R >> >> >>`,
				),
			);
			imageIndex += 1;
			return;
		}

		objects.push(
			streamObject(contentNumber, textContentStreamData(page.textLines ?? [])),
			plainObject(
				pageNumber,
				"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
					`/Contents ${contentNumber} 0 R ` +
					"/Resources << /Font << /F1 3 0 R >> >> >>",
			),
		);
	});

	let trailerExtra = "";
	if (encryptionPassword !== undefined) {
		const documentId = md5OfText("openitr-synthetic-pdf-document-id");
		const ownerEntry = computeOwnerEntry(
			encryptionPassword,
			encryptionPassword,
		);
		const fileKey = computeFileKey({
			userPassword: encryptionPassword,
			ownerEntry,
			permissions: PERMISSIONS,
			documentId,
		});
		const userFirstHalf = rc4(
			fileKey,
			md5(concatBytes(STANDARD_PASSWORD_PADDING, documentId)),
		);
		const userEntry = concatBytes(userFirstHalf, userFirstHalf);

		for (let index = 0; index < objects.length; index += 1) {
			const object = objects[index];
			if (object === undefined || object.body.kind !== "stream") {
				continue;
			}
			const objectKey = computeObjectKey(fileKey, object.number, 0);
			objects[index] = {
				number: object.number,
				body: { kind: "stream", data: rc4(objectKey, object.body.data) },
			};
		}

		objects.push(
			plainObject(
				encryptObjectNumber,
				"<< /Filter /Standard /V 2 /R 3 /Length 128 " +
					`/P ${PERMISSIONS} ` +
					`/O <${toHex(ownerEntry)}> ` +
					`/U <${toHex(userEntry)}>>`,
			),
		);
		trailerExtra =
			` /Encrypt ${encryptObjectNumber} 0 R` +
			` /ID [<${toHex(documentId)}><${toHex(documentId)}>]`;
	}

	return serializePdf(objects.sort((a, b) => a.number - b.number), {
		trailerExtra,
	});
};

const serializePdf = (
	sortedObjects: readonly PdfObject[],
	trailerOptions: TrailerOptions,
): Uint8Array<ArrayBuffer> => {
	const chunks: Uint8Array[] = [];
	let offset = 0;
	const pushBytes = (bytes: Uint8Array): void => {
		chunks.push(bytes);
		offset += bytes.length;
	};
	const pushText = (text: string): void => {
		pushBytes(encodeLatin1(text));
	};

	pushText("%PDF-1.6\n%\xe2\xe3\xcf\xd3\n");

	const offsets = new Map<number, number>();
	for (const object of sortedObjects) {
		offsets.set(object.number, offset);
		pushText(`${object.number} 0 obj\n`);
		if (object.body.kind === "plain") {
			pushText(object.body.text);
		} else {
			pushText(`<< /Length ${object.body.data.length} >>\nstream\n`);
			pushBytes(object.body.data);
			pushText("\nendstream");
		}
		pushText("\nendobj\n");
	}

	const maxObjectNumber = sortedObjects[sortedObjects.length - 1]?.number ?? 0;
	const xrefOffset = offset;
	pushText(`xref\n0 ${maxObjectNumber + 1}\n0000000000 65535 f \n`);
	for (let objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber += 1) {
		const objectOffset = offsets.get(objectNumber);
		if (objectOffset === undefined) {
			throw new Error("PDF fixture object numbering gap");
		}
		pushText(`${String(objectOffset).padStart(10, "0")} 00000 n \n`);
	}
	pushText(
		`trailer\n<< /Size ${maxObjectNumber + 1} /Root 1 0 R${trailerOptions.trailerExtra} >>\n` +
			`startxref\n${xrefOffset}\n%%EOF\n`,
	);

	return concatBytes(...chunks);
};

export const corruptSyntheticPdf = (): Uint8Array<ArrayBuffer> => {
	const healthy = buildSyntheticPdf({
		pages: [{ textLines: ["Healthy before damage"] }],
	});
	const cutAt = Math.floor(healthy.length * 0.6);
	const damaged = new Uint8Array(new ArrayBuffer(cutAt + 32));
	damaged.set(healthy.subarray(0, cutAt));
	damaged.fill(0x00, cutAt);
	return damaged;
};
