import { concatBytes, md5 } from "./md5";

const STANDARD_PASSWORD_PADDING = Uint8Array.of(
	0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
	0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
	0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
	0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
);

export { STANDARD_PASSWORD_PADDING };

const KEY_LENGTH_BYTES = 16;
const MD5_ITERATIONS = 50;

export const padPassword = (password: string): Uint8Array<ArrayBuffer> => {
	const encoded = new TextEncoder().encode(password);
	const out = new Uint8Array(new ArrayBuffer(32));
	out.set(encoded.subarray(0, 32));
	if (encoded.length < 32) {
		out.set(STANDARD_PASSWORD_PADDING.subarray(0, 32 - encoded.length), encoded.length);
	}
	return out;
};

const at = (bytes: Uint8Array, index: number): number => {
	const value = bytes[index];
	if (value === undefined) {
		throw new Error("Byte index out of range");
	}
	return value;
};

export const rc4 = (
	key: Uint8Array,
	data: Uint8Array,
): Uint8Array<ArrayBuffer> => {
	const s = Uint8Array.from({ length: 256 }, (_, i) => i);
	let j = 0;
	for (let i = 0; i < 256; i += 1) {
		j = (j + at(s, i) + at(key, i % key.length)) & 0xff;
		const si = at(s, i);
		const sj = at(s, j);
		s[i] = sj;
		s[j] = si;
	}
	const out = new Uint8Array(new ArrayBuffer(data.length));
	let i = 0;
	j = 0;
	for (let k = 0; k < data.length; k += 1) {
		i = (i + 1) & 0xff;
		j = (j + at(s, i)) & 0xff;
		const si = at(s, i);
		const sj = at(s, j);
		s[i] = sj;
		s[j] = si;
		out[k] = at(data, k) ^ at(s, (si + sj) & 0xff);
	}
	return out;
};

const iterateMd5 = (data: Uint8Array, times: number): Uint8Array<ArrayBuffer> => {
	let current = md5(data);
	for (let round = 1; round < times; round += 1) {
		current = md5(current);
	}
	const out = new Uint8Array(new ArrayBuffer(current.length));
	out.set(current);
	return out;
};

const firstKeyBytes = (data: Uint8Array): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(new ArrayBuffer(KEY_LENGTH_BYTES));
	out.set(data.subarray(0, KEY_LENGTH_BYTES));
	return out;
};

export const computeOwnerEntry = (
	ownerPassword: string,
	userPassword: string,
): Uint8Array<ArrayBuffer> =>
	rc4(
		firstKeyBytes(iterateMd5(padPassword(ownerPassword), MD5_ITERATIONS)),
		padPassword(userPassword),
	);

export const computeFileKey = ({
	userPassword,
	ownerEntry,
	permissions,
	documentId,
}: Readonly<{
	userPassword: string;
	ownerEntry: Uint8Array;
	permissions: number;
	documentId: Uint8Array;
}>): Uint8Array<ArrayBuffer> => {
	const pBytes = new Uint8Array(new ArrayBuffer(4));
	new DataView(pBytes.buffer).setInt32(0, permissions, true);
	return firstKeyBytes(
		iterateMd5(
			concatBytes(
				padPassword(userPassword),
				ownerEntry.subarray(0, 32),
				pBytes,
				documentId,
			),
			MD5_ITERATIONS,
		),
	);
};

export const computeUserEntry = (
	fileKey: Uint8Array,
	documentId: Uint8Array,
): Uint8Array<ArrayBuffer> => {
	const firstHalf = rc4(fileKey, md5(concatBytes(STANDARD_PASSWORD_PADDING, documentId)));
	return concatBytes(firstHalf, firstHalf);
};

export const computeObjectKey = (
	fileKey: Uint8Array,
	objectNumber: number,
	generation: number,
): Uint8Array<ArrayBuffer> => {
	const suffix = new Uint8Array(new ArrayBuffer(5));
	suffix[0] = objectNumber & 0xff;
	suffix[1] = (objectNumber >> 8) & 0xff;
	suffix[2] = (objectNumber >> 16) & 0xff;
	suffix[3] = generation & 0xff;
	suffix[4] = (generation >> 8) & 0xff;
	return firstKeyBytes(md5(concatBytes(fileKey, suffix)));
};
