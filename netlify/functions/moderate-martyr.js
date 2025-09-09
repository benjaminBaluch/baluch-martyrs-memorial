// Moderate martyrs with Firebase
import admin from 'firebase-admin';
import { getFirestore, handleError, successResponse, handleCORS } from './lib/database.js';

export const handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return handleCORS();
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const db = getFirestore();
    const { action, martyrId } = JSON.parse(event.body);

    if (!action || !martyrId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Action and martyrId are required' }),
      };
    }

    const martyrRef = db.collection('martyrs').doc(martyrId);
    const martyrDoc = await martyrRef.get();

    if (!martyrDoc.exists || martyrDoc.data().status !== 'pending') {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Pending martyr not found' }),
      };
    }

    if (action === 'approve') {
      // Approve the martyr
      await martyrRef.update({
        status: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return successResponse({
        success: true,
        message: 'Martyr approved successfully',
        action: 'approved',
        martyrId
      });

    } else if (action === 'reject') {
      // Delete the rejected martyr
      await martyrRef.delete();

      return successResponse({
        success: true,
        message: 'Martyr rejected and deleted',
        action: 'rejected',
        martyrId
      });

    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid action. Use "approve" or "reject"' }),
      };
    }

  } catch (error) {
    return handleError(error);
  }
};
