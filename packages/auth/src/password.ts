import { scrypt } from "node:crypto";

const encoder = new TextEncoder();
const HASH_ALGORITHM = "pbkdf2-sha256";
const HASH_LENGTH_BITS = 256;
const ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const LEGACY_HASH_LENGTH_BYTES = 64;
const LEGACY_HASH_PATTERN = /^[0-9a-f]+:[0-9a-f]+$/i;

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function fromHex(value: string) {
  return new Uint8Array(Buffer.from(value, "hex"));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index]! ^ b[index]!;
  }

  return mismatch === 0;
}

async function deriveHash({
  iterations,
  password,
  salt,
}: {
  iterations: number;
  password: string;
  salt: Uint8Array;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: salt as BufferSource,
    },
    key,
    HASH_LENGTH_BITS,
  );

  return new Uint8Array(bits);
}

async function deriveLegacyHash({
  password,
  salt,
}: {
  password: string;
  salt: string;
}) {
  return await new Promise<Uint8Array>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      LEGACY_HASH_LENGTH_BYTES,
      {
        N: 16_384,
        p: 1,
        r: 16,
        maxmem: 128 * 16_384 * 16 * 2,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(new Uint8Array(derivedKey));
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveHash({
    iterations: ITERATIONS,
    password,
    salt,
  });

  return `${HASH_ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}) {
  if (LEGACY_HASH_PATTERN.test(hash)) {
    const [salt, expectedHashValue] = hash.split(":");

    if (!salt || !expectedHashValue) {
      return false;
    }

    const derivedHash = await deriveLegacyHash({
      password,
      salt,
    });

    return timingSafeEqual(derivedHash, fromHex(expectedHashValue));
  }

  const [algorithm, iterationValue, saltValue, expectedHashValue] = hash.split("$");

  if (
    algorithm !== HASH_ALGORITHM ||
    !iterationValue ||
    !saltValue ||
    !expectedHashValue
  ) {
    return false;
  }

  const derivedHash = await deriveHash({
    iterations: Number.parseInt(iterationValue, 10),
    password,
    salt: fromBase64(saltValue),
  });

  return timingSafeEqual(derivedHash, fromBase64(expectedHashValue));
}
