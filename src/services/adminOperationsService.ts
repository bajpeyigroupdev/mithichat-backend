import { User } from '../models/user.model';
import { CoinsTransaction } from '../models/spentCoinModel';
import { RechargeHistory } from '../models/RechargeHistory';
import { Withdrawal } from '../models/withdrawal.model';
import { Room } from '../models/room.model';
import { CallRecording } from '../models/callRecording.model';
import { ModerationAlert } from '../models/moderationAlert.model';

const startOfDay = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date; };
const startOfWeek = () => { const date = startOfDay(); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date; };
const startOfMonth = () => { const date = startOfDay(); date.setDate(1); return date; };

async function callMetrics(since: Date) {
  const [row] = await CoinsTransaction.aggregate([
    { $match: { type: 'voice_call', createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: 1 }, durationSeconds: { $sum: { $ifNull: ['$duration', 0] } }, coinsSpent: { $sum: { $ifNull: ['$coinsSpent', 0] } }, hostEarnings: { $sum: { $ifNull: ['$hostEarning', 0] } }, completed: { $sum: { $cond: [{ $in: ['$status', ['ended', 'completed']] }, 1, 0] } }, missed: { $sum: { $cond: [{ $eq: ['$status', 'missed'] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'rejected', 'expired']] }, 1, 0] } } } },
  ]);
  return row || { total: 0, durationSeconds: 0, coinsSpent: 0, hostEarnings: 0, completed: 0, missed: 0, cancelled: 0 };
}

async function rechargeMetrics(since: Date, before?: Date) {
  const [row] = await RechargeHistory.aggregate([
    { $match: { date: { $gte: since, ...(before ? { $lt: before } : {}) }, status: { $nin: ['FAILED', 'REFUNDED'] }, settlementStatus: { $ne: 'FAILED' } } },
    { $group: { _id: null, revenue: { $sum: { $ifNull: ['$amount', 0] } }, diamonds: { $sum: { $ifNull: ['$diamonds', 0] } }, transactions: { $sum: 1 } } },
  ]);
  return row || { revenue: 0, diamonds: 0, transactions: 0 };
}

export async function getOperationsSnapshot() {
  const today = startOfDay(); const week = startOfWeek(); const month = startOfMonth();
  const [totalUsers, onlineUsers, activeUsers, newToday, newWeek, newMonth, bannedUsers, deletedUsers, totalHosts, onlineHosts, activeHosts, callsToday, callsWeek, callsMonth, revenueToday, revenueWeek, revenueMonth, pendingWithdrawals, withdrawalRows, activeRooms, roomParticipants, recordingAlerts, suspiciousUsers, unreviewedAlerts, activeCalls] = await Promise.all([
    User.countDocuments({ isDeleted: { $ne: true }, role: { $in: ['user', 'host'] } }),
    User.countDocuments({ isDeleted: { $ne: true }, isOnline: true }),
    User.countDocuments({ isDeleted: { $ne: true }, isBlocked: { $ne: true }, lastActiveAt: { $gte: new Date(Date.now() - 15 * 60_000) } }),
    User.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: today } }), User.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: week } }), User.countDocuments({ isDeleted: { $ne: true }, createdAt: { $gte: month } }),
    User.countDocuments({ isDeleted: { $ne: true }, isBlocked: true }), User.countDocuments({ isDeleted: true }),
    User.countDocuments({ role: 'host', isDeleted: { $ne: true } }), User.countDocuments({ role: 'host', isDeleted: { $ne: true }, isOnline: true }), User.countDocuments({ role: 'host', isDeleted: { $ne: true }, isActive: true }),
    callMetrics(today), callMetrics(week), callMetrics(month), rechargeMetrics(today), rechargeMetrics(week), rechargeMetrics(month),
    Withdrawal.countDocuments({ status: 'pending' }), Withdrawal.aggregate([{ $match: { createdAt: { $gte: month } } }, { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Room.countDocuments({ isActive: true }), Room.aggregate([{ $match: { isActive: true } }, { $project: { count: { $size: { $ifNull: ['$members', []] } } } }, { $group: { _id: null, total: { $sum: '$count' } } }]).then((rows) => rows[0]?.total || 0),
    ModerationAlert.countDocuments({ sourceType: 'recording', status: 'unreviewed' }), User.countDocuments({ moderationRiskLevel: { $in: ['HIGH', 'CRITICAL'] }, isDeleted: { $ne: true } }), ModerationAlert.countDocuments({ status: 'unreviewed' }),
    CoinsTransaction.countDocuments({ type: 'voice_call', status: { $in: ['accepted', 'connecting', 'connected'] } }),
  ]);
  return { generatedAt: new Date(), users: { total: totalUsers, active: activeUsers, online: onlineUsers, newToday, newWeek, newMonth, banned: bannedUsers, deleted: deletedUsers }, hosts: { total: totalHosts, active: activeHosts, online: onlineHosts }, calls: { today: callsToday, week: callsWeek, month: callsMonth, active: activeCalls }, revenue: { today: revenueToday, week: revenueWeek, month: revenueMonth, withdrawals: withdrawalRows, pendingWithdrawals }, rooms: { active: activeRooms, participants: roomParticipants }, ai: { recordingAlerts, suspiciousUsers, unreviewedAlerts } };
}

