import { Organization } from '../models/organization.model';
import { PluginManifest } from '../models/plugin.model';
import { SecurityPolicy } from '../models/securityPolicy.model';
import { Logger } from '../utils/logger';

export async function createSystemConfigurationBackup() {
    try {
        const [orgs, plugins, security] = await Promise.all([
            Organization.find().lean(),
            PluginManifest.find().lean(),
            SecurityPolicy.find().lean()
        ]);

        const backupPayload = {
            version: '2.0.0',
            exportedAt: new Date(),
            system: 'Enterprise Operations Platform',
            data: {
                organizations: orgs,
                plugins,
                securityPolicies: security
            }
        };

        return {
            success: true,
            backupFilename: `Backup-Config-${Date.now()}.json`,
            payload: backupPayload
        };
    } catch (error: any) {
        await Logger('createSystemConfigurationBackup', error);
        return { success: false, message: 'Failed to create backup configuration' };
    }
}
