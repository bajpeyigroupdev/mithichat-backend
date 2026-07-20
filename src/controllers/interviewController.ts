import { Request, Response } from 'express';
import { InterviewSchedule } from '../models/interviewSchedule.model';
import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const scheduleInterview = async (req: Request, res: Response) => {
    try {
        const { applicationId, candidateName, candidateEmail, scheduledAt, meetingUrl, interviewerId, interviewerName } = req.body;
        if (!applicationId || !candidateName || !candidateEmail || !scheduledAt) {
            return sendResponse(res, 400, false, 'Application ID, Candidate details, and Date/Time are required');
        }

        const interviewerUser = (req as any).user;

        const interview = await InterviewSchedule.create({
            applicationId,
            candidateName,
            candidateEmail,
            interviewerId: interviewerId || interviewerUser?._id,
            interviewerName: interviewerName || interviewerUser?.name || 'HR Interviewer',
            scheduledAt: new Date(scheduledAt),
            meetingUrl: meetingUrl || `https://meet.jit.si/MeethiChat-Interview-${applicationId}`,
            status: 'scheduled'
        });

        // Update Application Status to interview_scheduled
        await RecruitmentApplication.findOneAndUpdate(
            { applicationId },
            { status: 'interview_scheduled' }
        );

        return sendResponse(res, 201, true, 'Interview scheduled successfully', interview);
    } catch (error: any) {
        await Logger('scheduleInterview', error);
        return sendResponse(res, 500, false, 'Failed to schedule interview');
    }
};

export const getInterviews = async (req: Request, res: Response) => {
    try {
        const { status, applicationId } = req.query;
        const query: any = {};
        if (status) query.status = status;
        if (applicationId) query.applicationId = applicationId;

        const interviews = await InterviewSchedule.find(query).sort({ scheduledAt: 1 }).lean();
        return sendResponse(res, 200, true, 'Interviews fetched', interviews);
    } catch (error: any) {
        await Logger('getInterviews', error);
        return sendResponse(res, 500, false, 'Failed to fetch interviews');
    }
};

export const submitScorecard = async (req: Request, res: Response) => {
    try {
        const { interviewId } = req.params;
        const { rating, feedbackNotes, recommendation } = req.body;

        const interview = await InterviewSchedule.findById(interviewId);
        if (!interview) {
            return sendResponse(res, 404, false, 'Interview not found');
        }

        interview.status = 'completed';
        interview.scorecard = {
            rating: Number(rating) || 4,
            feedbackNotes: feedbackNotes || '',
            recommendation: recommendation || 'hire'
        };

        await interview.save();

        // Update application status to interview_completed
        await RecruitmentApplication.findOneAndUpdate(
            { applicationId: interview.applicationId },
            { status: 'interview_completed' }
        );

        return sendResponse(res, 200, true, 'Interview evaluation submitted', interview);
    } catch (error: any) {
        await Logger('submitScorecard', error);
        return sendResponse(res, 500, false, 'Failed to submit scorecard');
    }
};