export async function executeAdminCommand(query: string) {
  const normalized = query.trim().toLowerCase();
  const result: any = { query, generatedAt: new Date(), databaseFacts: {}, calculatedMetrics: {}, aiInterpretation: null, recommendations: [], rows: [] };
  if (!normalized || normalized.length > 500) throw Object.assign(new Error('Query must be between 1 and 500 characters'), { statusCode: 400 });
  if (normalized.includes('summary') || normalized.includes('platform')) { result.databaseFacts = await getOperationsSnapshot(); result.aiInterpretation = 'Rule-based operational summary derived from the displayed database snapshot; no external model was used.'; return result; }
  if (normalized.includes('revenue')) {
    const period = normalized.includes('month') ? startOfMonth() : normalized.includes('week') ? startOfWeek() : startOfDay();
    const previousStart = new Date(period.getTime() - (Date.now() - period.getTime())); const [current, previous] = await Promise.all([rechargeMetrics(period), rechargeMetrics(previousStart, period)]);
    result.databaseFacts = { periodStart: period, revenue: current.revenue, rechargeTransactions: current.transactions, diamondsSold: current.diamonds };
    result.calculatedMetrics = { changePercent: previous.revenue > 0 ? Number((((current.revenue - previous.revenue) / previous.revenue) * 100).toFixed(2)) : null };
    result.aiInterpretation = 'Comparison is arithmetic over settled/non-failed recharge records. A null change means no comparable prior-period revenue.'; return result;
  }
  if (normalized.includes('top') && normalized.includes('host')) {
    const since = normalized.includes('month') ? startOfMonth() : normalized.includes('week') ? startOfWeek() : startOfDay();
    result.rows = await CoinsTransaction.aggregate([{ $match: { type: 'voice_call', createdAt: { $gte: since }, status: 'ended' } }, { $group: { _id: '$hostId', earnings: { $sum: { $ifNull: ['$hostEarning', 0] } }, calls: { $sum: 1 }, durationSeconds: { $sum: { $ifNull: ['$duration', 0] } } } }, { $sort: { earnings: -1 } }, { $limit: 20 }, { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'host' } }, { $unwind: { path: '$host', preserveNullAndEmptyArrays: true } }, { $project: { hostId: '$_id', _id: 0, name: '$host.name', meethiId: '$host.meethiId', earnings: 1, calls: 1, durationSeconds: 1 } }]);
    result.databaseFacts = { periodStart: since, resultCount: result.rows.length }; return result;
  }
  if (normalized.includes('suspicious') || normalized.includes('high risk')) {
    result.rows = await User.find({ moderationRiskLevel: { $in: ['HIGH', 'CRITICAL'] }, isDeleted: { $ne: true } }).select('name userName meethiId userId moderationRiskScore moderationRiskLevel moderationLastViolationAt').sort({ moderationRiskScore: -1 }).limit(50).lean();
    result.databaseFacts = { resultCount: result.rows.length, source: 'user moderation risk fields' }; result.aiInterpretation = 'Risk labels are screening signals for human review, not proof of wrongdoing.'; return result;
  }
  const durationMatch = normalized.match(/(?:longer|over|more than)\s+(\d+)\s*(minute|min)/);
  if (normalized.includes('call') && durationMatch) {
    const seconds = Number(durationMatch[1]) * 60; result.rows = await CoinsTransaction.find({ type: 'voice_call', duration: { $gt: seconds } }).select('userId hostId status duration coinsSpent hostEarning callStart callEnd').populate('userId', 'name meethiId userId').populate('hostId', 'name meethiId userId').sort({ callStart: -1 }).limit(100).lean();
    result.databaseFacts = { thresholdSeconds: seconds, resultCount: result.rows.length }; return result;
  }
  if (normalized.includes('moderation') || normalized.includes('alert')) {
    result.rows = await ModerationAlert.find({ status: 'unreviewed' }).populate('userId', 'name meethiId userId').populate('hostId', 'name meethiId userId').sort({ createdAt: -1 }).limit(50).lean(); result.databaseFacts = { resultCount: result.rows.length }; result.aiInterpretation = 'Detections are model/rule outputs requiring human review.'; return result;
  }
  if (normalized.includes('record')) {
    const countMatch = normalized.match(/(?:last|latest)\s+(\d+)/); const limit = Math.min(50, Math.max(1, Number(countMatch?.[1] || 20)));
    result.rows = await CallRecording.find({ status: { $ne: 'deleted' } }).select('-transcript.text -transcript.segments -internalNotes').populate('callerId', 'name meethiId userId').populate('hostId', 'name meethiId userId').sort({ createdAt: -1 }).limit(limit).lean(); result.databaseFacts = { resultCount: result.rows.length }; return result;
  }
  result.databaseFacts = { supportedCommands: ['platform summary', 'today revenue', 'top hosts today', 'suspicious users', 'calls longer than 30 minutes', 'moderation alerts', 'last 20 recordings'] };
  result.aiInterpretation = 'No supported read-only data intent was recognized. No database claim was generated.'; return result;
}
