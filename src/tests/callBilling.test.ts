import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../models/user.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { Gift } from '../models/gift.model';
import { CallStatus, TransactionType } from '../constants/user';
import { BillingService, deductUserWalletAtomic } from '../services/billing.service';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/umang';

async function runTests() {
  console.log('==================================================');
  console.log('🧪 RUNNING PRODUCTION CALL BILLING & GIFT ISOLATION 17-TEST SUITE');
  console.log('==================================================');

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB for testing.');

  let passedTests = 0;
  let totalTests = 17;
  let userCounter = Math.floor(Date.now() / 1000) % 800000 + 200000;

  try {
    // Helper to create test user
    const createTestUser = async (initialDiamonds: number, initialCoins = 0, name = 'TestUser') => {
      userCounter++;
      const idNum = userCounter;
      return await User.create({
        userId: idNum,
        userName: `${name}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        name,
        role: 'user',
        coins: initialCoins,
        diamonds: initialDiamonds,
        gender: 'male',
        device: {
          createdDeviceId: `test_dev_${idNum}`,
          lastDeviceId: `test_dev_${idNum}`
        }
      });
    };

    const createTestHost = async (name = 'TestHost') => {
      userCounter++;
      const idNum = userCounter;
      return await User.create({
        userId: idNum,
        userName: `${name}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        name,
        role: 'host',
        coins: 0,
        diamonds: 0,
        gender: 'female',
        isBusy: false,
        device: {
          createdDeviceId: `test_dev_${idNum}`,
          lastDeviceId: `test_dev_${idNum}`
        }
      });
    };

    const testGift = await Gift.create({
      name: 'Rose',
      icon: 'rose.png',
      cost: 100,
      category: 'popular',
      isActive: true,
    });

    // ------------------------------------------------------------------------
    // TEST 1: Balance = 100, Call = 1 second. Expected cost = 100, Balance = 0
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Balance = 100, Call = 1 sec ---');
    const u1 = await createTestUser(100, 0, 'User1');
    const h1 = await createTestHost('Host1');

    const txn1 = await CoinsTransaction.create({
      userId: u1._id,
      hostId: h1._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 1000),
      meta: { callDiamondsPerMinute: 100 }
    });

    const billRes1 = await BillingService.processActiveCallBilling(txn1._id as any);
    const u1_after = await User.findById(u1._id);
    const txn1_after = await CoinsTransaction.findById(txn1._id);

    console.log(`Test 1 Result: BilledMinutes=${billRes1.billedMinutes}, CoinsSpent=${txn1_after?.coinsSpent}, RemainingDiamonds=${u1_after?.diamonds}`);
    if (billRes1.success && txn1_after?.coinsSpent === 100 && u1_after?.diamonds === 0) {
      console.log('✅ TEST 1 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 1 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 2: Balance = 500, Call = 61 seconds. Expected cost = 200, Balance = 300
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Balance = 500, Call = 61 sec ---');
    const u2 = await createTestUser(500, 0, 'User2');
    const h2 = await createTestHost('Host2');

    const txn2 = await CoinsTransaction.create({
      userId: u2._id,
      hostId: h2._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 61000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn2._id as any);
    const u2_after = await User.findById(u2._id);
    const txn2_after = await CoinsTransaction.findById(txn2._id);

    console.log(`Test 2 Result: BilledMinutes=${txn2_after?.meta?.billedMinutes}, CoinsSpent=${txn2_after?.coinsSpent}, RemainingDiamonds=${u2_after?.diamonds}`);
    if (txn2_after?.coinsSpent === 200 && u2_after?.diamonds === 300) {
      console.log('✅ TEST 2 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 2 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 3: Balance = 500, Call = 119 seconds. Expected cost = 200, Balance = 300
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Balance = 500, Call = 119 sec ---');
    const u3 = await createTestUser(500, 0, 'User3');
    const h3 = await createTestHost('Host3');

    const txn3 = await CoinsTransaction.create({
      userId: u3._id,
      hostId: h3._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 119000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn3._id as any);
    const u3_after = await User.findById(u3._id);
    const txn3_after = await CoinsTransaction.findById(txn3._id);

    console.log(`Test 3 Result: BilledMinutes=${txn3_after?.meta?.billedMinutes}, CoinsSpent=${txn3_after?.coinsSpent}, RemainingDiamonds=${u3_after?.diamonds}`);
    if (txn3_after?.coinsSpent === 200 && u3_after?.diamonds === 300) {
      console.log('✅ TEST 3 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 3 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 4: Balance = 500, Call = 121 seconds. Expected cost = 300, Balance = 200
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Balance = 500, Call = 121 sec ---');
    const u4 = await createTestUser(500, 0, 'User4');
    const h4 = await createTestHost('Host4');

    const txn4 = await CoinsTransaction.create({
      userId: u4._id,
      hostId: h4._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 121000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn4._id as any);
    const u4_after = await User.findById(u4._id);
    const txn4_after = await CoinsTransaction.findById(txn4._id);

    console.log(`Test 4 Result: BilledMinutes=${txn4_after?.meta?.billedMinutes}, CoinsSpent=${txn4_after?.coinsSpent}, RemainingDiamonds=${u4_after?.diamonds}`);
    if (txn4_after?.coinsSpent === 300 && u4_after?.diamonds === 200) {
      console.log('✅ TEST 4 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 4 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 5: Balance = 500, Gift = 100, Call = 61s. Expected total deduction = 300, Balance = 200
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Balance = 500, Gift = 100, Call = 61s ---');
    const u5 = await createTestUser(500, 0, 'User5');
    const h5 = await createTestHost('Host5');

    const txn5 = await CoinsTransaction.create({
      userId: u5._id,
      hostId: h5._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 1000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn5._id as any);
    const giftRes5 = await deductUserWalletAtomic(u5._id as any, 100);

    txn5.callStart = new Date(Date.now() - 61000);
    await txn5.save();
    await BillingService.processActiveCallBilling(txn5._id as any);

    const u5_after = await User.findById(u5._id);
    const txn5_after = await CoinsTransaction.findById(txn5._id);

    console.log(`Test 5 Result: CallCoinsSpent=${txn5_after?.coinsSpent}, GiftDeducted=${giftRes5.success ? 100 : 0}, RemainingDiamonds=${u5_after?.diamonds}`);
    if (giftRes5.success && txn5_after?.coinsSpent === 200 && u5_after?.diamonds === 200) {
      console.log('✅ TEST 5 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 5 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 6: Balance = 100, Call active, Gift 100 -> Gift fails, Balance = 0
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Balance = 100, Call active, Gift 100 ---');
    const u6 = await createTestUser(100, 0, 'User6');
    const h6 = await createTestHost('Host6');

    const txn6 = await CoinsTransaction.create({
      userId: u6._id,
      hostId: h6._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 1000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn6._id as any);
    const giftRes6 = await deductUserWalletAtomic(u6._id as any, 100);
    const u6_after = await User.findById(u6._id);

    console.log(`Test 6 Result: GiftDeductSuccess=${giftRes6.success}, RemainingDiamonds=${u6_after?.diamonds}`);
    if (!giftRes6.success && u6_after?.diamonds === 0) {
      console.log('✅ TEST 6 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 6 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 7: Balance = 200, Call reaches Minute 3 (121s) -> Terminated, Balance = 0
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Balance = 200, Call reaches 121s ---');
    const u7 = await createTestUser(200, 0, 'User7');
    const h7 = await createTestHost('Host7');

    const txn7 = await CoinsTransaction.create({
      userId: u7._id,
      hostId: h7._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 121000),
      meta: { callDiamondsPerMinute: 100 }
    });

    const billRes7 = await BillingService.processActiveCallBilling(txn7._id as any);
    const u7_after = await User.findById(u7._id);
    const txn7_after = await CoinsTransaction.findById(txn7._id);

    console.log(`Test 7 Result: Terminated=${billRes7.terminated}, Status=${txn7_after?.status}, RemainingDiamonds=${u7_after?.diamonds}`);
    if (billRes7.terminated === true && txn7_after?.status === CallStatus.ENDED && u7_after?.diamonds === 0) {
      console.log('✅ TEST 7 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 7 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 8: Balance = 500, Call reaches 301s -> Terminated at Min 6, Balance = 0
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Balance = 500, Call reaches 301s ---');
    const u8 = await createTestUser(500, 0, 'User8');
    const h8 = await createTestHost('Host8');

    const txn8 = await CoinsTransaction.create({
      userId: u8._id,
      hostId: h8._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 301000),
      meta: { callDiamondsPerMinute: 100 }
    });

    const billRes8 = await BillingService.processActiveCallBilling(txn8._id as any);
    const u8_after = await User.findById(u8._id);
    const txn8_after = await CoinsTransaction.findById(txn8._id);

    console.log(`Test 8 Result: Terminated=${billRes8.terminated}, Status=${txn8_after?.status}, RemainingDiamonds=${u8_after?.diamonds}`);
    if (billRes8.terminated === true && txn8_after?.status === CallStatus.ENDED && u8_after?.diamonds === 0) {
      console.log('✅ TEST 8 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 8 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 9: Simultaneous Gift + Call Minute Billing Request -> No double spend
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Simultaneous Gift + Call Minute Billing ---');
    const u9 = await createTestUser(150, 0, 'User9');

    const [resA, resB] = await Promise.all([
      deductUserWalletAtomic(u9._id as any, 100),
      deductUserWalletAtomic(u9._id as any, 100),
    ]);

    const u9_after = await User.findById(u9._id);
    const successCount = [resA.success, resB.success].filter(Boolean).length;

    console.log(`Test 9 Result: SuccessCount=${successCount}, RemainingDiamonds=${u9_after?.diamonds}`);
    if (successCount === 1 && u9_after?.diamonds === 50) {
      console.log('✅ TEST 9 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 9 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 10: Repeat same billing request twice -> Idempotent single deduction
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Idempotent repeat billing request ---');
    const u10 = await createTestUser(500, 0, 'User10');
    const h10 = await createTestHost('Host10');

    const txn10 = await CoinsTransaction.create({
      userId: u10._id,
      hostId: h10._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 1000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn10._id as any);
    const u10_mid = await User.findById(u10._id);

    await BillingService.processActiveCallBilling(txn10._id as any);
    const u10_after = await User.findById(u10._id);
    const txn10_after = await CoinsTransaction.findById(txn10._id);

    console.log(`Test 10 Result: BilledMinutes=${txn10_after?.meta?.billedMinutes}, MidDiamonds=${u10_mid?.diamonds}, FinalDiamonds=${u10_after?.diamonds}`);
    if (u10_mid?.diamonds === 400 && u10_after?.diamonds === 400 && txn10_after?.coinsSpent === 100) {
      console.log('✅ TEST 10 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 10 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 11: Duplicate processCallEnd -> 1 deduction only, 1 host credit only
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Duplicate processCallEnd ---');
    const u11 = await createTestUser(500, 0, 'User11');
    const h11 = await createTestHost('Host11');

    const now11 = new Date();
    const txn11 = await CoinsTransaction.create({
      userId: u11._id,
      hostId: h11._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(now11.getTime() - 50000), // 50s (Minute 1 block = 100 diamonds)
      meta: { callDiamondsPerMinute: 100 }
    });

    const end11A = await BillingService.processCallEnd(txn11._id as any, now11);
    const h11_mid = await User.findById(h11._id);

    const end11B = await BillingService.processCallEnd(txn11._id as any, now11);
    const h11_after = await User.findById(h11._id);
    const u11_after = await User.findById(u11._id);

    console.log(`Test 11 Result: End1=${end11A.success}, End2=${end11B.success}, HostEarnings=${h11_after?.coins}, UserBalance=${u11_after?.diamonds}`);
    if (end11A.success && end11B.success && h11_mid?.coins === h11_after?.coins && u11_after?.diamonds === 400) {
      console.log('✅ TEST 11 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 11 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 12: Cron + processCallEnd Race Condition
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Cron + processCallEnd Race ---');
    const u12 = await createTestUser(500, 0, 'User12');
    const h12 = await createTestHost('Host12');

    const txn12 = await CoinsTransaction.create({
      userId: u12._id,
      hostId: h12._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 61000), // 61s
      meta: { callDiamondsPerMinute: 100 }
    });

    const [raceRes1, raceRes2] = await Promise.all([
      BillingService.processActiveCallBilling(txn12._id as any),
      BillingService.processCallEnd(txn12._id as any, new Date()),
    ]);

    const u12_after = await User.findById(u12._id);
    const txn12_after = await CoinsTransaction.findById(txn12._id);

    console.log(`Test 12 Result: CallCost=${txn12_after?.coinsSpent}, RemainingDiamonds=${u12_after?.diamonds}`);
    if (txn12_after?.coinsSpent === 200 && u12_after?.diamonds === 300) {
      console.log('✅ TEST 12 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 12 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 13: Server Restart Safety (Persistent DB state survives restart)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Server Restart Safety ---');
    const u13 = await createTestUser(500, 0, 'User13');
    const h13 = await createTestHost('Host13');

    const txn13 = await CoinsTransaction.create({
      userId: u13._id,
      hostId: h13._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 61000), // Minute 2 billed before restart
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn13._id as any); // Billed 2 minutes (200 diamonds)

    // Simulate Server Restart by fetching fresh document from DB
    const restartedTxn = await CoinsTransaction.findById(txn13._id);
    const billRes13 = await BillingService.processActiveCallBilling(restartedTxn?._id as any);

    const u13_after = await User.findById(u13._id);
    console.log(`Test 13 Result: BilledMinutes=${restartedTxn?.meta?.billedMinutes}, RemainingDiamonds=${u13_after?.diamonds}`);
    if (billRes13.success && u13_after?.diamonds === 300 && restartedTxn?.meta?.billedMinutes === 2) {
      console.log('✅ TEST 13 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 13 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 14: Diamonds-Only Wallet (coins = 0)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 14: Diamonds-Only Wallet (coins = 0) ---');
    const u14 = await createTestUser(500, 0, 'User14');
    const deductRes14 = await deductUserWalletAtomic(u14._id as any, 100);

    const u14_after = await User.findById(u14._id);
    console.log(`Test 14 Result: Success=${deductRes14.success}, CoinsDeduct=${deductRes14.coinsDeduct}, DiamondsDeduct=${deductRes14.diamondsDeduct}, RemainingDiamonds=${u14_after?.diamonds}`);
    if (deductRes14.success && deductRes14.coinsDeduct === 0 && deductRes14.diamondsDeduct === 100 && u14_after?.diamonds === 400) {
      console.log('✅ TEST 14 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 14 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 15: Insufficient Balance Mid-Call Balance Exhaustion
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 15: Insufficient Balance Mid-Call ---');
    const u15 = await createTestUser(100, 0, 'User15');
    const h15 = await createTestHost('Host15');

    const txn15 = await CoinsTransaction.create({
      userId: u15._id,
      hostId: h15._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 1000), // Minute 1 billed
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processActiveCallBilling(txn15._id as any); // Balance becomes 0

    // Call reaches Minute 2 (61s)
    txn15.callStart = new Date(Date.now() - 61000);
    await txn15.save();

    const billRes15 = await BillingService.processActiveCallBilling(txn15._id as any);
    const txn15_after = await CoinsTransaction.findById(txn15._id);

    console.log(`Test 15 Result: Terminated=${billRes15.terminated}, Status=${txn15_after?.status}`);
    if (billRes15.terminated === true && txn15_after?.status === CallStatus.ENDED) {
      console.log('✅ TEST 15 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 15 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 16: Repeated Socket Reconnect Safety
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 16: Repeated Socket Reconnect Safety ---');
    const u16 = await createTestUser(500, 0, 'User16');
    const h16 = await createTestHost('Host16');

    const txn16 = await CoinsTransaction.create({
      userId: u16._id,
      hostId: h16._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 1000),
      meta: { callDiamondsPerMinute: 100 }
    });

    await BillingService.processPulse(String(txn16._id));
    await BillingService.processPulse(String(txn16._id));
    await BillingService.processPulse(String(txn16._id));

    const u16_after = await User.findById(u16._id);
    const txn16_after = await CoinsTransaction.findById(txn16._id);

    console.log(`Test 16 Result: CoinsSpent=${txn16_after?.coinsSpent}, RemainingDiamonds=${u16_after?.diamonds}`);
    if (txn16_after?.coinsSpent === 100 && u16_after?.diamonds === 400) {
      console.log('✅ TEST 16 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 16 FAILED');
    }

    // ------------------------------------------------------------------------
    // TEST 17: Repeated Call End Event Response
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 17: Repeated Call End Event Response ---');
    const u17 = await createTestUser(500, 0, 'User17');
    const h17 = await createTestHost('Host17');

    const txn17 = await CoinsTransaction.create({
      userId: u17._id,
      hostId: h17._id,
      type: TransactionType.VOICE_CALL,
      status: CallStatus.ACCEPTED,
      callStart: new Date(Date.now() - 60000),
      meta: { callDiamondsPerMinute: 100 }
    });

    const res17A = await BillingService.processCallEnd(txn17._id as any, new Date());
    const res17B = await BillingService.processCallEnd(txn17._id as any, new Date());

    console.log(`Test 17 Result: ResA=${res17A.statusCode}, ResB=${res17B.statusCode}`);
    if (res17A.statusCode === 200 && res17B.statusCode === 200 && res17B.message.includes('already ended')) {
      console.log('✅ TEST 17 PASSED');
      passedTests++;
    } else {
      console.error('❌ TEST 17 FAILED');
    }

    // Cleanup test gift & test users
    await Gift.findByIdAndDelete(testGift._id);
    await User.deleteMany({ "device.createdDeviceId": { $regex: "^test_dev_" } });

    console.log('\n==================================================');
    console.log(`📊 17-TEST SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('==================================================');

    process.exit(passedTests === totalTests ? 0 : 1);

  } catch (err) {
    console.error('❌ Error executing call billing 17-test suite:', err);
    await User.deleteMany({ "device.createdDeviceId": { $regex: "^test_dev_" } });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
