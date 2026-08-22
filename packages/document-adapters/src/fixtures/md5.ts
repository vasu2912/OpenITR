const SHIFTS = readonlyShiftTable();

function readonlyShiftTable(): readonly number[] {
	return [
		7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
		5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
		4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
		6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
	];
}

const K = Array.from({ length: 64 }, (_, i) =>
	Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32),
);

const toBytes = (text: string): Uint8Array => {
	const encoded = new TextEncoder().encode(text);
	const buffer = new ArrayBuffer(encoded.length);
	new Uint8Array(buffer).set(encoded);
	return new Uint8Array(buffer);
};

const rotateLeft = (value: number, shift: number): number =>
	((value << shift) | (value >>> (32 - shift))) >>> 0;

const add32 = (...values: number[]): number =>
	values.reduce((sum, value) => (sum + value) >>> 0, 0);

export const md5 = (input: Uint8Array): Uint8Array<ArrayBuffer> => {
	const originalLength = input.length;
	const paddedLength =
		((originalLength + 8) >>> 6 << 6) + 64;
	const message = new Uint8Array(paddedLength);
	message.set(input);
	message[originalLength] = 0x80;
	const bitLength = originalLength * 8;
	const view = new DataView(message.buffer);
	view.setUint32(paddedLength - 8, bitLength >>> 0, true);
	view.setUint32(
		paddedLength - 4,
		Math.floor(bitLength / 2 ** 32) >>> 0,
		true,
	);

	let a0 = 0x67452301;
	let b0 = 0xefcdab89;
	let c0 = 0x98badcfe;
	let d0 = 0x10325476;

	for (let chunkStart = 0; chunkStart < paddedLength; chunkStart += 64) {
		const m = Array.from({ length: 16 }, (_, i) =>
			view.getUint32(chunkStart + i * 4, true),
		);

		let a = a0;
		let b = b0;
		let c = c0;
		let d = d0;

		for (let i = 0; i < 64; i += 1) {
			let f: number;
			let g: number;
			if (i < 16) {
				f = (b & c) | (~b & d);
				g = i;
			} else if (i < 32) {
				f = (d & b) | (~d & c);
				g = (5 * i + 1) % 16;
			} else if (i < 48) {
				f = b ^ c ^ d;
				g = (3 * i + 5) % 16;
			} else {
				f = c ^ (b | ~d);
				g = (7 * i) % 16;
			}
			const mj = m[g];
			if (mj === undefined) {
				throw new Error("MD5 schedule index out of range");
			}
			f = add32(f, a, K[i] ?? 0, mj);
			a = d;
			d = c;
			c = b;
			b = add32(b, rotateLeft(f, SHIFTS[i] ?? 0));
		}

		a0 = add32(a0, a);
		b0 = add32(b0, b);
		c0 = add32(c0, c);
		d0 = add32(d0, d);
	}

	const digest = new ArrayBuffer(16);
	const digestView = new DataView(digest);
	digestView.setUint32(0, a0, true);
	digestView.setUint32(4, b0, true);
	digestView.setUint32(8, c0, true);
	digestView.setUint32(12, d0, true);
	return new Uint8Array(digest);
};

export const md5OfText = (text: string): Uint8Array<ArrayBuffer> =>
	md5(toBytes(text));

export const concatBytes = (
	...parts: readonly Uint8Array[]
): Uint8Array<ArrayBuffer> => {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(new ArrayBuffer(total));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};
