import { Request, Response } from 'express';
import { EnterpriseTask } from '../models/task.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getTasks = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id;
        const { status, priority } = req.query;

        const query: any = {};
        if (userId) query.$or = [{ assignedTo: userId }, { assignedBy: userId }];
        if (status) query.status = status;
        if (priority) query.priority = priority;

        const tasks = await EnterpriseTask.find(query).sort({ updatedAt: -1 }).lean();
        return sendResponse(res, 200, true, 'Tasks fetched', tasks);
    } catch (error: any) {
        await Logger('getTasks', error);
        return sendResponse(res, 500, false, 'Failed to fetch tasks');
    }
};

export const createTask = async (req: Request, res: Response) => {
    try {
        const { title, description, assignedTo, assignedToName, priority, dueDate } = req.body;
        if (!title || !assignedTo) {
            return sendResponse(res, 400, false, 'Task title and assignee are required');
        }

        const user = (req as any).user;
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const taskId = `TSK-${randNum}`;

        const task = await EnterpriseTask.create({
            taskId,
            title,
            description,
            assignedTo,
            assignedToName: assignedToName || 'Staff Member',
            assignedBy: user?._id,
            assignedByName: user?.name || 'Manager',
            priority: priority || 'medium',
            dueDate: dueDate ? new Date(dueDate) : undefined,
            status: 'todo'
        });

        return sendResponse(res, 201, true, 'Task created successfully', task);
    } catch (error: any) {
        await Logger('createTask', error);
        return sendResponse(res, 500, false, 'Failed to create task');
    }
};

export const updateTaskStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const task = await EnterpriseTask.findOneAndUpdate(
            { $or: [{ _id: id }, { taskId: id }] },
            { status },
            { new: true }
        );

        if (!task) {
            return sendResponse(res, 404, false, 'Task not found');
        }

        return sendResponse(res, 200, true, `Task status updated to ${status}`, task);
    } catch (error: any) {
        await Logger('updateTaskStatus', error);
        return sendResponse(res, 500, false, 'Failed to update task status');
    }
};
