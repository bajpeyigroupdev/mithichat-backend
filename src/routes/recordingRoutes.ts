import { Router } from 'express';
import { verifyToken } from '../middlewares/authorize.middleware';
import { requireRecordingPermission } from '../middlewares/recordingPermission.middleware';
import { addRecordingNote, deleteRecording, getPlaybackUrl, getRecording, handleRecordingWebhook, listRecordings, retryRecordingProcessing, reviewRecording } from '../controllers/recordingController';

const router = Router();
router.post('/webhook', handleRecordingWebhook);
router.get('/', verifyToken, requireRecordingPermission('view'), listRecordings);
router.get('/:id', verifyToken, requireRecordingPermission('view'), getRecording);
router.post('/:id/playback', verifyToken, requireRecordingPermission('playback'), getPlaybackUrl);
router.post('/:id/notes', verifyToken, requireRecordingPermission('review'), addRecordingNote);
router.patch('/:id/review', verifyToken, requireRecordingPermission('review'), reviewRecording);
router.post('/:id/retry', verifyToken, requireRecordingPermission('review'), retryRecordingProcessing);
router.delete('/:id', verifyToken, requireRecordingPermission('delete'), deleteRecording);
export default router;
