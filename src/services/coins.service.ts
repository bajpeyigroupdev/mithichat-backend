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
      break;

    case 'deduct':
      targetField = 'coins';
      // Safety Check: user must have enough coins
      filter['coins'] = { $gte: amount };
      operatorValue = -amount;
      break;

    case 'earn':
      targetField = 'coins'; // Or earnings
      break;

    default:
      throw new Error(`Invalid operation type: ${operation}. Must be 'add', 'deduct', or 'earn'.`);
  }

  updateObject = { $inc: { [targetField]: operatorValue } };

  const updatedUser = await User.findOneAndUpdate(
    filter,
    updateObject,
    { new: true, runValidators: true, session }
  ).exec();

  if (!updatedUser) {
    // If it failed during deduct, it might be due to insufficient funds (filter constraint)
    if (operation === 'deduct') {
      const userExists = await User.findById(userId).session(session || null);
      if (userExists && (userExists.coins || 0) < amount) {
        throw new Error(`Insufficient balance. Available: ${userExists.coins}, Required: ${amount}`);
      }
    }
    throw new Error(`User with ID ${userId} not found or update failed.`);
  }

  return updatedUser;
}

export { updateBalance, BalanceOperation };