import { hashPin, verifyPinHash, isBcryptHash } from '../lib/crypto';

console.log('==================================================');
console.log('TEST SUITE: BCRYPT SECURITY & BACKWARD COMPATIBILITY');
console.log('==================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${name}`);
    failed++;
  }
}

// 1. Bcrypt generation test
const pin = '1234';
const hash = hashPin(pin);
console.log('Generated Bcrypt Hash:', hash);

assert(isBcryptHash(hash), 'hashPin generates a valid $2a$/$2b$ bcrypt hash');
assert(verifyPinHash('1234', hash), 'verifyPinHash accepts correct PIN with bcrypt');
assert(!verifyPinHash('0000', hash), 'verifyPinHash rejects wrong PIN with bcrypt');

// 2. Admin PIN test
const adminPin = '9999';
const adminHash = hashPin(adminPin);
assert(verifyPinHash('9999', adminHash), 'Admin PIN 9999 verified with bcrypt');
assert(!verifyPinHash('9998', adminHash), 'Admin PIN wrong value rejected with bcrypt');

// 3. Backward Compatibility: Plaintext legacy PINs
assert(verifyPinHash('1234', '1234'), 'Legacy plaintext PIN 1234 verified for smooth migration');
assert(!verifyPinHash('1234', '5678'), 'Legacy plaintext wrong PIN rejected');

// 4. Salting test: Two hashes of the same PIN must be different because of random salt
const hash1 = hashPin('1234');
const hash2 = hashPin('1234');
assert(hash1 !== hash2, 'Bcrypt salts ensure hash1 !== hash2 for identical PINs');
assert(verifyPinHash('1234', hash1) && verifyPinHash('1234', hash2), 'Both unique bcrypt hashes verify successfully');

console.log('\n==================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================');

if (failed > 0) process.exit(1);
else process.exit(0);
