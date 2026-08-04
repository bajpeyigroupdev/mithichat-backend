import mongoose, { Document, Model, Types, ClientSession } from 'mongoose';
import { UserInterface } from '../interfaces/user.interface';
import { User } from '../models/user.model';

type BalanceOperation = 'add' | 'deduct' | 'earn';

async function updateBalance(
  userId: Types.ObjectId,
  amount: number,
  operation: BalanceOperation,
  session?: ClientSession
): Promise<UserInterface> {
  if (!userId || typeof amount !== 'number' || amount <= 0) {
    throw new Error('Invalid userId or amount provided for balance update.');
  }

  let updateObject: any = {};
  let filter: any = { _id: userId };
  let targetField: string;
  let operatorValue: number = amount;

  switch (operation.toLowerCase() as BalanceOperation) {
    case 'add':
      targetField = 'coins';
      updateObject = { $inc: { coins: amount } };
      break;

    case 'earn':
      targetField = 'diamonds';
      updateObject = { $inc: { diamonds: amount } };
      break;

    case 'deduct': {
      const userToDeduct = await User.findById(userId).session(session || null);
      const totalAvail = Number(userToDeduct?.coins || 0) + Number(userToDeduct?.diamonds || 0);
      if (!userToDeduct || totalAvail < amount) {
        throw new Error(`Insufficient balance. Available: ${totalAvail}, Required: ${amount}`);
      }
      let remainingDeduct = amount;
      let coinsDeduct = Math.min(userToDeduct.coins || 0, remainingDeduct);
      remainingDeduct -= coinsDeduct;
      let diamondsDeduct = Math.min(userToDeduct.diamonds || 0, remainingDeduct);

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { coins: -coinsDeduct, diamonds: -diamondsDeduct } },
        { new: true, runValidators: true, session }
      ).exec();

      if (!updatedUser) {
        throw new Error(`User with ID ${userId} update failed.`);
      }
      try {
        const { getIO, getUserRoom } = require('../sockets');
        const io = getIO();
        if (io) {
          io.to(getUserRoom(String(updatedUser._id))).emit('balanceUpdated', {
            userId: String(updatedUser._id),
            coins: Number(updatedUser.coins || 0),
            diamonds: Number(updatedUser.diamonds || 0),
            totalBalance: Number(updatedUser.coins || 0) + Number(updatedUser.diamonds || 0),
          });
        }
      } catch (e) {}
      return updatedUser;
    }

    default:
      throw new Error(`Invalid operation type: ${operation}. Must be 'add', 'deduct', or 'earn'.`);
  }

  const updatedUser = await User.findOneAndUpdate(
    filter,
    updateObject,
    { new: true, runValidators: true, session }
  ).exec();

  if (!updatedUser) {
    throw new Error(`User with ID ${userId} not found or update failed.`);
  }

  try {
    const { getIO, getUserRoom } = require('../sockets');
    const io = getIO();
    if (io) {
      io.to(getUserRoom(String(updatedUser._id))).emit('balanceUpdated', {
        userId: String(updatedUser._id),
        coins: Number(updatedUser.coins || 0),
        diamonds: Number(updatedUser.diamonds || 0),
        totalBalance: Number(updatedUser.coins || 0) + Number(updatedUser.diamonds || 0),
      });
    }
  } catch (e) {}

  return updatedUser;
}

export { updateBalance, BalanceOperation };
