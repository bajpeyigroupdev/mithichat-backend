import mongoose from 'mongoose';
import express from 'express';
import http from 'http';
import axios from 'axios';
import { User } from '../models/user.model';
import { DeviceLimit } from '../models/deviceLimit.model';
import { DeviceRegistrationLock } from '../models/deviceRegistrationLock.model';
import { config } from '../configs/envConfig';
import { AuthRoutes, adminRoutes } from '../routes';

const TEST_PORT = 5999;
const API_BASE = `http://127.0.0.1:${TEST_PORT}`;

async function runTestMatrix() {
  console.log("==================================================");
  console.log("🧪 EXECUTING FULL DEVICE REGISTRATION LIMIT TEST MATRIX");
  console.log("==================================================");

  // 1. Setup local express test server
  const app = express();
  app.use(express.json());
  app.use("/auth", AuthRoutes);
  app.use("/api/admin", adminRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(TEST_PORT, "127.0.0.1", () => resolve()));
  console.log(`✅ Test server running on ${API_BASE}`);

  try {
    await mongoose.connect(config.MONGO_URI as string);
    console.log("✅ Connected to MongoDB");

    const deviceA = `TEST_DEVICE_A_${Date.now()}`;
    const deviceB = `TEST_DEVICE_B_${Date.now()}`;
    const deviceC = `TEST_DEVICE_C_${Date.now()}`;

    const testResults: { name: string; pass: boolean; details: string }[] = [];

    // Helper function to cleanup test data
    const cleanupTestDevices = async () => {
      const testDeviceIds = [deviceA, deviceB, deviceC];
      await User.deleteMany({
        $or: [
          { "device.createdDeviceId": { $in: testDeviceIds } },
          { "device.currentDeviceId": { $in: testDeviceIds } },
          { deviceId: { $in: testDeviceIds } }
        ]
      });
      await DeviceLimit.deleteMany({ deviceId: { $in: testDeviceIds } });
      await DeviceRegistrationLock.deleteMany({ deviceId: { $in: testDeviceIds } });
    };

    await cleanupTestDevices();

    // TEST 1: New Device A -> Register Account 1
    console.log("\n--- TEST 1: Register Account 1 on New Device A ---");
    try {
      const phone1 = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res1 = await axios.post(`${API_BASE}/auth/user-signup`, {
        phoneNumber: phone1,
        password: "TestPassword123!",
        gender: "male",
        deviceId: deviceA,
        userFrom: "app",
        firebaseIdToken: "test_bypass_token"
      });

      const user1InDb = await User.countDocuments({ "device.createdDeviceId": deviceA, isDeleted: false });
      if (res1.data.success && user1InDb === 1) {
        testResults.push({ name: "TEST 1: Device A Account 1 Registration", pass: true, details: `Successfully created Account 1. DB count = 1` });
        console.log("✅ TEST 1 PASSED");
      } else {
        testResults.push({ name: "TEST 1: Device A Account 1 Registration", pass: false, details: `Unexpected response or DB count: ${user1InDb}` });
        console.log("❌ TEST 1 FAILED");
      }
    } catch (err: any) {
      testResults.push({ name: "TEST 1: Device A Account 1 Registration", pass: false, details: err.response?.data?.message || err.message });
      console.log("❌ TEST 1 FAILED:", err.response?.data || err.message);
    }

    // TEST 2: Same Device A -> Register Account 2 (Default limit = 1)
    console.log("\n--- TEST 2: Register Account 2 on Device A (Default Limit = 1) ---");
    try {
      const phone2 = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      await axios.post(`${API_BASE}/auth/user-signup`, {
        phoneNumber: phone2,
        password: "TestPassword123!",
        gender: "female",
        deviceId: deviceA,
        userFrom: "app",
        firebaseIdToken: "test_bypass_token"
      });
      testResults.push({ name: "TEST 2: Device A Account 2 Blocked", pass: false, details: "Allowed creation when limit was 1!" });
      console.log("❌ TEST 2 FAILED (Should have blocked)");
    } catch (err: any) {
      const data = err.response?.data;
      const userCountInDb = await User.countDocuments({ "device.createdDeviceId": deviceA, isDeleted: false });
      if (data?.code === "DEVICE_REGISTRATION_LIMIT_REACHED" && userCountInDb === 1) {
        testResults.push({ name: "TEST 2: Device A Account 2 Blocked", pass: true, details: `Blocked with code ${data.code}. Message: "${data.message}". DB count remained 1.` });
        console.log("✅ TEST 2 PASSED:", data.message);
      } else {
        testResults.push({ name: "TEST 2: Device A Account 2 Blocked", pass: false, details: `Wrong code/DB count. Code: ${data?.code}, DB: ${userCountInDb}` });
        console.log("❌ TEST 2 FAILED:", data);
      }
    }

    // TEST 3: Different Device B -> Register Account 1
    console.log("\n--- TEST 3: Register Account 1 on Device B ---");
    try {
      const phone3 = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res3 = await axios.post(`${API_BASE}/auth/user-signup`, {
        phoneNumber: phone3,
        password: "TestPassword123!",
        gender: "male",
        deviceId: deviceB,
        userFrom: "app",
        firebaseIdToken: "test_bypass_token"
      });
      const userBInDb = await User.countDocuments({ "device.createdDeviceId": deviceB, isDeleted: false });
      if (res3.data.success && userBInDb === 1) {
        testResults.push({ name: "TEST 3: Device B Account 1 Registration", pass: true, details: "Allowed Account 1 on independent Device B" });
        console.log("✅ TEST 3 PASSED");
      } else {
        testResults.push({ name: "TEST 3: Device B Account 1 Registration", pass: false, details: "Failed for Device B" });
        console.log("❌ TEST 3 FAILED");
      }
    } catch (err: any) {
      testResults.push({ name: "TEST 3: Device B Account 1 Registration", pass: false, details: err.response?.data?.message || err.message });
      console.log("❌ TEST 3 FAILED:", err.response?.data || err.message);
    }

    // TEST 4: Admin Limit Override (Limit 1 -> 2 for Device A) & Register Account 2
    console.log("\n--- TEST 4: Admin Override Limit 1 -> 2 for Device A & Register Account 2 ---");
    try {
      await DeviceLimit.findOneAndUpdate(
        { deviceId: deviceA },
        { $set: { maxAllowedAccounts: 2, note: "Admin test override to 2" } },
        { upsert: true }
      );

      const phone2Retry = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res4 = await axios.post(`${API_BASE}/auth/user-signup`, {
        phoneNumber: phone2Retry,
        password: "TestPassword123!",
        gender: "female",
        deviceId: deviceA,
        userFrom: "app",
        firebaseIdToken: "test_bypass_token"
      });

      const userAInDb = await User.countDocuments({ "device.createdDeviceId": deviceA, isDeleted: false });
      if (res4.data.success && userAInDb === 2) {
        testResults.push({ name: "TEST 4: Device A Account 2 after Admin Override to 2", pass: true, details: `Account 2 allowed after limit increased to 2. DB count = 2` });
        console.log("✅ TEST 4 PASSED");
      } else {
        testResults.push({ name: "TEST 4: Device A Account 2 after Admin Override to 2", pass: false, details: `Failed: DB count = ${userAInDb}` });
        console.log("❌ TEST 4 FAILED");
      }
    } catch (err: any) {
      testResults.push({ name: "TEST 4: Device A Account 2 after Admin Override to 2", pass: false, details: err.response?.data?.message || err.message });
      console.log("❌ TEST 4 FAILED:", err.response?.data || err.message);
    }

    // TEST 5: Device A Account 3 Blocked at Limit = 2
    console.log("\n--- TEST 5: Attempt Account 3 on Device A (Limit = 2) ---");
    try {
      const phone5 = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      await axios.post(`${API_BASE}/auth/user-signup`, {
        phoneNumber: phone5,
        password: "TestPassword123!",
        gender: "female",
        deviceId: deviceA,
        userFrom: "app",
        firebaseIdToken: "test_bypass_token"
      });
      testResults.push({ name: "TEST 5: Device A Account 3 Blocked at Limit 2", pass: false, details: "Allowed creation when limit was 2!" });
      console.log("❌ TEST 5 FAILED");
    } catch (err: any) {
      const data = err.response?.data;
      const userCountInDb = await User.countDocuments({ "device.createdDeviceId": deviceA, isDeleted: false });
      if (data?.code === "DEVICE_REGISTRATION_LIMIT_REACHED" && userCountInDb === 2) {
        testResults.push({ name: "TEST 5: Device A Account 3 Blocked at Limit 2", pass: true, details: `Blocked correctly with limit 2. DB count = 2.` });
        console.log("✅ TEST 5 PASSED:", data.message);
      } else {
        testResults.push({ name: "TEST 5: Device A Account 3 Blocked at Limit 2", pass: false, details: `Wrong error. DB: ${userCountInDb}` });
        console.log("❌ TEST 5 FAILED:", data);
      }
    }

    // TEST 6: Admin Limit Override 2 -> 3 for Device A & Register Account 3
    console.log("\n--- TEST 6: Admin Override Limit 2 -> 3 & Register Account 3 ---");
    try {
      await DeviceLimit.findOneAndUpdate(
        { deviceId: deviceA },
        { $set: { maxAllowedAccounts: 3, note: "Admin test override to 3" } },
        { upsert: true }
      );

      const phone6 = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res6 = await axios.post(`${API_BASE}/auth/user-signup`, {
        phoneNumber: phone6,
        password: "TestPassword123!",
        gender: "male",
        deviceId: deviceA,
        userFrom: "app",
        firebaseIdToken: "test_bypass_token"
      });

      const userAInDb = await User.countDocuments({ "device.createdDeviceId": deviceA, isDeleted: false });
      if (res6.data.success && userAInDb === 3) {
        testResults.push({ name: "TEST 6: Device A Account 3 after Override to 3", pass: true, details: `Account 3 created successfully. DB count = 3` });
        console.log("✅ TEST 6 PASSED");
      } else {
        testResults.push({ name: "TEST 6: Device A Account 3 after Override to 3", pass: false, details: `DB count = ${userAInDb}` });
        console.log("❌ TEST 6 FAILED");
      }
    } catch (err: any) {
      testResults.push({ name: "TEST 6: Device A Account 3 after Override to 3", pass: false, details: err.response?.data?.message || err.message });
      console.log("❌ TEST 6 FAILED:", err.response?.data || err.message);
    }

    // TEST 7: Phone Availability / OTP Check Blocked at Limit = 3
    console.log("\n--- TEST 7: Phone Check Endpoint Blocked when Device Limit Reached ---");
    try {
      const phone7 = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
      await axios.post(`${API_BASE}/auth/user-phone-check`, {
        phoneNumber: phone7,
        deviceId: deviceA
      });
      testResults.push({ name: "TEST 7: Phone Check Endpoint Blocked", pass: false, details: "Allowed OTP check when limit reached!" });
      console.log("❌ TEST 7 FAILED");
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.code === "DEVICE_REGISTRATION_LIMIT_REACHED") {
        testResults.push({ name: "TEST 7: Phone Check Endpoint Blocked", pass: true, details: "OTP check blocked with code DEVICE_REGISTRATION_LIMIT_REACHED" });
        console.log("✅ TEST 7 PASSED:", data.message);
      } else {
        testResults.push({ name: "TEST 7: Phone Check Endpoint Blocked", pass: false, details: `Unexpected error: ${JSON.stringify(data)}` });
        console.log("❌ TEST 7 FAILED:", data);
      }
    }

    // TEST 8: Race Condition Protection (Simultaneous Registrations on Device C)
    console.log("\n--- TEST 8: Concurrent Simultaneous Registrations (Device C, Limit = 1) ---");
    try {
      const promises = Array.from({ length: 5 }).map((_, idx) => {
        const phoneC = `999${Math.floor(1000000 + Math.random() * 9000000)}`;
        return axios.post(`${API_BASE}/auth/user-signup`, {
          phoneNumber: phoneC,
          password: "TestPassword123!",
          gender: "male",
          deviceId: deviceC,
          userFrom: "app",
          firebaseIdToken: "test_bypass_token"
        }).then(r => ({ status: "fulfilled", data: r.data }))
          .catch(e => ({ status: "rejected", data: e.response?.data }));
      });

      const results = await Promise.all(promises);
      const fulfilled = results.filter(r => r.status === "fulfilled");
      const rejected = results.filter(r => r.status === "rejected" && r.data?.code === "DEVICE_REGISTRATION_LIMIT_REACHED");
      const dbCountC = await User.countDocuments({ "device.createdDeviceId": deviceC, isDeleted: false });

      if (fulfilled.length === 1 && rejected.length === 4 && dbCountC === 1) {
        testResults.push({ name: "TEST 8: Concurrent Registration Race Condition Protection", pass: true, details: `Exactly 1 registration succeeded, 4 rejected atomically by DeviceRegistrationLock. DB count = 1.` });
        console.log("✅ TEST 8 PASSED: Atomic lock prevented duplicate accounts during simultaneous burst!");
      } else {
        testResults.push({ name: "TEST 8: Concurrent Registration Race Condition Protection", pass: false, details: `Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}, DB Count: ${dbCountC}` });
        console.log("❌ TEST 8 FAILED:", { fulfilled: fulfilled.length, rejected: rejected.length, dbCountC });
      }
    } catch (err: any) {
      testResults.push({ name: "TEST 8: Concurrent Registration Race Condition Protection", pass: false, details: err.message });
      console.log("❌ TEST 8 FAILED:", err.message);
    }

    // Cleanup test data
    await cleanupTestDevices();
    server.close();

    console.log("\n==================================================");
    console.log("📊 SUMMARY OF TEST MATRIX RESULTS");
    console.log("==================================================");
    let allPassed = true;
    testResults.forEach((tr, i) => {
      console.log(`[${tr.pass ? "PASS" : "FAIL"}] ${tr.name}: ${tr.details}`);
      if (!tr.pass) allPassed = false;
    });

    if (allPassed) {
      console.log("\n🎉 ALL DEVICE REGISTRATION LIMIT TESTS PASSED 100%!");
    } else {
      console.log("\n⚠️ SOME TESTS FAILED.");
    }

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error("❌ Error running test matrix:", error);
    server.close();
    process.exit(1);
  }
}

runTestMatrix();
