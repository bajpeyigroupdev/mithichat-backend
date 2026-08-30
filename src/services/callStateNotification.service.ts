import { User } from '../models/user.model';
import { sendCallStateNotification } from '../utils/pushNotification';

export type TerminalCallState = 'ended' | 'cancelled' | 'rejected' | 'expired';

export const notifyHostCallState = async (
  hostId: unknown,
  transactionId: string,
  state: TerminalCallState,
  eventAt: Date = new Date()
): Promise<void> => {
  const host = await User.findById(hostId).select('fcmToken').lean();
  if (!host?.fcmToken) return;

  await sendCallStateNotification(host.fcmToken, transactionId, state, eventAt);
};