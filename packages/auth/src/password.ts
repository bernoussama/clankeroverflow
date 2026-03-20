import { scrypt, timingSafeEqual } from "node:crypto";

const PASSWORD_HASH_CONFIG = {
  saltBytes: 16,
  keyBytes: 64,
  maxmem: 64 * 1024 * 1024,
  N: 16384,
  r: 16,
  p: 1,
} as const;

type VerifyPasswordInput = {
  password: string;
  hash: string;
};

function createSalt() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(PASSWORD_HASH_CONFIG.saltBytes))).toString(
    "hex",
  );
}

function parsePasswordHash(hash: string) {
  const [salt, key] = hash.split(":");

  if (!salt || !key) {
    return null;
  }

  if (!/^[a-f0-9]+$/i.test(salt) || !/^[a-f0-9]+$/i.test(key)) {
    return null;
  }

  return {
    salt,
    key: Buffer.from(key, "hex"),
  };
}

async function derivePasswordKey(password: string, salt: string) {
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      PASSWORD_HASH_CONFIG.keyBytes,
      {
        maxmem: PASSWORD_HASH_CONFIG.maxmem,
        N: PASSWORD_HASH_CONFIG.N,
        r: PASSWORD_HASH_CONFIG.r,
        p: PASSWORD_HASH_CONFIG.p,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(Buffer.from(key));
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = createSalt();
  const key = await derivePasswordKey(password, salt);

  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword({ password, hash }: VerifyPasswordInput) {
  const parsedHash = parsePasswordHash(hash);

  if (!parsedHash) {
    return false;
  }

  const derivedKey = await derivePasswordKey(password, parsedHash.salt);

  if (derivedKey.length !== parsedHash.key.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, parsedHash.key);
}
