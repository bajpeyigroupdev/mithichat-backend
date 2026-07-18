import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { getHostLevels } from '../controllers/callController';
import { config } from '../configs/envConfig';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const test = async () => {
    try {
        await mongoose.connect(config.MONGO_URI as string);
        console.log('Connected to DB');

        // Mock express request & response
        const req = {
            user: {
                id: '69f6b57c90b0a342e0fed1b1',
                role: 'host'
            }
        } as any;

        let statusVal = 0;
        let responseJson: any = null;

        const res = {
            status: (code: number) => {
                statusVal = code;
                return res;
            },
            json: (data: any) => {
                responseJson = data;
                return res;
            }
        } as any;

        await getHostLevels(req, res);

        console.log('Status Code:', statusVal);
        console.log('Response JSON:', JSON.stringify(responseJson, null, 2));

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

test();
