import { hash } from 'bcryptjs';

// 2^10 bcrypt rounds (~100 ms per hash): slow enough to make guessing expensive.
// One constant for every place that hashes passwords (self-registration and admin creation).
const BCRYPT_ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> => hash(plain, BCRYPT_ROUNDS);
