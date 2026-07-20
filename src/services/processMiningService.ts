import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import { Logger } from '../utils/logger';

export async function analyzeProcessMiningBottlenecks() {
    try {
        const pendingApps = await RecruitmentApplication.find({ status: 'pending' }).lean();

        const bottlenecks = pendingApps.map(app => ({
            applicationId: app.applicationId,
            role: app.role,
            daysInStage: Math.floor((Date.now() - new Date(app.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
            slaStatus: Math.floor((Date.now() - new Date(app.createdAt).getTime()) / (1000 * 60 * 60 * 24)) > 3 ? 'SLA_VIOLATED' : 'WITHIN_SLA'
        }));

        const slaViolatedCount = bottlenecks.filter(b => b.slaStatus === 'SLA_VIOLATED').length;

        return {
            success: true,
            totalPending: pendingApps.length,
            slaViolatedCount,
            suggestions: [
                'Auto-assign files older than 3 days to backup reviewers',
                'Enable automatic email reminders for unreviewed Customer Service applications'
            ],
            bottlenecks
        };
    } catch (error: any) {
        await Logger('analyzeProcessMiningBottlenecks', error);
        return { success: false, bottlenecks: [] };
    }
}
