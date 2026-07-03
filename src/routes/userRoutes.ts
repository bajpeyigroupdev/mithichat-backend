import express from "express";
import {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser,
  uploadImage,
  emailVerification,
  otpVerification,
  setVerifiedPhone,
  getRechargeHistory,
  saveFcmToken,
  toggleActiveStatus,
  setUserName,
  getAllHosts,
  blockContact,
  unblockContact,
  getBlockedContacts,
  getCoinHistory,
} from "../controllers/userController";

import { verifyToken } from "../middlewares/authorize.middleware";
// import { upload } from "../utils/multer";
import { validationUpdateUserLimited } from "../validations/user.validator";
import { requestValidator } from "../middlewares/validation.middleware";

const router = express.Router();

// set user name for Authorized User
router.post("/set-username", verifyToken, setUserName)

router.post("/verify-phone", verifyToken, setVerifiedPhone)

// email verification for Authorized User 
router.post("/verify-email", verifyToken, emailVerification);

// verify otp for authorized user 
router.post("/verify-otp", verifyToken, otpVerification);

// save fcm token 
router.post("/save-fcm", verifyToken, saveFcmToken as any)

// get all users
router.get("/", verifyToken, getUsers);

// get recharge history
router.get("/recharge-history", verifyToken, getRechargeHistory);

// get coin transaction history
router.get("/coin-history", verifyToken, getCoinHistory);

// get all hosts
router.get("/hosts", verifyToken, getAllHosts);

// block contact list
router.get("/blocked-contacts", verifyToken, getBlockedContacts);
router.post("/block-contact/:id", verifyToken, blockContact);
router.post("/unblock-contact/:id", verifyToken, unblockContact);

// get user by id
router.get("/:userId", verifyToken, getUserById);

// toggle active status
router.patch("/status", verifyToken, toggleActiveStatus);

// update user by id
router.patch("/:userId", validationUpdateUserLimited, requestValidator, verifyToken, updateUser);

// delete user by id
router.delete("/:userId", verifyToken, deleteUser);

// block user by id (only superAdmin/admin)
router.patch("/block/:userId", verifyToken, blockUser);

// unblock user by id (only superAdmin)
router.patch("/unblock/:userId", verifyToken, unblockUser);

// // upload profile image by userId (self or superAdmin)
// router.patch(
//   "/upload/:id",
//   verifyToken,
//   uploadImage as any
// );


// // upload profile image by userId (self or superAdmin)
// router.patch(
//   "/upload/:id",
//   verifyToken,
//   uploadImage as any
// );

export default router;

