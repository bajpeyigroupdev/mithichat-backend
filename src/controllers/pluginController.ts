import { Request, Response } from 'express';
import { PluginManifest } from '../models/plugin.model';
import sendResponse from '../utils/reponse';
import { Logger } from '../utils/logger';

export const getAllPlugins = async (_req: Request, res: Response) => {
    try {
        const plugins = await PluginManifest.find().lean();
        return sendResponse(res, 200, true, 'Plugins retrieved', plugins);
    } catch (error: any) {
        await Logger('getAllPlugins', error);
        return sendResponse(res, 500, false, 'Failed to fetch plugins');
    }
};

export const togglePluginStatus = async (req: Request, res: Response) => {
    try {
        const { pluginId } = req.params;
        const { isEnabled } = req.body;

        const plugin = await PluginManifest.findOneAndUpdate(
            { pluginId },
            { isEnabled: Boolean(isEnabled) },
            { new: true }
        );

        if (!plugin) {
            return sendResponse(res, 404, false, 'Plugin not found');
        }

        return sendResponse(res, 200, true, `Plugin status updated to ${plugin.isEnabled ? 'Active' : 'Disabled'}`, plugin);
    } catch (error: any) {
        await Logger('togglePluginStatus', error);
        return sendResponse(res, 500, false, 'Failed to toggle plugin status');
    }
};

export const registerNewPlugin = async (req: Request, res: Response) => {
    try {
        const { pluginId, name, version, description, category, routes, requiredPermissions } = req.body;
        if (!pluginId || !name) {
            return sendResponse(res, 400, false, 'Plugin ID and Name are required');
        }

        const plugin = await PluginManifest.create({
            pluginId,
            name,
            version: version || '1.0.0',
            description,
            category: category || 'hr',
            routes: routes || [],
            requiredPermissions: requiredPermissions || [],
            isEnabled: true
        });

        return sendResponse(res, 201, true, 'Plugin registered successfully', plugin);
    } catch (error: any) {
        await Logger('registerNewPlugin', error);
        return sendResponse(res, 500, false, 'Failed to register plugin');
    }
};
